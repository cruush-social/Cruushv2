import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import {
  findCryptoPaymentsByTransactionHash,
  findCryptoReconciliationExceptions
} from "./crypto-reconciliation.js";

describe("crypto payment support lookup", () => {
  it("keeps exact and mismatched chain evidence separately truthful in support lookup", async () => {
    const transactionHash = `0x${"b".repeat(64)}`;
    const tokenAddress = "0x46850aD61C2B7d64d08c9C754F45254596696984";
    const intentId = "00000000-0000-4000-8000-000000000010";
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: intentId,
        user_id: "00000000-0000-4000-8000-000000000001",
        plan_id: "plus_monthly",
        status: "confirming",
        asset: "PYUSD",
        network: "arbitrum",
        payment_address: "0x73659c60270d326c06ac204f1a9c63f889a3d14b",
        quoted_amount_atomic: "18990000",
        confirmed_amount_atomic: null,
        settlement_note: null,
        entitlement_granted_at: null,
        created_at: "2026-09-01T12:00:00.000Z",
        expires_at: "2026-09-01T12:30:00.000Z",
        paid_at: null
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: "00000000-0000-4000-8000-000000000020",
        intent_id: intentId,
        chain_id: 42161,
        token_address: tokenAddress,
        block_hash: `0x${"d".repeat(64)}`,
        block_timestamp: "2026-09-01T12:11:00.000Z",
        transaction_hash: transactionHash,
        log_index: 3,
        block_number: "123456",
        amount_atomic: "1000000",
        from_address: "0x8e23ee67d1332ad560396262c48ffbb01f93d052",
        to_address: "0x73659c60270d326c06ac204f1a9c63f889a3d14b",
        confirmations: 240,
        status: "confirmed",
        first_seen_at: "2026-09-01T12:10:00.000Z",
        confirmed_at: "2026-09-01T12:11:00.000Z"
      }, {
        id: "00000000-0000-4000-8000-000000000021",
        intent_id: intentId,
        chain_id: 8453,
        token_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        block_hash: `0x${"e".repeat(64)}`,
        block_timestamp: "2026-09-01T12:31:00.000Z",
        transaction_hash: `0x${"c".repeat(64)}`,
        log_index: 4,
        block_number: "123457",
        amount_atomic: "2000000",
        from_address: "0x8e23ee67d1332ad560396262c48ffbb01f93d052",
        to_address: "0x73659c60270d326c06ac204f1a9c63f889a3d14b",
        confirmations: 30,
        status: "confirmed",
        first_seen_at: "2026-09-01T12:12:00.000Z",
        confirmed_at: "2026-09-01T12:13:00.000Z"
      }] });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    const result = await findCryptoPaymentsByTransactionHash(db, transactionHash);

    expect(query.mock.calls[0]?.[1]).toEqual([transactionHash]);
    expect(query.mock.calls[1]?.[0]).toContain("token_address");
    expect(result[0]?.transfers[0]).toMatchObject({
      transactionHash,
      chainId: 42161,
      tokenAddress,
      blockHash: `0x${"d".repeat(64)}`,
      blockTimestamp: "2026-09-01T12:11:00.000Z",
      amountAtomic: "1000000",
      status: "confirmed"
    });
    expect(result[0]?.transfers[1]).toMatchObject({
      chainId: 8453,
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      blockHash: `0x${"e".repeat(64)}`,
      blockTimestamp: "2026-09-01T12:31:00.000Z",
      amountAtomic: "2000000",
      status: "confirmed"
    });
  });

  it("counts only on-time exact-rail underpayment inside settlement tolerance as confirmed money not settled", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "00000000-0000-4000-8000-000000000030",
        confirmed: "18895050",
        quoted: "18990000"
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    await expect(findCryptoReconciliationExceptions(db)).resolves.toEqual([{
      kind: "confirmed_money_not_settled",
      intentId: "00000000-0000-4000-8000-000000000030",
      detail: "Confirmed 18895050 against a quote of 18990000, but the intent never settled."
    }]);

    const [sql, values] = query.mock.calls[2] ?? [];
    expect(String(sql)).toContain("unnest($1::text[], $2::text[], $3::integer[], $4::text[])");
    expect(String(sql)).toContain("intended.asset = i.asset");
    expect(String(sql)).toContain("intended.network = i.network");
    expect(String(sql)).toContain("t.chain_id = intended.chain_id");
    expect(String(sql)).toContain("lower(t.token_address) = intended.token_address");
    expect(String(sql)).toContain("t.block_number > coalesce(i.watch_start_block, 0)");
    expect(String(sql)).toContain("t.block_timestamp <= i.expires_at");
    expect(String(sql)).toContain("floor(i.quoted_amount_atomic::numeric * $5::integer / 10000)");
    expect(String(sql)).toContain("$6::numeric");
    expect(values).toEqual([
      ["USDC", "PYUSD", "PYUSD", "USDC"],
      ["arbitrum", "arbitrum", "ethereum", "base"],
      [42161, 42161, 1, 8453],
      [
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        "0x46850ad61c2b7d64d08c9c754f45254596696984",
        "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      ],
      50,
      "250000"
    ]);
  });
});
