/** Native Bitcoin receiving and read-only chain access. No private keys or broadcasts.
 * Address format: BIP84/BIP173. API: github.com/Blockstream/esplora/blob/master/API.md.
 */
import { createHash } from 'node:crypto';
import { HDKey } from '@scure/bip32';
import { bech32 } from '@scure/base';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { ApiError } from './errors.js';
import { isValidCryptoWalletXpub } from './crypto-wallet.js';

export const BITCOIN_CONFIRMATION_TARGET = 6;
export const BITCOIN_RECEIVE_CHAIN_PATH = "m/84'/0'/0'/0";
export const BITCOIN_GENESIS_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
export const SATOSHIS_PER_BITCOIN = 100_000_000n;
const MAX_SATOSHIS = 2_100_000_000_000_000;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const statusSchema = z.object({
  confirmed: z.boolean(), block_height: z.number().int().nonnegative().optional(),
  block_hash: hashSchema.optional(), block_time: z.number().int().nonnegative().optional()
});
const transactionSchema = z.object({
  txid: hashSchema,
  vout: z.array(z.object({
    scriptpubkey: z.string().regex(/^[a-f0-9]*$/),
    scriptpubkey_address: z.string().optional(),
    value: z.number().int().min(0).max(MAX_SATOSHIS)
  })),
  status: statusSchema
});
export type BitcoinTransaction = z.infer<typeof transactionSchema>;
export type BitcoinHead = { height: number; hash: string };

export function deriveBitcoinReceivingAddress(xpub: string, index: number) {
  if (!isValidCryptoWalletXpub(xpub) || !Number.isSafeInteger(index) || index < 0 || index >= 2 ** 31) {
    throw new Error('Bitcoin receiving requires a depth-4 public xpub and a non-hardened index.');
  }
  const publicKey = HDKey.fromExtendedKey(xpub.trim()).deriveChild(index).publicKey;
  if (!publicKey) throw new Error('Bitcoin public child derivation failed.');
  const sha = createHash('sha256').update(publicKey).digest();
  const keyHash = createHash('ripemd160').update(sha).digest();
  return bech32.encode('bc', [0, ...bech32.toWords(keyHash)]);
}

export function bitcoinAddressScript(address: string) {
  const decoded = bech32.decode(address as `${string}1${string}`);
  const program = bech32.fromWords(decoded.words.slice(1));
  if (decoded.prefix !== 'bc' || decoded.words[0] !== 0 || program.length !== 20 || address !== address.toLowerCase()) {
    throw new Error('Expected a Bitcoin mainnet native SegWit receiving address.');
  }
  return `0014${Buffer.from(program).toString('hex')}`;
}

export function formatBitcoinAtomic(amount: string | bigint) {
  const sats = BigInt(amount);
  if (sats < 0n) throw new Error('Bitcoin amount must not be negative.');
  return `${sats / SATOSHIS_PER_BITCOIN}.${(sats % SATOSHIS_PER_BITCOIN).toString().padStart(8, '0')}`;
}

export function quoteUsdCentsAsBitcoinAtomic(cents: number, btcUsdCents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(btcUsdCents) || btcUsdCents <= 0) {
    throw new Error('Bitcoin quote requires positive integer USD cents.');
  }
  return ((BigInt(cents) * SATOSHIS_PER_BITCOIN + BigInt(btcUsdCents) - 1n) / BigInt(btcUsdCents)).toString();
}

export function createBitcoinSource(endpoint: string, fetcher: typeof fetch = fetch) {
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
    throw new Error('Bitcoin source requires HTTPS or a local HTTP endpoint.');
  }
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid Bitcoin source URL.');
  async function read(path: string, json = true): Promise<unknown> {
    try {
      const response = await fetcher(`${base.href.replace(/\/$/, '')}/${path}`, {
        signal: AbortSignal.timeout(10_000), redirect: 'error', headers: { Accept: json ? 'application/json' : 'text/plain' }
      });
      if (!response.ok) throw new Error('unavailable');
      return json ? await response.json() : (await response.text()).trim();
    } catch {
      throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin network data is temporarily unavailable.');
    }
  }
  async function blockHash(height: number) {
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('Invalid Bitcoin height.');
    return hashSchema.parse(await read(`block-height/${height}`, false));
  }
  return {
    blockHash,
    async head(): Promise<BitcoinHead> {
      if (await blockHash(0) !== BITCOIN_GENESIS_HASH) {
        throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin source is connected to the wrong network.');
      }
      const height = z.coerce.number().int().nonnegative().parse(await read('blocks/tip/height', false));
      const hash = await blockHash(height);
      const block = z.object({ id: hashSchema, height: z.number().int(), timestamp: z.number().int() }).parse(await read(`block/${hash}`));
      if (block.id !== hash || block.height !== height || block.timestamp * 1000 > Date.now() + 2 * 60 * 60_000 || block.timestamp * 1000 < Date.now() - 6 * 60 * 60_000) {
        throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin source has no recent verified block.');
      }
      return { height, hash };
    },
    async feeRate() {
      const estimates = z.record(z.string(), z.number().positive().finite()).parse(await read('fee-estimates'));
      // Collection targets the next block. This is a collection estimate, not a sending-app quote.
      const rate = estimates['1'];
      if (!rate || rate > 100_000) throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin fee estimate is unavailable.');
      return rate;
    },
    async transactions(address: string, origin: number) {
      bitcoinAddressScript(address);
      const result: BitcoinTransaction[] = [];
      let path = `address/${address}/txs`;
      const seen = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const batch = z.array(transactionSchema).parse(await read(path));
        for (const tx of batch) {
          if (!seen.has(tx.txid)) { result.push(tx); seen.add(tx.txid); }
        }
        const confirmed = batch.filter(tx => tx.status.confirmed);
        if (confirmed.length < 25 || confirmed.some(tx => (tx.status.block_height ?? Infinity) <= origin)) return result;
        const last = confirmed.at(-1)!;
        const next = `address/${address}/txs/chain/${last.txid}`;
        if (next === path) throw new Error('Bitcoin history did not advance.');
        path = next;
      }
      throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin history requires another monitoring pass.');
    }
  };
}
export type BitcoinSource = ReturnType<typeof createBitcoinSource>;

export async function quoteBitcoinOrder(config: AppConfig, amountUsdCents: number, fetcher: typeof fetch = fetch) {
  const source = createBitcoinSource(config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? '', fetcher);
  await source.head();
  const rate = await source.feeRate();
  let btcUsdCents: number;
  try {
    const response = await fetcher('https://api.coinbase.com/v2/prices/BTC-USD/spot', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!response.ok) throw new Error('unavailable');
    const payload = z.object({ data: z.object({ base: z.literal('BTC'), currency: z.literal('USD'), amount: z.string().regex(/^\d+(\.\d+)?$/) }) }).parse(await response.json());
    btcUsdCents = Math.round(Number(payload.data.amount) * 100);
    if (!Number.isSafeInteger(btcUsdCents) || btcUsdCents <= 0) throw new Error('invalid price');
  } catch {
    throw new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', 'Bitcoin price is temporarily unavailable.');
  }
  // One native-SegWit input, one collection output, with serialization allowance.
  // Additional fragments or later rate changes can change the eventual collection cost.
  const estimatedFeeAtomic = BigInt(Math.ceil(rate * 150));
  const feeUsdCents = Number((estimatedFeeAtomic * BigInt(btcUsdCents) + SATOSHIS_PER_BITCOIN - 1n) / SATOSHIS_PER_BITCOIN);
  return {
    quotedAmountAtomic: quoteUsdCentsAsBitcoinAtomic(amountUsdCents + feeUsdCents, btcUsdCents),
    collectionFee: { version: 2, feeUsdCents, estimatedFeeAtomic: estimatedFeeAtomic.toString(), feeRateSatPerVbyte: rate, estimatedVbytes: 150, btcUsdCents, sampledAt: new Date().toISOString() }
  };
}
