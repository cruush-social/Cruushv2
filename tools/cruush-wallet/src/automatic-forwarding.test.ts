import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import * as automatic from './automatic-forwarding.js';
import { runForwardingPass } from './forwarding-worker.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { forwardingPublicConfig, prepareBitcoinForward, signAutomaticEvmBundle, descriptorFromForwardingKeys, BITCOIN_PATH, type ForwardingKeys } from './automatic-forwarding.js';
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


describe('forwarding journal recovery', () => {
  it('persists before broadcast and reuses the saved transaction after a failed pass', async () => {
    const publicConfig = forwardingPublicConfig(keys);
    const address = p2wpkh(HDKey.fromExtendedKey(publicConfig.bitcoinXpub).deriveChild(1).publicKey!).address;
    const order = { id: 'order-1', network: 'bitcoin', asset: 'BTC', derivation_index: '1', wallet_xpub_fingerprint: createHash('sha256').update(publicConfig.bitcoinXpub).digest('hex'), payment_address: address, metadata: { collectionFee: { estimatedFeeAtomic: '300' } } };
    const bundle: automatic.BitcoinForward = { kind: 'bitcoin', rawTransaction: 'fixture-bytes', transactionHash: 'a'.repeat(64), feeAtomic: '300', amountAtomic: '99700', destination: keys.bitcoinDestination };
    let saved: automatic.BitcoinForward | null = null;
    let status = 'waiting';
    const client = { query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('from crypto_payment_intents')) return { rows: status === 'confirmed' ? [] : [{ ...order, signed_bundle: saved }] };
      if (sql.includes("values ($1, 'signed'")) { saved = JSON.parse(values[1] as string); status = 'signed'; }
      if (sql.includes('update crypto_payment_collections set status')) status = values[1] as string;
      return { rows: [] };
    } } as unknown as pg.PoolClient;
    const prepare = vi.spyOn(automatic, 'prepareBitcoinForward').mockResolvedValue(bundle);
    const broadcast = vi.spyOn(automatic, 'broadcastBitcoinForward').mockImplementationOnce(async () => {
      expect(saved).toEqual(bundle);
      throw new Error('Response lost after submission');
    }).mockResolvedValue(true);
    try {
      expect(await runForwardingPass(client, keys, { CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: 'https://example.com' })).toEqual({ completed: 0, waiting: 1 });
      expect(saved).toEqual(bundle);
      expect(await runForwardingPass(client, keys, { CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: 'https://example.com' })).toEqual({ completed: 1, waiting: 0 });
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(broadcast.mock.calls[1]?.[0]).toEqual(bundle);
      expect(status).toBe('confirmed');
    } finally { prepare.mockRestore(); broadcast.mockRestore(); }
  });
});
