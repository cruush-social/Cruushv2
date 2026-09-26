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

function createSingleBitcoinSource(endpoint: string, fetcher: typeof fetch) {
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
// Share short-lived reads across checkout requests and the watcher. Block-height
// lookups and transaction history remain uncached so reorg checks stay fresh.
const sharedSources = new WeakMap<typeof fetch, Map<string, ReturnType<typeof resilientBitcoinSource>>>();
function resilientBitcoinSource(endpoint: string, fetcher: typeof fetch) {
  const primary = endpoint.replace(/\/$/, '');
  const publicPeers = ['https://blockstream.info/api', 'https://mempool.space/api'];
  // Only the two known public mainnet APIs are cross-checked. A custom/private
  // endpoint never sends addresses to another provider without configuration.
  const endpoints = publicPeers.includes(primary) ? [primary, ...publicPeers.filter(url => url !== primary)] : [primary];
  const providers = endpoints.map(url => ({ source: createSingleBitcoinSource(url, fetcher), retryAt: 0 }));
  function unavailable(lastError?: unknown, message = 'Bitcoin network data is temporarily unavailable.') {
    const activeRetries = providers.map(provider => provider.retryAt).filter(retryAt => retryAt > Date.now());
    const retryAfterSeconds = activeRetries.length
      ? Math.max(1, Math.ceil((Math.min(...activeRetries) - Date.now()) / 1000))
      : 1;
    return new ApiError(502, 'CRYPTO_CHAIN_SOURCE_UNAVAILABLE',
      lastError instanceof ApiError ? lastError.message : message,
      { retryAfterSeconds });
  }
  async function readAll<T>(operation: (source: ReturnType<typeof createSingleBitcoinSource>) => Promise<T>): Promise<T[]> {
    let lastError: unknown;
    const reads = providers.map(async provider => {
      if (provider.retryAt > Date.now()) throw unavailable(lastError);
      try {
        const value = await operation(provider.source);
        provider.retryAt = 0;
        return value;
      } catch (error) {
        provider.retryAt = Date.now() + 30_000;
        lastError = error;
        throw error;
      }
    });
    try { return await Promise.all(reads); }
    catch (error) { throw unavailable(error ?? lastError); }
  }
  async function agreed<T>(operation: (source: ReturnType<typeof createSingleBitcoinSource>) => Promise<T>, equal: (left: T, right: T) => boolean = (left, right) => JSON.stringify(left) === JSON.stringify(right)): Promise<T> {
    const values = await readAll(operation);
    if (values.some(value => !equal(values[0]!, value))) throw unavailable(undefined, 'Independent Bitcoin sources did not agree.');
    return values[0]!;
  }
  function cached<T>(operation: () => Promise<T>, ttl: number) {
    let pending: Promise<T> | undefined;
    let value: T;
    let expires = 0;
    return () => {
      if (expires > Date.now()) return Promise.resolve(value);
      if (pending) return pending;
      pending = operation().then(result => { value = result; expires = Date.now() + ttl; return result; }).finally(() => { pending = undefined; });
      return pending;
    };
  }
  // Every provider validates mainnet genesis, block identity and age. Public
  // providers must independently agree before their result can drive payment.
  const head = cached(async () => {
    const heads = await readAll(source => source.head());
    if (heads.length === 1) return heads[0]!;
    const heights = heads.map(value => value.height);
    const low = Math.min(...heights);
    const high = Math.max(...heights);
    if (high - low > 2) throw unavailable(undefined, 'Independent Bitcoin sources did not agree.');
    if (low === high) {
      if (heads.some(value => value.hash !== heads[0]!.hash)) throw unavailable(undefined, 'Independent Bitcoin sources did not agree.');
      return heads[0]!;
    }
    const hash = await agreed(source => source.blockHash(low));
    return { height: low, hash };
  }, 10_000);
  return {
    head,
    blockHash: (height: number) => agreed(source => source.blockHash(height)),
    feeRate: cached(async () => {
      const rates = await readAll(source => source.feeRate());
      const low = Math.min(...rates);
      const high = Math.max(...rates);
      if (rates.length > 1 && high / low > 4) throw unavailable(undefined, 'Independent Bitcoin fee sources did not agree.');
      return high;
    }, 30_000),
    transactions: async (address: string, origin: number) => {
      const histories = await readAll(source => source.transactions(address, origin));
      if (histories.length === 1) return histories[0]!;
      const peers = histories.slice(1).map(history => new Map(history.map(tx => [tx.txid, tx])));
      const agreedTransactions: BitcoinTransaction[] = [];
      for (const transaction of histories[0]!) {
        const matches = peers.map(peer => peer.get(transaction.txid));
        if (matches.some(match => match && JSON.stringify(match) !== JSON.stringify(transaction))) {
          throw unavailable(undefined, 'Independent Bitcoin sources did not agree.');
        }
        if (matches.every(match => match !== undefined)) agreedTransactions.push(transaction);
      }
      return agreedTransactions;
    },
  };
}
export interface BitcoinSource {
  head(): Promise<BitcoinHead>;
  blockHash(height: number): Promise<string>;
  feeRate(): Promise<number>;
  transactions(address: string, origin: number): Promise<BitcoinTransaction[]>;
  readonly historyMode?: "complete" | "triggered";
  hasPendingTransactions?(address: string): boolean;
  verifyTransactions?(address: string, origin: number): Promise<BitcoinTransaction[]>;
  syncAddresses?(addresses: string[]): Promise<void>;
  stop?(): void;
}

export function createBitcoinSource(endpoint: string, fetcher: typeof fetch = fetch): BitcoinSource {
  let sources = sharedSources.get(fetcher);
  if (!sources) { sources = new Map(); sharedSources.set(fetcher, sources); }
  const key = endpoint.replace(/\/$/, '');
  let source = sources.get(key);
  if (!source) { source = resilientBitcoinSource(endpoint, fetcher); sources.set(key, source); }
  return source;
}

export async function quoteBitcoinOrder(config: AppConfig, amountUsdCents: number, fetcher: typeof fetch = fetch) {
  const source = createBitcoinSource(config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? '', fetcher);
  await source.head();
  const rate = Math.max(1, await source.feeRate());
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
