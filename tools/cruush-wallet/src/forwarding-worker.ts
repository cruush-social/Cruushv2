/** Automatically collects settled orders into the owner's cold wallet. */
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { getAddress } from 'viem';
import { HDKey } from '@scure/bip32';
import { p2wpkh } from '@scure/btc-signer';
import { BitcoinSourceError, bitcoinForwardBelowRelayMinimum, bitcoinForwardReplacementInputs, broadcastBitcoinForward, descriptorFromForwardingKeys, forwardingPublicConfig, prepareBitcoinForward, readForwardingKeys, signAutomaticEvmBundle, summarizeNodeReason, type BitcoinForward, type ForwardingKeys } from './automatic-forwarding.js';
import { createOperatorWalletRpc, prepareWalletSweepPlanBundle, parseSignedWalletSweepBundle, broadcastSignedWalletSweepBundle, type OperatorWalletRpc, type SignedWalletSweepBundle } from './wallet-rpc.js';
import { getOperatorWalletRail } from './networks.js';
import { deriveAddressFromReceiveChainXpub } from './wallet.js';

type Order = { id: string; network: string; asset: string; derivation_index: string; wallet_xpub_fingerprint: string; payment_address: string; last_error_code: string | null; metadata: { collectionFee?: { estimatedCostWei?: string; estimatedFeeAtomic?: string } } };
const endpoints: Record<string, string> = { base: 'CRYPTO_PROCESSOR_BASE_RPC_URL', ethereum: 'CRYPTO_PROCESSOR_ETHEREUM_RPC_URL', arbitrum: 'CRYPTO_PROCESSOR_ARBITRUM_RPC_URL', bitcoin: 'CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL' };
type Bundle = BitcoinForward | SignedWalletSweepBundle;
const REJECTED_PREFIX = 'collection_rejected:';

export function verifyForwardingOrder(keys: ForwardingKeys, order: Order) {
  const config = forwardingPublicConfig(keys);
  const index = Number(order.derivation_index);
  if (!Number.isSafeInteger(index) || index < 1 || index >= 2 ** 31) throw new Error('Invalid receiving address index.');
  const xpub = order.network === 'bitcoin' ? config.bitcoinXpub : config.evmXpub;
  const fingerprint = createHash('sha256').update(xpub).digest('hex');
  if (fingerprint !== order.wallet_xpub_fingerprint) throw new Error('Order belongs to another processor wallet.');
  if (order.network === 'bitcoin') {
    const root = HDKey.fromExtendedKey(xpub);
    const child = root.deriveChild(index);
    if (order.asset !== 'BTC' || !child.publicKey || p2wpkh(child.publicKey).address !== order.payment_address) throw new Error('Bitcoin order address mismatch.');
  } else if (getAddress(deriveAddressFromReceiveChainXpub(xpub, index)) !== getAddress(order.payment_address)) throw new Error('Order address mismatch.');
  return index;
}

async function prepareEvm(keys: ForwardingKeys, order: Order, index: number, endpointUrl: string) {
  const rail = getOperatorWalletRail(`${order.asset.toLowerCase()}_${order.network}`);
  const rpc = createOperatorWalletRpc({ endpointUrl });
  let additionalFees = 0n;
  const quotingRpc: OperatorWalletRpc = { ...rpc, async estimateAdditionalFeeReserve(input) { const fee = await rpc.estimateAdditionalFeeReserve(input); additionalFees += fee; return fee; } };
  const plan = await prepareWalletSweepPlanBundle({ descriptor: descriptorFromForwardingKeys(keys), ellipal: true, rail: rail.id, derivationIndex: index, rpc: quotingRpc });
  const feeBudget = order.metadata.collectionFee?.estimatedCostWei;
  if (!feeBudget || !/^\d+$/.test(feeBudget)) throw new Error('Order has no customer-funded collection budget.');
  const maximumFee = additionalFees + plan.tokenSweepPlan.gasLimit * plan.tokenSweepPlan.maxFeePerGas + (plan.gasFundingPlan ? plan.gasFundingPlan.gasLimit * plan.gasFundingPlan.maxFeePerGas : 0n);
  if (maximumFee > BigInt(feeBudget)) throw new Error('Collection is waiting for the customer-funded fee budget.');
  return signAutomaticEvmBundle(keys, plan);
}

export async function runForwardingPass(client: pg.PoolClient, keys: ForwardingKeys, env: NodeJS.ProcessEnv = process.env) {
  // One process per wallet/network owns treasury nonces, including after a restart.
  const fingerprint = descriptorFromForwardingKeys(keys).xpubFingerprint;
  let completed = 0;
  let waiting = 0;
  const notes: string[] = [];
  for (const [network, endpointName] of Object.entries(endpoints)) {
    const endpoint = env[endpointName];
    if (!endpoint) continue;
    const lockName = `cruush-forward:${fingerprint}:${network}`;
    const lock = await client.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as locked', [lockName]);
    if (!lock.rows[0]?.locked) continue;
    try {
      const orders = await client.query<Order & { signed_bundle: Bundle | null }>(`select i.id, i.network, i.asset, i.derivation_index, i.wallet_xpub_fingerprint, i.payment_address, i.metadata, c.signed_bundle, c.last_error_code
        from crypto_payment_intents i left join crypto_payment_collections c on c.intent_id = i.id
        where i.network = $1 and i.status = 'paid'
          and (c.status is null or c.status <> 'confirmed')
        order by (c.signed_bundle is not null) desc, i.created_at asc limit 100`, [network]);
      for (const order of orders.rows) {
        try {
          const index = verifyForwardingOrder(keys, order);
          let bundle = order.signed_bundle;
          if (!bundle) {
            bundle = network === 'bitcoin'
              ? await prepareBitcoinForward(keys, index, order.metadata.collectionFee?.estimatedFeeAtomic ?? '', endpoint)
              : await prepareEvm(keys, order, index, endpoint);
            // Commit exact signed bytes before submitting. A restart rebroadcasts the same transaction.
            await client.query(`insert into crypto_payment_collections(intent_id, status, signed_bundle)
              values ($1, 'signed', $2::jsonb) on conflict (intent_id) do update
              set status = 'signed', signed_bundle = excluded.signed_bundle, updated_at = now()
              where crypto_payment_collections.signed_bundle is null`, [order.id, JSON.stringify(bundle)]);
          }
          let confirmed: boolean;
          if (network === 'bitcoin') {
            if (bundle.kind !== 'bitcoin') throw new Error('Wrong saved collection type.');
            let bitcoin = bundle;
            // Saved bytes the network will never accept are dead weight. Replacing them is
            // only safe once the source proves it has never seen this transaction and that
            // every input it spends is still unspent.
            if (bitcoinForwardBelowRelayMinimum(bitcoin) || (order.last_error_code ?? '').startsWith(REJECTED_PREFIX)) {
              const inputs = await bitcoinForwardReplacementInputs(bitcoin, keys, endpoint);
              if (inputs) {
                const replacement = await prepareBitcoinForward(keys, index, order.metadata.collectionFee?.estimatedFeeAtomic ?? '', endpoint, fetch, { minimumFeeAtomic: BigInt(bitcoin.feeAtomic) + 1n, onlyInputs: inputs });
                // Swapping only the exact bundle this pass checked keeps a second pass from
                // overwriting a transaction that has since been accepted.
                const swapped = await client.query(`update crypto_payment_collections set status = 'signed', signed_bundle = $2::jsonb, last_error_code = null, updated_at = now()
                  where intent_id = $1 and signed_bundle->>'transactionHash' = $3`, [order.id, JSON.stringify(replacement), bitcoin.transactionHash]);
                if (swapped.rowCount !== 1) throw new Error('Another pass replaced this collection.');
                bitcoin = replacement;
              }
            }
            const result = await broadcastBitcoinForward(bitcoin, keys, endpoint);
            if (!result.accepted) {
              waiting++;
              notes.push(`collection rejected by the Bitcoin node: ${result.reason}`);
              await client.query(`insert into crypto_payment_collections(intent_id, status, last_error_code)
                values ($1, 'waiting', $2) on conflict (intent_id) do update
                set status = 'waiting', last_error_code = $2, updated_at = now()`, [order.id, `${REJECTED_PREFIX}${result.reason}`]);
              continue;
            }
            confirmed = result.confirmed;
          } else {
            if (bundle.kind === 'bitcoin') throw new Error('Wrong saved collection type.');
            const checked = await parseSignedWalletSweepBundle(bundle, descriptorFromForwardingKeys(keys));
            // The cold recipient remains pinned even for an existing saved transaction.
            if (checked.tokenSweepTransaction.recipientAddress !== forwardingPublicConfig(keys).evmDestination) throw new Error('Wrong collection destination.');
            await broadcastSignedWalletSweepBundle(createOperatorWalletRpc({ endpointUrl: endpoint }), checked);
            confirmed = true;
          }
          await client.query(`update crypto_payment_collections set status = $2, updated_at = now(),
            confirmed_at = case when $2 = 'confirmed' then now() else null end, last_error_code = null where intent_id = $1`, [order.id, confirmed ? 'confirmed' : 'broadcast']);
          if (confirmed) completed++; else waiting++;
        } catch (error) {
          waiting++;
          // Never persist private keys, signed bytes or URLs in error logs. The reason a
          // collection is stuck is kept short and readable so an operator can act on it.
          const detail = summarizeNodeReason(error instanceof BitcoinSourceError ? error.reason : String((error as Error | undefined)?.message ?? ''));
          const code = `collection_retry:${detail}`;
          notes.push(`collection held: ${detail}`);
          await client.query(`insert into crypto_payment_collections(intent_id, status, last_error_code)
            values ($1, 'waiting', $2) on conflict (intent_id) do update
            set last_error_code = $2, updated_at = now()`, [order.id, code]);
          // Do not allocate a later treasury nonce while a preceding signed transfer is unresolved.
          if (network !== 'bitcoin') break;
        }
      }
    } finally { await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockName]); }
  }
  return { completed, waiting, notes };
}

export async function startAutomaticForwarding(filePath: string) {
  const keys = await readForwardingKeys(filePath);
  if (!process.env.DATABASE_URL) throw new Error('Automatic forwarding requires DATABASE_URL.');
  if (!Object.values(endpoints).some(name => process.env[name])) throw new Error('Automatic forwarding requires a configured network endpoint.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let running = true;
  const stop = () => { running = false; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    while (running) {
      const client = await pool.connect();
      try {
        const result = await runForwardingPass(client, keys);
        process.stdout.write(`Automatic forwarding: ${result.completed} collected, ${result.waiting} awaiting network or fee budget.\n`);
        for (const note of result.notes) process.stderr.write(`Automatic forwarding: ${note}.\n`);
      } catch { process.stderr.write('Automatic forwarding could not finish this pass; it will retry.\n'); }
      finally { client.release(); }
      if (running) await delay(15000);
    }
  } finally { keys.evmReceiveChainXprv = ''; keys.bitcoinReceiveChainXprv = ''; await pool.end(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
