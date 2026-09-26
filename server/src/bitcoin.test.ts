import { cryptoFundingEstimates } from './crypto-funding-estimate.js';
import { HDKey } from '@scure/bip32';
import { describe, expect, it, vi } from 'vitest';
import { deriveBitcoinReceivingAddress, bitcoinAddressScript, quoteUsdCentsAsBitcoinAtomic, formatBitcoinAtomic, createBitcoinSource, quoteBitcoinOrder } from './bitcoin.js';
import { bitcoinOutputsForOrder } from './bitcoin-watcher.js';
import { confirmationProgress } from './crypto-payment-progress.js';
// BIP84 public test vector seed, never a funded wallet.
const seed = Buffer.from('5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4', 'hex');
const xpub = HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'/0").publicExtendedKey;
const address = 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g';
describe('native Bitcoin checkout', () => {
  it('derives BIP84 order addresses and rounds a fixed BTC quote upward', () => {
    expect(deriveBitcoinReceivingAddress(xpub, 1)).toBe(address);
    expect(deriveBitcoinReceivingAddress(xpub, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(quoteUsdCentsAsBitcoinAtomic(1899, 10_000_000)).toBe('18990');
    expect(quoteUsdCentsAsBitcoinAtomic(1, 7_000_000)).toBe('15');
    expect(formatBitcoinAtomic('18990')).toBe('0.00018990');
    expect(() => deriveBitcoinReceivingAddress(xpub, 2 ** 31)).toThrow();
  });
  it('counts canonical confirmations and excludes another address or replacement history', () => {
    const hash = 'a'.repeat(64);
    const tx = { txid: 'b'.repeat(64), vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 18990 }], status: { confirmed: true, block_height: 101, block_time: 1_800_000_000, block_hash: hash } };
    expect(bitcoinOutputsForOrder(tx, address, 105, 100, hash)[0]?.confirmations).toBe(5);
    expect(bitcoinOutputsForOrder(tx, address, 106, 100, hash)[0]?.confirmations).toBe(6);
    expect(bitcoinOutputsForOrder(tx, address, 106, 100, 'c'.repeat(64))).toEqual([]);
    expect(bitcoinOutputsForOrder(tx, deriveBitcoinReceivingAddress(xpub, 2), 106, 100, hash)).toEqual([]);
    expect(confirmationProgress([{ amount_atomic: '18990', confirmations: 6 }, { amount_atomic: '1', confirmations: 0 }], '18990', 6)).toEqual({ confirmations: 6, confirmationTarget: 6, paymentAmountReceived: true });
    expect(confirmationProgress([{ amount_atomic: '100', confirmations: 6 }], '18990', 6).paymentAmountReceived).toBe(false);
  });
  it('rejects data from another Bitcoin network', async () => {
    const source = createBitcoinSource('https://example.com/api', async () => new Response('0'.repeat(64)));
    await expect(source.head()).rejects.toThrow(/wrong network/);
  });
});

it('keeps the sending allowance out of the required payment and scales balance guidance', () => {
  const small = cryptoFundingEstimates({ rail: 'btc_bitcoin', amountUsdCents: 1899, gasFeeUsdCents: 1, quotedAmountAtomic: '19000' });
  expect(small).toHaveLength(3);
  expect(small.map(row => row.meetsSendingMinimum)).toEqual([true, false, false]);
  expect(cryptoFundingEstimates({ rail: 'pyusd_ethereum', amountUsdCents: 299, gasFeeUsdCents: 1, quotedAmountAtomic: '3000000' })[0]?.meetsSendingMinimum).toBe(false);
  expect(small[0]).toMatchObject({ allowanceUsdCents: 500, availableUsdCents: 2400, availableAtomic: '24000', estimated: true });
  expect(cryptoFundingEstimates({ rail: 'pyusd_arbitrum', amountUsdCents: 11999, gasFeeUsdCents: 1, quotedAmountAtomic: '120000000' })[0]?.allowanceUsdCents).toBe(1200);
  expect(cryptoFundingEstimates({ rail: 'usdc_base', amountUsdCents: 1899, gasFeeUsdCents: 1, quotedAmountAtomic: '19000000' })).toEqual([]);
});

it('narrows Bitcoin guidance to the app the order was started from', () => {
  const order = { rail: 'btc_bitcoin', amountUsdCents: 1899, gasFeeUsdCents: 1, quotedAmountAtomic: '19000' };
  // 19,000 satoshis clears Cash App's 5,000 but not the 100,000 PayPal and Venmo require.
  expect(cryptoFundingEstimates({ ...order, sendingApp: 'cash_app' }).map(row => [row.app, row.meetsSendingMinimum])).toEqual([['Cash App', true]]);
  expect(cryptoFundingEstimates({ ...order, sendingApp: 'paypal' }).map(row => [row.app, row.meetsSendingMinimum, row.minimumSendAtomic])).toEqual([['PayPal', false, '100000']]);
  expect(cryptoFundingEstimates({ ...order, sendingApp: 'venmo' }).map(row => [row.app, row.meetsSendingMinimum])).toEqual([['Venmo', false]]);
  // A wallet has no app minimum and gets no app guidance.
  expect(cryptoFundingEstimates({ ...order, sendingApp: 'wallet' })).toEqual([]);
  // An order recorded before the app was stored keeps every app's guidance.
  expect(cryptoFundingEstimates({ ...order, sendingApp: null }).map(row => row.app)).toEqual(['Cash App', 'PayPal', 'Venmo']);
  // A stablecoin rail belongs to one app whatever was recorded.
  expect(cryptoFundingEstimates({ rail: 'pyusd_arbitrum', sendingApp: 'paypal', amountUsdCents: 11999, gasFeeUsdCents: 1, quotedAmountAtomic: '120000000' }).map(row => row.app)).toEqual(['PayPal']);
});

it('requires both public explorers and shares fresh agreed reads across checkout calls', async () => {
  const calls: string[] = [];
  const hash = 'a'.repeat(64);
  const fetcher: typeof fetch = async input => {
    const url = String(input); calls.push(url);
    const path = url.replace(/^https:\/\/(?:blockstream\.info|mempool\.space)\/api\//, '');
    if (path === 'block-height/0') return new Response('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
    if (path === 'blocks/tip/height') return new Response('900000');
    if (path === 'block-height/900000') return new Response(hash);
    if (path === `block/${hash}`) return Response.json({ id: hash, height: 900000, timestamp: Math.floor(Date.now()/1000) });
    if (path === 'fee-estimates') return Response.json({ '1': 2 });
    throw new Error('Unexpected request');
  };
  const one = createBitcoinSource('https://blockstream.info/api', fetcher);
  const two = createBitcoinSource('https://blockstream.info/api', fetcher);
  expect(await Promise.all([one.head(), two.head()])).toEqual([{ height: 900000, hash }, { height: 900000, hash }]);
  expect(calls).toHaveLength(8);
  expect(await one.feeRate()).toBe(2);
  expect(await two.feeRate()).toBe(2);
  expect(calls).toHaveLength(10);
  // Reorg validation must read again, even at the cached head's height.
  await one.blockHash(900000);
  await two.blockHash(900000);
  expect(calls).toHaveLength(14);
});

it('rejects a fabricated public-explorer head instead of trusting the first responder', async () => {
  const honestHash = 'a'.repeat(64);
  const fabricatedHash = 'b'.repeat(64);
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    const fabricated = url.startsWith('https://blockstream.info/');
    const path = url.replace(/^https:\/\/(?:blockstream\.info|mempool\.space)\/api\//, '');
    if (path === 'block-height/0') return new Response('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
    if (path === 'blocks/tip/height') return new Response('900000');
    if (path === 'block-height/900000') return new Response(fabricated ? fabricatedHash : honestHash);
    if (path === `block/${fabricatedHash}`) return Response.json({ id: fabricatedHash, height: 900000, timestamp: Math.floor(Date.now() / 1000) });
    if (path === `block/${honestHash}`) return Response.json({ id: honestHash, height: 900000, timestamp: Math.floor(Date.now() / 1000) });
    throw new Error(`Unexpected request: ${url}`);
  };
  const source = createBitcoinSource('https://blockstream.info/api', fetcher);
  await expect(source.head()).rejects.toThrow(/agree|unavailable/i);
});

it('does not expose a payment reported by only one public explorer', async () => {
  const hash = 'a'.repeat(64);
  const transaction = { txid: 'b'.repeat(64), vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 18990 }], status: { confirmed: true, block_height: 899995, block_time: Math.floor(Date.now() / 1000), block_hash: hash } };
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    if (url.includes(`/address/${address}/txs`)) return Response.json(url.startsWith('https://blockstream.info/') ? [transaction] : []);
    throw new Error(`Unexpected request: ${url}`);
  };
  const source = createBitcoinSource('https://blockstream.info/api', fetcher);
  expect(await source.transactions(address, 899000)).toEqual([]);
});

it('backs off when both public explorers fail and never invents a chain head', async () => {
  let calls = 0;
  const source = createBitcoinSource('https://blockstream.info/api', async () => { calls++; return new Response('', { status: 429 }); });
  await expect(source.head()).rejects.toThrow('Bitcoin network data');
  await expect(source.head()).rejects.toThrow('Bitcoin network data');
  expect(calls).toBe(2);
});

it('never sends a custom provider request to a public fallback', async () => {
  const urls: string[] = [];
  const source = createBitcoinSource('https://private.example/api', async input => { urls.push(String(input)); return new Response('', { status: 503 }); });
  await expect(source.head()).rejects.toThrow();
  expect(urls).toEqual(['https://private.example/api/block-height/0']);
});


it('returns a bounded provider retry interval and retries after its cooldown', async () => {
  vi.useFakeTimers();
  let healthy = false;
  const hash = 'a'.repeat(64);
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (!healthy) return new Response('', { status: 429 });
    const url = String(input);
    if (url.endsWith('/block-height/0')) return new Response('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
    if (url.endsWith('/blocks/tip/height')) return new Response('900000');
    if (url.endsWith('/block-height/900000')) return new Response(hash);
    if (url.endsWith(`/block/${hash}`)) return Response.json({id: hash, height: 900000, timestamp: Math.floor(Date.now()/1000)});
    throw new Error('Unexpected request');
  });
  try {
    const source = createBitcoinSource('https://blockstream.info/api', fetcher);
    await expect(source.head()).rejects.toMatchObject({code:'CRYPTO_CHAIN_SOURCE_UNAVAILABLE', details:{retryAfterSeconds:30}});
    await vi.advanceTimersByTimeAsync(5000);
    await expect(source.head()).rejects.toMatchObject({details:{retryAfterSeconds:25}});
    expect(fetcher).toHaveBeenCalledTimes(2);
    healthy = true;
    await vi.advanceTimersByTimeAsync(25000);
    expect(await source.head()).toEqual({height:900000,hash});
  } finally { vi.useRealTimers(); }
});


it('expires shared head and fee caches at 10 and 30 seconds and preserves the one-sat fee floor', async () => {
  vi.useFakeTimers();
  const hash = 'a'.repeat(64);
  const paths: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input); paths.push(url);
    if (url.endsWith('/block-height/0')) return new Response('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
    if (url.endsWith('/blocks/tip/height')) return new Response('900000');
    if (url.endsWith('/block-height/900000')) return new Response(hash);
    if (url.endsWith(`/block/${hash}`)) return Response.json({id:hash,height:900000,timestamp:Math.floor(Date.now()/1000)});
    if (url.endsWith('/fee-estimates')) return Response.json({'1':0.2});
    if (url.includes('api.coinbase.com')) return Response.json({data:{base:'BTC',currency:'USD',amount:'80000.00'}});
    throw new Error('Unexpected request');
  };
  try {
    const source = createBitcoinSource('https://blockstream.info/api',fetcher);
    await source.head(); await source.feeRate();
    await vi.advanceTimersByTimeAsync(9999);
    await source.head(); await source.feeRate();
    expect(paths.filter(url=>url.endsWith('/blocks/tip/height'))).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); await source.head();
    expect(paths.filter(url=>url.endsWith('/blocks/tip/height'))).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(19999); await source.feeRate();
    expect(paths.filter(url=>url.endsWith('/fee-estimates'))).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); await source.feeRate();
    expect(paths.filter(url=>url.endsWith('/fee-estimates'))).toHaveLength(4);
    const quote = await quoteBitcoinOrder({CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL:'https://blockstream.info/api'} as never,299,fetcher);
    expect(quote).toMatchObject({quotedAmountAtomic:'3888',collectionFee:{feeRateSatPerVbyte:1,estimatedFeeAtomic:'150',feeUsdCents:12,btcUsdCents:8000000}});
  } finally { vi.useRealTimers(); }
});
