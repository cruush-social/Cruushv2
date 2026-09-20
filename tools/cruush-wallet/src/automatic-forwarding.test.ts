import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import * as automatic from './automatic-forwarding.js';
import { runForwardingPass } from './forwarding-worker.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { bitcoinForwardFeeRate, broadcastBitcoinForward, bitcoinForwardReplacementInputs, forwardingPublicConfig, prepareBitcoinForward, signAutomaticEvmBundle, descriptorFromForwardingKeys, BITCOIN_PATH, type BitcoinForward, type ForwardingKeys } from './automatic-forwarding.js';
import { prepareWalletSweepPlanBundle, parseSignedWalletSweepBundle, type OperatorWalletRpc } from './wallet-rpc.js';
import { ELLIPAL_DESTINATION } from './constants.js';
// Public, deliberately unfunded test mnemonic.
const root = HDKey.fromMasterSeed(mnemonicToSeedSync('test test test test test test test test test test test junk'));
const keys: ForwardingKeys = { version: 1, evmReceiveChainXprv: root.derive("m/44'/60'/0'/0").privateExtendedKey, bitcoinReceiveChainXprv: root.derive(BITCOIN_PATH).privateExtendedKey, bitcoinDestination: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' };
describe('automatic cold-wallet forwarding', () => {
  it('signs a real EVM transfer only to the pinned cold destination', async () => {
    const rpc = { getChainId: async () => 8453, getTransactionCount: async () => 0n, getNativeBalance: async () => 10n ** 18n, getTokenBalance: async () => 20_000_000n, estimateAdditionalFeeReserve: async () => 0n, getFeeQuote: async () => ({ maxFeePerGas: 1000000n, maxPriorityFeePerGas: 100n }), estimateGas: async () => 50000n } as OperatorWalletRpc;
    const descriptor = descriptorFromForwardingKeys(keys);
    const plan = await prepareWalletSweepPlanBundle({ descriptor, ellipal: true, rail: 'usdc_base', derivationIndex: 1, rpc });
    const signed = await signAutomaticEvmBundle(keys, plan);
    const verified = await parseSignedWalletSweepBundle(signed, descriptor);
    expect(verified.tokenSweepTransaction.recipientAddress).toBe(ELLIPAL_DESTINATION);
    expect(verified.tokenSweepTransaction.amountAtomic).toBe('20000000');
    await expect(signAutomaticEvmBundle(keys, { ...plan, tokenSweepPlan: { ...plan.tokenSweepPlan, destinationAddress: descriptor.treasuryAddress as `0x${string}` } })).rejects.toThrow(/pinned/);
  });
  it('signs Bitcoin to ELLIPAL with customer-funded fees and holds when the budget is insufficient', async () => {
    const child = HDKey.fromExtendedKey(keys.bitcoinReceiveChainXprv).deriveChild(1);
    const payment = p2wpkh(child.publicKey!);
    const prior = new Transaction();
    prior.addInput({ txid: '1'.repeat(64), index: 0 });
    prior.addOutputAddress(payment.address!, 100000n);
    const raw = Buffer.from(prior.toBytes(true, false)).toString('hex');
    const priorId = Transaction.fromRaw(Buffer.from(raw, 'hex')).id;
    const block = 'a'.repeat(64);
    const routes: Record<string, unknown> = { 'block-height/0': '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'blocks/tip/height': '106', 'block-height/106': block, 'block-height/101': block, [`address/${payment.address}/utxo`]: [{ txid: priorId, vout: 0, value: 100000, status: { confirmed: true, block_height: 101, block_hash: block } }], [`tx/${priorId}/hex`]: raw, 'fee-estimates': { '1': 2 } };
    const fetcher: typeof fetch = async input => { const value = routes[String(input).replace('https://example.com/', '')]; if (value === undefined) return new Response('', { status: 404 }); return new Response(typeof value === 'string' ? value : JSON.stringify(value)); };
    const signed = await prepareBitcoinForward(keys, 1, '300', 'https://example.com', fetcher);
    const tx = Transaction.fromRaw(Buffer.from(signed.rawTransaction, 'hex'));
    expect(tx.getOutputAddress(0)).toBe(keys.bitcoinDestination);
    expect(BigInt(signed.amountAtomic) + BigInt(signed.feeAtomic)).toBe(100000n);
    expect(tx.isFinal).toBe(true);
    await expect(prepareBitcoinForward(keys, 1, '1', 'https://example.com', fetcher)).rejects.toThrow(/fee budget/);
    expect(forwardingPublicConfig(keys).evmDestination).toBe(ELLIPAL_DESTINATION);
  });
});


const child = HDKey.fromExtendedKey(keys.bitcoinReceiveChainXprv).deriveChild(1);
const payment = p2wpkh(child.publicKey!);

/** A confirmed deposit to the index-1 receiving address, as the source reports it. */
function deposit(value: number) {
  const prior = new Transaction();
  prior.addInput({ txid: '1'.repeat(64), index: 0 });
  prior.addOutputAddress(payment.address!, BigInt(value));
  const raw = Buffer.from(prior.toBytes(true, false)).toString('hex');
  return { raw, txid: Transaction.fromRaw(Buffer.from(raw, 'hex')).id, value };
}

/** Signs a collection at an arbitrary fee, the way the unfloored estimator used to. */
function collectionAtFee(source: ReturnType<typeof deposit>, fee: bigint): BitcoinForward {
  const tx = new Transaction();
  tx.addInput({ txid: source.txid, index: 0, witnessUtxo: { script: payment.script, amount: BigInt(source.value) } });
  tx.addOutputAddress(keys.bitcoinDestination, BigInt(source.value) - fee);
  tx.sign(child.privateKey!);
  tx.finalize();
  return { kind: 'bitcoin', rawTransaction: tx.hex, transactionHash: tx.id, feeAtomic: fee.toString(), amountAtomic: (BigInt(source.value) - fee).toString(), destination: keys.bitcoinDestination };
}

const block = 'a'.repeat(64);
function sourceRoutes(source: ReturnType<typeof deposit>, feeRate: number): Record<string, unknown> {
  return {
    'block-height/0': '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
    'blocks/tip/height': '106', 'block-height/106': block, 'block-height/101': block,
    [`address/${payment.address}/utxo`]: [{ txid: source.txid, vout: 0, value: source.value, status: { confirmed: true, block_height: 101, block_hash: block } }],
    [`tx/${source.txid}/hex`]: source.raw,
    [`tx/${source.txid}/outspend/0`]: { spent: false },
    'fee-estimates': { '1': feeRate }
  };
}

/** Routes a fake Esplora. Anything unlisted answers 404, as the real source does. */
function sourceFetcher(routes: Record<string, unknown>, posts: string[] = []): typeof fetch {
  return async (input, init) => {
    const path = String(input).replace('https://example.com/', '');
    if (init?.method === 'POST') {
      posts.push(String(init.body));
      const route = routes['POST tx'];
      if (typeof route === 'function') return (route as (body: string) => Response)(String(init.body));
      return new Response(Transaction.fromRaw(Buffer.from(String(init.body), 'hex')).id);
    }
    const value = routes[path];
    if (value === undefined) return new Response('Transaction not found', { status: 404 });
    return new Response(typeof value === 'string' ? value : JSON.stringify(value));
  };
}

function forwardingOrder(extra: Record<string, unknown> = {}) {
  const publicConfig = forwardingPublicConfig(keys);
  return { id: 'order-1', network: 'bitcoin', asset: 'BTC', derivation_index: '1', wallet_xpub_fingerprint: createHash('sha256').update(publicConfig.bitcoinXpub).digest('hex'), payment_address: payment.address, metadata: { collectionFee: { estimatedFeeAtomic: '300' } }, last_error_code: null, ...extra };
}

/** A collections table small enough to assert on. */
function journal(order: Record<string, unknown>, initial: { status: string; bundle: BitcoinForward | null; lastErrorCode: string | null }) {
  const row = { ...initial };
  const client = { query: async (sql: string, values: unknown[] = []) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.includes('from crypto_payment_intents')) return { rows: row.status === 'confirmed' ? [] : [{ ...order, signed_bundle: row.bundle, last_error_code: row.lastErrorCode }] };
    if (sql.includes("values ($1, 'signed'")) { row.bundle = JSON.parse(values[1] as string); row.status = 'signed'; row.lastErrorCode = null; return { rows: [], rowCount: 1 }; }
    if (sql.includes("set status = 'signed', signed_bundle")) {
      if (row.bundle?.transactionHash !== values[2]) return { rows: [], rowCount: 0 };
      row.bundle = JSON.parse(values[1] as string); row.status = 'signed'; row.lastErrorCode = null; return { rows: [], rowCount: 1 };
    }
    if (sql.includes("values ($1, 'waiting'")) { if (sql.includes("set status = 'waiting'")) row.status = 'waiting'; row.lastErrorCode = values[1] as string; return { rows: [], rowCount: 1 }; }
    if (sql.includes('update crypto_payment_collections set status')) { row.status = values[1] as string; row.lastErrorCode = null; }
    return { rows: [], rowCount: 1 };
  } } as unknown as pg.PoolClient;
  return { client, row };
}

const esplora = { CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: 'https://example.com' };

describe('forwarding journal recovery', () => {
  it('persists before broadcast and reuses the saved transaction after a failed pass', async () => {
    const source = deposit(100000);
    const bundle = await prepareBitcoinForward(keys, 1, '300', 'https://example.com', sourceFetcher(sourceRoutes(source, 2)));
    const { client, row } = journal(forwardingOrder(), { status: 'waiting', bundle: null, lastErrorCode: null });
    const prepare = vi.spyOn(automatic, 'prepareBitcoinForward').mockResolvedValue(bundle);
    const broadcast = vi.spyOn(automatic, 'broadcastBitcoinForward').mockImplementationOnce(async () => {
      expect(row.bundle).toEqual(bundle);
      throw new Error('Response lost after submission');
    }).mockResolvedValue({ accepted: true, confirmed: true });
    try {
      expect(await runForwardingPass(client, keys, esplora)).toMatchObject({ completed: 0, waiting: 1 });
      expect(row.bundle).toEqual(bundle);
      expect(await runForwardingPass(client, keys, esplora)).toMatchObject({ completed: 1, waiting: 0 });
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(broadcast.mock.calls[1]?.[0]).toEqual(bundle);
      expect(row.status).toBe('confirmed');
    } finally { prepare.mockRestore(); broadcast.mockRestore(); }
  });
});

describe('Bitcoin collection fees', () => {
  it('pays the relay minimum on the signed vsize when the estimator quotes less', async () => {
    const source = deposit(10133);
    const signed = await prepareBitcoinForward(keys, 1, '179', 'https://example.com', sourceFetcher(sourceRoutes(source, 0.592)));
    const tx = Transaction.fromRaw(Buffer.from(signed.rawTransaction, 'hex'));
    // The unfloored estimate was 0.592 sat/vB on a 123-vbyte guess, which is 73 satoshis.
    expect(BigInt(signed.feeAtomic)).toBe(BigInt(Math.ceil(tx.vsize)));
    expect(BigInt(signed.feeAtomic)).toBeGreaterThan(73n);
    expect(bitcoinForwardFeeRate(signed)).toBeGreaterThanOrEqual(1);
    expect(BigInt(signed.amountAtomic) + BigInt(signed.feeAtomic)).toBe(10133n);
  });

  it('charges the signed vsize rather than the serialization guess when the estimate is higher', async () => {
    const source = deposit(100000);
    const signed = await prepareBitcoinForward(keys, 1, '300', 'https://example.com', sourceFetcher(sourceRoutes(source, 2)));
    const tx = Transaction.fromRaw(Buffer.from(signed.rawTransaction, 'hex'));
    expect(BigInt(signed.feeAtomic)).toBe(BigInt(Math.ceil(tx.vsize * 2)));
  });
});

describe('Bitcoin broadcast submission', () => {
  it('submits the transaction even though the source reports every unknown id as unconfirmed', async () => {
    const source = deposit(100000);
    const routes = sourceRoutes(source, 2);
    const bundle = await prepareBitcoinForward(keys, 1, '300', 'https://example.com', sourceFetcher(routes));
    // Esplora answers /tx/<id>/status this way for transactions it has never seen.
    routes[`tx/${bundle.transactionHash}/status`] = { confirmed: false };
    const posts: string[] = [];
    expect(await broadcastBitcoinForward(bundle, keys, 'https://example.com', sourceFetcher(routes, posts))).toEqual({ accepted: true, confirmed: false });
    expect(posts).toEqual([bundle.rawTransaction]);
    // A transaction the source really holds is not submitted twice.
    routes[`tx/${bundle.transactionHash}`] = { txid: bundle.transactionHash, status: { confirmed: true } };
    const second: string[] = [];
    expect(await broadcastBitcoinForward(bundle, keys, 'https://example.com', sourceFetcher(routes, second))).toEqual({ accepted: true, confirmed: true });
    expect(second).toEqual([]);
  });
});

describe('rejected Bitcoin broadcasts', () => {
  it('records the node reason and does not report the collection as broadcast', async () => {
    const source = deposit(100000);
    const routes = sourceRoutes(source, 2);
    routes['POST tx'] = () => new Response('sendrawtransaction RPC error -26: bad-txns-inputs-missingorspent', { status: 400 });
    const bundle = await prepareBitcoinForward(keys, 1, '300', 'https://example.com', sourceFetcher(routes));
    const { client, row } = journal(forwardingOrder(), { status: 'signed', bundle, lastErrorCode: null });
    vi.stubGlobal('fetch', sourceFetcher(routes));
    try {
      const result = await runForwardingPass(client, keys, esplora);
      expect(result).toMatchObject({ completed: 0, waiting: 1 });
      expect(result.notes.join(' ')).toContain('bad-txns-inputs-missingorspent');
      expect(row.status).toBe('waiting');
      expect(row.lastErrorCode).toBe('collection_rejected:sendrawtransaction RPC error -26: bad-txns-inputs-missingorspent');
      expect(row.bundle).toEqual(bundle);
    } finally { vi.unstubAllGlobals(); }
  });

  it('re-signs the same inputs at a higher fee instead of rebroadcasting dead bytes', async () => {
    const source = deposit(10133);
    const stale = collectionAtFee(source, 73n);
    expect(bitcoinForwardFeeRate(stale)).toBeLessThan(1);
    const posts: string[] = [];
    const fetcher = sourceFetcher(sourceRoutes(source, 0.592), posts);
    const { client, row } = journal(forwardingOrder({ metadata: { collectionFee: { estimatedFeeAtomic: '179' } } }), { status: 'broadcast', bundle: stale, lastErrorCode: null });
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(await runForwardingPass(client, keys, esplora)).toMatchObject({ completed: 0, waiting: 1 });
      expect(posts).toHaveLength(1);
      expect(posts[0]).not.toBe(stale.rawTransaction);
      const replacement = row.bundle!;
      expect(posts[0]).toBe(replacement.rawTransaction);
      expect(BigInt(replacement.feeAtomic)).toBeGreaterThan(73n);
      expect(bitcoinForwardFeeRate(replacement)).toBeGreaterThanOrEqual(1);
      const tx = Transaction.fromRaw(Buffer.from(replacement.rawTransaction, 'hex'));
      expect(tx.inputsLength).toBe(1);
      expect(Buffer.from(tx.getInput(0).txid!).toString('hex')).toBe(source.txid);
      expect(tx.getOutputAddress(0)).toBe(keys.bitcoinDestination);
      expect(row.status).toBe('broadcast');
    } finally { vi.unstubAllGlobals(); }
  });

  it('never replaces bytes the network still holds or inputs that are already spent', async () => {
    const source = deposit(10133);
    const stale = collectionAtFee(source, 73n);
    const known = sourceRoutes(source, 0.592);
    known[`tx/${stale.transactionHash}`] = { txid: stale.transactionHash, status: { confirmed: false } };
    expect(await bitcoinForwardReplacementInputs(stale, keys, 'https://example.com', sourceFetcher(known))).toBeNull();
    const spent = sourceRoutes(source, 0.592);
    spent[`tx/${source.txid}/outspend/0`] = { spent: true, txid: 'b'.repeat(64), vin: 0 };
    expect(await bitcoinForwardReplacementInputs(stale, keys, 'https://example.com', sourceFetcher(spent))).toBeNull();
    const clear = sourceRoutes(source, 0.592);
    expect(await bitcoinForwardReplacementInputs(stale, keys, 'https://example.com', sourceFetcher(clear))).toEqual([{ txid: source.txid, vout: 0 }]);
    // An unreachable source is never read as proof that a replacement is safe.
    await expect(bitcoinForwardReplacementInputs(stale, keys, 'https://example.com', sourceFetcher({}))).rejects.toThrow();
  });
});
