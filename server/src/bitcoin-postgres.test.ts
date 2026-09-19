import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { createPool, type DbClient } from './db.js';
import type { AppConfig } from './config.js';
import { bitcoinAddressScript, deriveBitcoinReceivingAddress, type BitcoinSource, type BitcoinTransaction } from './bitcoin.js';
import { runBitcoinWatcherPass } from './bitcoin-watcher.js';
import { findCryptoPaymentsByTransactionHash } from './crypto-reconciliation.js';

const databaseUrl = process.env.CRUUSH_CRYPTO_WATCHER_POSTGRES_URL;
describe.skipIf(!databaseUrl)('Bitcoin settlement in PostgreSQL', () => {
  let db: DbClient;
  const users: string[] = [];
  const xpub = HDKey.fromMasterSeed(new Uint8Array(32).fill(71)).derive("m/84'/0'/0'/0").publicExtendedKey;
  beforeAll(() => {
    if (!/^\/cruush_crypto_watcher(?:_[a-z0-9]+)*$/.test(new URL(databaseUrl!).pathname)) throw new Error('Use a disposable crypto-watcher database.');
    db = createPool({ DATABASE_URL: databaseUrl! });
  });
  afterAll(async () => {
    if (!db) return;
    await db.query('delete from app_users where id = any($1::uuid[])', [users]);
    await db.end();
  });
  it.each(['cruush_plus', 'ping_pack'] as const)('grants %s once at six confirmations, including confirmation after expiry', async product => {
    const user = randomUUID(); users.push(user);
    const id = randomUUID();
    const address = deriveBitcoinReceivingAddress(xpub, users.length);
    const hash = (product === 'ping_pack' ? 'b' : 'c').repeat(64);
    const blockHash = 'a'.repeat(64);
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
    await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
      quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata)
      values($1::uuid,$2,$3,$4,'BTC','bitcoin',$5,'20000',$6,$7,'awaiting_payment',$1::text,now()+interval '1 hour',100,'{"collectionFee":{"feeUsdCents":1}}')`,
    [id, user, product === 'ping_pack' ? 'ping_3' : 'plus_monthly', product, product === 'ping_pack' ? 299 : 1899, 'f'.repeat(64), address]);
    let height = 105;
    let includePayment = true;
    const transaction: BitcoinTransaction = { txid: hash, vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 20000 }], status: { confirmed: true, block_height: 101, block_hash: blockHash, block_time: Math.floor(Date.now() / 1000) - 120 } };
    const source: BitcoinSource = { head: async () => ({ height, hash: blockHash }), blockHash: async () => blockHash,
      feeRate: async () => 1, transactions: async requested => requested === address && includePayment ? [transaction] : [] };
    const app = { db, config: {} as AppConfig };
    await runBitcoinWatcherPass(app, source);
    expect((await db.query('select status from crypto_payment_intents where id=$1', [id])).rows[0]).toMatchObject({ status: 'confirming' });
    expect((await db.query('select confirmations from crypto_bitcoin_transfers where intent_id=$1', [id])).rows[0]).toMatchObject({ confirmations: 5 });
    // Removed chain evidence must not contribute to settlement.
    includePayment = false;
    await runBitcoinWatcherPass(app, source);
    expect((await db.query('select status from crypto_bitcoin_transfers where intent_id=$1', [id])).rows[0]).toMatchObject({ status: 'reorganized' });
    includePayment = true; height = 106;
    await db.query("update crypto_payment_intents set expires_at=now()-interval '1 minute' where id=$1", [id]);
    await Promise.all([runBitcoinWatcherPass(app, source), runBitcoinWatcherPass(app, source)]);
    const order = (await db.query('select status, confirmed_amount_atomic, entitlement_granted_at from crypto_payment_intents where id=$1', [id])).rows[0];
    expect(order).toMatchObject({ status: 'paid', confirmed_amount_atomic: '20000' });
    expect(order.entitlement_granted_at).toBeTruthy();
    const table = product === 'ping_pack' ? 'ping_pack_purchases' : 'cruush_plus_subscriptions';
    expect((await db.query(`select count(*)::integer as count from ${table} where user_id=$1`, [user])).rows[0]).toMatchObject({ count: 1 });
    const record = await findCryptoPaymentsByTransactionHash(db, hash);
    expect(record[0]?.transfers[0]).toMatchObject({ transactionHash: hash, amountAtomic: '20000', confirmations: 6 });
  });
});
