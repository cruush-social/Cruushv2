import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './app.js';
import * as bitcoin from './bitcoin.js';
import { ApiError } from './errors.js';
import QRCode from 'qrcode';
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

  it('does not poll untouched orders in triggered mode', async () => {
    const user = randomUUID(); users.push(user);
    const id = randomUUID();
    const address = deriveBitcoinReceivingAddress(xpub, 50);
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
    await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
      quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata)
      values($1::uuid,$2,'plus_monthly','cruush_plus','BTC','bitcoin',1899,'20000',$3,$4,'awaiting_payment',$1::text,now()+interval '1 hour',100,'{"collectionFee":{"feeUsdCents":1}}')`,
    [id, user, 'f'.repeat(64), address]);
    const syncAddresses = vi.fn(async () => {});
    const head = vi.fn(async () => ({ height: 106, hash: 'a'.repeat(64) }));
    const transactions = vi.fn(async () => []);
    const source: BitcoinSource = {
      historyMode: 'triggered', syncAddresses, hasPendingTransactions: () => false,
      head, blockHash: async () => 'a'.repeat(64), feeRate: async () => 1, transactions,
    };

    await runBitcoinWatcherPass({ db, config: {} as AppConfig }, source);

    expect(syncAddresses).toHaveBeenCalledWith(expect.arrayContaining([address]));
    expect(transactions).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  it('continues persisted confirmations after a triggered-source restart and grants once', async () => {
    const user = randomUUID(); users.push(user);
    const id = randomUUID();
    const address = deriveBitcoinReceivingAddress(xpub, 51);
    const blockHash = '6'.repeat(64);
    const transaction: BitcoinTransaction = {
      txid: '7'.repeat(64),
      vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 20000 }],
      status: { confirmed: true, block_height: 101, block_hash: blockHash, block_time: Math.floor(Date.now() / 1000) - 120 },
    };
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
    await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
      quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata)
      values($1::uuid,$2,'plus_monthly','cruush_plus','BTC','bitcoin',1899,'20000',$3,$4,'awaiting_payment',$1::text,now()+interval '1 hour',100,'{"collectionFee":{"feeUsdCents":1}}')`,
    [id, user, 'f'.repeat(64), address]);
    const firstSource: BitcoinSource = {
      historyMode: 'triggered', syncAddresses: async () => {}, hasPendingTransactions: () => true,
      head: async () => ({ height: 101, hash: blockHash }), blockHash: async () => blockHash,
      feeRate: async () => 1, transactions: async requested => requested === address ? [transaction] : [],
      verifyTransactions: async requested => requested === address ? [transaction] : [],
    };

    await runBitcoinWatcherPass({ db, config: {} as AppConfig }, firstSource);
    expect((await db.query('select status from crypto_payment_intents where id=$1', [id])).rows[0]).toMatchObject({ status: 'confirming' });
    expect((await db.query('select confirmations from crypto_bitcoin_transfers where intent_id=$1', [id])).rows[0]).toMatchObject({ confirmations: 1 });

    const verifyTransactions = vi.fn(async (requested: string) => requested === address ? [transaction] : []);
    const restartedSource: BitcoinSource = {
      historyMode: 'triggered', syncAddresses: async () => {}, hasPendingTransactions: () => false,
      head: async () => ({ height: 106, hash: blockHash }), blockHash: async () => blockHash,
      feeRate: async () => 1, transactions: async () => [], verifyTransactions,
    };
    await Promise.all([
      runBitcoinWatcherPass({ db, config: {} as AppConfig }, restartedSource),
      runBitcoinWatcherPass({ db, config: {} as AppConfig }, restartedSource),
    ]);

    expect(verifyTransactions).toHaveBeenCalledWith(address, 100);
    expect((await db.query('select status, confirmed_amount_atomic, entitlement_granted_at from crypto_payment_intents where id=$1', [id])).rows[0]).toMatchObject({
      status: 'paid', confirmed_amount_atomic: '20000',
    });
    expect((await db.query('select count(*)::integer as count from cruush_plus_subscriptions where crypto_payment_intent_id=$1', [id])).rows[0]).toMatchObject({ count: 1 });
  });

  it('final-reconciles stale Bitcoin confirmations after a healthy source read', async () => {
    const blockHash = '1'.repeat(64);
    const cases = [
      { status: 'failed', value: 10000, blockHeight: 101, hash: 'd'.repeat(64) },
      { status: 'confirming', value: 20000, blockHeight: 102, hash: 'e'.repeat(64) },
      { status: 'paid', value: 20000, blockHeight: 101, hash: 'f'.repeat(64) },
    ] as const;
    const intents: Array<{ id: string; user: string; address: string; expected: typeof cases[number] }> = [];

    for (const [index, expected] of cases.entries()) {
      const user = randomUUID(); users.push(user);
      const id = randomUUID();
      const address = deriveBitcoinReceivingAddress(xpub, 100 + index);
      await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
      await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
        quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata)
        values($1::uuid,$2,'ping_3','ping_pack','BTC','bitcoin',299,'20000',$3,$4,'confirming',$1::text,now()-interval '8 days',100,'{"collectionFee":{"feeUsdCents":1}}')`,
      [id, user, 'f'.repeat(64), address]);
      intents.push({ id, user, address, expected });
    }

    const transactions = new Map(intents.map(({ address, expected }) => [address, [{
      txid: expected.hash,
      vout: [{ scriptpubkey: bitcoinAddressScript(address), value: expected.value }],
      status: {
        confirmed: true,
        block_height: expected.blockHeight,
        block_hash: blockHash,
        block_time: Math.floor(Date.now() / 1000) - 9 * 24 * 60 * 60,
      },
    } satisfies BitcoinTransaction]]));
    const source: BitcoinSource = {
      head: async () => ({ height: 106, hash: blockHash }),
      blockHash: async () => blockHash,
      feeRate: async () => 1,
      transactions: async address => transactions.get(address) ?? [],
    };

    await expect(runBitcoinWatcherPass({ db, config: {} as AppConfig }, {
      ...source,
      head: async () => { throw new Error('Injected Bitcoin source outage'); },
    })).rejects.toThrow('Injected Bitcoin source outage');
    for (const { id } of intents) {
      expect((await db.query('select status from crypto_payment_intents where id=$1', [id])).rows[0]).toMatchObject({ status: 'confirming' });
    }

    await runBitcoinWatcherPass({ db, config: {} as AppConfig }, source);

    for (const { id, expected } of intents) {
      const order = (await db.query('select status, settlement_note from crypto_payment_intents where id=$1', [id])).rows[0];
      expect(order.status).toBe(expected.status);
      if (expected.status === 'failed') expect(order.settlement_note).toMatch(/evidence was preserved/i);
    }
    expect((await db.query('select count(*)::integer as count from crypto_bitcoin_transfers where intent_id=$1', [intents[0]!.id])).rows[0]).toMatchObject({ count: 1 });
  });

  it('continues to a later Bitcoin order after one order-specific failure', async () => {
    const firstUser = randomUUID(); users.push(firstUser);
    const secondUser = randomUUID(); users.push(secondUser);
    const firstId = randomUUID();
    const secondId = randomUUID();
    const firstAddress = deriveBitcoinReceivingAddress(xpub, 199);
    const secondAddress = deriveBitcoinReceivingAddress(xpub, 200);
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test'),($3,$4,'unfunded-test')", [
      firstUser, `${firstUser}@example.test`, secondUser, `${secondUser}@example.test`,
    ]);
    await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
      quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata,created_at)
      values
        ($1::uuid,$2,'ping_3','ping_pack','BTC','bitcoin',299,'20000',$5,$6,'awaiting_payment',$1::text,now()+interval '1 hour',100,'{"collectionFee":{"feeUsdCents":1}}',now()-interval '2 minutes'),
        ($3::uuid,$4,'ping_3','ping_pack','BTC','bitcoin',299,'20000',$5,$7,'awaiting_payment',$3::text,now()+interval '1 hour',100,'{"collectionFee":{"feeUsdCents":1}}',now()-interval '1 minute')`,
    [firstId, firstUser, secondId, secondUser, 'f'.repeat(64), firstAddress, secondAddress]);
    const blockHash = '2'.repeat(64);
    const transaction: BitcoinTransaction = {
      txid: '3'.repeat(64),
      vout: [{ scriptpubkey: bitcoinAddressScript(secondAddress), value: 20000 }],
      status: { confirmed: true, block_height: 101, block_hash: blockHash, block_time: Math.floor(Date.now() / 1000) - 120 },
    };
    const source: BitcoinSource = {
      head: async () => ({ height: 106, hash: blockHash }),
      blockHash: async () => blockHash,
      feeRate: async () => 1,
      transactions: async address => {
        if (address === firstAddress) throw new Error('Injected order-specific failure');
        return address === secondAddress ? [transaction] : [];
      },
    };

    await expect(runBitcoinWatcherPass({ db, config: {} as AppConfig }, source)).rejects.toThrow();
    expect((await db.query('select status from crypto_payment_intents where id=$1', [firstId])).rows[0]).toMatchObject({ status: 'awaiting_payment' });
    expect((await db.query('select status from crypto_payment_intents where id=$1', [secondId])).rows[0]).toMatchObject({ status: 'paid' });
  });

  it('settles a timely Bitcoin payment broadcast before member cancellation', async () => {
    const user = randomUUID(); users.push(user);
    const id = randomUUID();
    const address = deriveBitcoinReceivingAddress(xpub, 300);
    const blockHash = '4'.repeat(64);
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
    await db.query(`insert into crypto_payment_intents(id,user_id,plan_id,product_type,asset,network,amount_usd_cents,
      quoted_amount_atomic,wallet_xpub_fingerprint,payment_address,status,idempotency_key,expires_at,watch_start_block,metadata,settlement_note)
      values($1::uuid,$2,'ping_3','ping_pack', 'BTC','bitcoin',299,'20000',$3,$4,'cancelled',$1::text,now()+interval '1 hour',100,
        '{"collectionFee":{"feeUsdCents":1},"cancelledBy":"member"}','Member cancelled before cruush detected payment.')`,
    [id, user, 'f'.repeat(64), address]);
    const transaction: BitcoinTransaction = {
      txid: '5'.repeat(64),
      vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 20000 }],
      status: { confirmed: true, block_height: 101, block_hash: blockHash, block_time: Math.floor(Date.now() / 1000) - 120 },
    };
    const source: BitcoinSource = {
      head: async () => ({ height: 106, hash: blockHash }),
      blockHash: async () => blockHash,
      feeRate: async () => 1,
      transactions: async requested => requested === address ? [transaction] : [],
    };

    await runBitcoinWatcherPass({ db, config: {} as AppConfig }, source);

    expect((await db.query('select status, confirmed_amount_atomic, entitlement_granted_at from crypto_payment_intents where id=$1', [id])).rows[0]).toMatchObject({
      status: 'paid', confirmed_amount_atomic: '20000',
    });
  });
});


// Real transactions and route handlers, with unfunded public fixture keys and
// controlled upstream data. No signing service or external payment is used.
describe.skipIf(!databaseUrl)('Bitcoin order creation in PostgreSQL', () => {
  let db: DbClient;
  let app: ReturnType<typeof buildServer>;
  let user: string;
  let failPublication = false;
  const xpub = HDKey.fromMasterSeed(new Uint8Array(32).fill(72)).derive("m/84'/0'/0'/0").publicExtendedKey;
  const head = vi.fn<() => Promise<bigint>>();
  let quote: ReturnType<typeof vi.spyOn>;
  const fee = { version: 2, feeUsdCents: 12, estimatedFeeAtomic: '150', feeRateSatPerVbyte: 1,
    estimatedVbytes: 150, btcUsdCents: 8000000, sampledAt: '2026-09-20T12:00:00.000Z' };
  function config(): AppConfig {
    return { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: 0, DATABASE_URL: databaseUrl,
      CORS_ORIGIN: 'http://localhost', APP_URL: 'https://cruush.test', SESSION_SECRET: 'unfunded-test',
      CRYPTO_PROCESSOR_ENABLED: true, CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
      CRYPTO_PROCESSOR_BITCOIN_WALLET_XPUB: xpub, CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: 'https://blockstream.info/api',
      CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 1440,
      CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: '', CRYPTO_PROCESSOR_BASE_RPC_URL: '', CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: ''
    } as AppConfig;
  }
  function server() {
    const wrapped: DbClient = { ...db, end: async () => {}, transaction: callback => db.transaction!(client => callback({
      ...client, query: async (sql, params) => {
        if (failPublication && sql.includes('set payment_address = $2')) throw new Error('Injected publication failure');
        return client.query(sql, params);
      }
    })) };
    return buildServer(config(), { db: wrapped, cryptoPaymentRailHeadReader: head });
  }
  beforeAll(() => {
    if (!/^\/cruush_crypto_watcher(?:_[a-z0-9]+)*$/.test(new URL(databaseUrl!).pathname)) throw new Error('Use a disposable crypto-watcher database.');
    db = createPool({ DATABASE_URL: databaseUrl! });
  });
  beforeEach(async () => {
    user = randomUUID();
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'unfunded-test')", [user, `${user}@example.test`]);
    head.mockReset().mockResolvedValue(900000n);
    quote = vi.spyOn(bitcoin, 'quoteBitcoinOrder').mockResolvedValue({ quotedAmountAtomic: '200000', collectionFee: fee });
    failPublication = false;
    app = server();
  });
  afterEach(async () => {
    await app.close(); quote.mockRestore();
    await db.query('delete from app_users where id=$1', [user]);
    await db.query('delete from rate_limit_buckets where bucket_key like $1', [`crypto-payment-intents:%:${user}`]);
  });
  afterAll(async () => { if (db) await db.end(); });
  const products = [
    ['/api/crypto/payment-intents', 'planId', 'plus_monthly', 1899],
    ['/api/crypto/ping-pack-intents', 'packId', 'ping_10', 2499]
  ] as const;
  const request = (product: readonly [string, string, string, number], key = randomUUID(), sendingApp = 'wallet') => ({
    method: 'POST' as const, url: product[0], headers: { 'x-user-id': user },
    payload: { [product[1]]: product[2], idempotencyKey: key, rail: 'btc_bitcoin', sendingApp }
  });
  async function debitCount() {
    return Number((await db.query('select attempt_count from rate_limit_buckets where bucket_key=$1', [`crypto-payment-intents:create:${user}`])).rows[0]?.attempt_count ?? 0);
  }
  async function cancel(id: string) {
    const response = await app.inject({method:'POST',url:`/api/crypto/payment-intents/${id}/cancel`,headers:{'x-user-id':user}});
    expect(response.statusCode).toBe(200);
  }
  it.each(products)('persists %s, recovers simultaneous and lost-response retries, and survives restart', async (...product) => {
    const req = request(product);
    const responses = await Promise.all([app.inject(req), app.inject(req)]);
    responses.forEach(response => expect(response.statusCode).toBe(201));
    const first = responses[0].json().data;
    expect(responses[1].json().data).toEqual(first);
    const rows = (await db.query('select * from crypto_payment_intents where user_id=$1', [user])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({payment_address:first.paymentAddress, quoted_amount_atomic:first.quotedAmountAtomic, amount_usd_cents:product[3]});
    expect(first.paymentAddress).toBe(deriveBitcoinReceivingAddress(xpub, Number(rows[0].derivation_index)));
    expect(first.paymentUri).toBe(`bitcoin:${rows[0].payment_address}?amount=0.00200000`);
    expect(first.qrCodeDataUrl).toBe(await QRCode.toDataURL(first.paymentUri, {errorCorrectionLevel:'M',margin:2,width:256}));
    expect(rows[0].metadata).toMatchObject({collectionFee:fee});
    expect(await debitCount()).toBe(1);
    await app.close(); await db.end(); db = createPool({DATABASE_URL:databaseUrl!}); app = server();
    head.mockRejectedValue(new ApiError(502,'CRYPTO_CHAIN_SOURCE_UNAVAILABLE','Source unavailable'));
    quote.mockRejectedValue(new Error('Price unavailable'));
    const replay = await app.inject(req);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data).toEqual(first);
    const compatible = await app.inject(request(product));
    expect(compatible.statusCode).toBe(201);
    expect(compatible.json().data).toEqual(first);
    expect(await debitCount()).toBe(1);
    const history = await app.inject({method:'GET',url:'/api/crypto/orders',headers:{'x-user-id':user}});
    expect(history.statusCode).toBe(200);
    expect(history.json().data.orders.some((order:{id:string}) => order.id===first.id)).toBe(true);
    const mismatch = await app.inject({...req,payload:{...req.payload,sendingApp:'cash_app'}});
    expect(mismatch.statusCode).toBe(409);
    const otherUser = randomUUID();
    const foreignRead = await app.inject({method:'GET',url:`/api/crypto/payment-intents/${first.id}`,headers:{'x-user-id':otherUser}});
    expect(foreignRead.statusCode).toBe(404);
  });
  it.each(products)('does not charge failed sources or publication, then limits five successful %s orders', async (...product) => {
    head.mockRejectedValue(new ApiError(502,'CRYPTO_CHAIN_SOURCE_UNAVAILABLE','Source unavailable',{retryAfterSeconds:30}));
    for(let i=0;i<6;i++) expect((await app.inject(request(product))).statusCode).toBe(502);
    expect(await debitCount()).toBe(0);
    head.mockResolvedValue(900000n);
    quote.mockRejectedValueOnce(new ApiError(502,'CRYPTO_CHAIN_SOURCE_UNAVAILABLE','Price unavailable'));
    expect((await app.inject(request(product))).statusCode).toBe(502);
    failPublication = true;
    expect((await app.inject(request(product))).statusCode).toBe(500);
    expect(await debitCount()).toBe(0);
    expect((await db.query('select id from crypto_payment_intents where user_id=$1',[user])).rows).toHaveLength(0);
    failPublication = false;
    const addresses = new Set<string>();
    for(let i=0;i<5;i++) {
      const response = await app.inject(request(product));
      expect(response.statusCode).toBe(201);
      addresses.add(response.json().data.paymentAddress);
      await cancel(response.json().data.id);
    }
    expect(addresses.size).toBe(5);
    expect(await debitCount()).toBe(5);
    const limited = await app.inject(request(product));
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toMatchObject({code:'RATE_LIMITED',details:{retryAfterSeconds:expect.any(Number)}});
    expect(limited.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.json().error.details.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(await debitCount()).toBe(5);
    const rows = (await db.query('select status from crypto_payment_intents where user_id=$1',[user])).rows;
    expect(rows).toHaveLength(5); expect(rows.every(row=>row.status==='cancelled')).toBe(true);
  });
  it.each([['cash_app','4999',400],['cash_app','5000',201],['paypal','99999',400],['paypal','100000',201],['venmo','99999',400],['venmo','100000',201],['wallet','1',201]] as const)(
    'enforces %s recipient boundary %s without charging rejected orders', async (sendingApp, amount, status) => {
      quote.mockResolvedValue({quotedAmountAtomic:amount,collectionFee:fee});
      const response = await app.inject(request(products[1],randomUUID(),sendingApp));
      expect(response.statusCode).toBe(status);
      expect(await debitCount()).toBe(status===201 ? 1 : 0);
      expect((await db.query('select id from crypto_payment_intents where user_id=$1',[user])).rows).toHaveLength(status===201 ? 1 : 0);
    }
  );
});
