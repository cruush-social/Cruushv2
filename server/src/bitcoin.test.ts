import { cryptoFundingEstimates } from './crypto-funding-estimate.js';
import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import { deriveBitcoinReceivingAddress, bitcoinAddressScript, quoteUsdCentsAsBitcoinAtomic, formatBitcoinAtomic, createBitcoinSource } from './bitcoin.js';
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
