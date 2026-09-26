import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyOrderCsv, previousCompletedUtcWeek, sendPreviousWeekOrderReport } from "./weekly-order-report.js";
import { sendWeeklyOrderReportEmail } from "./mailer.js";

vi.mock("./mailer.js", () => ({
  sendWeeklyOrderReportEmail: vi.fn()
}));

describe("weekly order report", () => {
  const query = vi.fn();
  const app = {
    config: {},
    db: { query },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  } as any;

  beforeEach(() => {
    query.mockReset();
    vi.mocked(sendWeeklyOrderReportEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "weekly_1" });
  });

  it("uses the previous completed UTC Monday-to-Monday week", () => {
    expect(previousCompletedUtcWeek(new Date("2026-09-26T04:00:00.000Z"))).toEqual({
      weekStart: "2026-09-14",
      weekEnd: "2026-09-21"
    });
  });

  it("escapes account details in a spreadsheet-safe CSV", () => {
    expect(buildWeeklyOrderCsv([{
      source: "crypto",
      order_id: "order-1",
      user_id: "user-1",
      account_email: "member,one@example.com",
      product_type: "cruush_plus",
      plan_id: "plus_monthly",
      processor: "in_house",
      asset: "BTC",
      amount_usd_cents: 2499,
      status: "paid",
      created_at: "2026-09-15T12:00:00.000Z",
      completed_at: "2026-09-15T12:10:00.000Z"
    }])).toContain('"member,one@example.com"');
  });

  it("claims, emails, and marks one weekly report sent", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ week_start: "2026-09-14", week_end: "2026-09-21" }] })
      .mockResolvedValueOnce({ rows: [{
        source: "crypto", order_id: "order-1", user_id: "user-1", account_email: "member@example.com",
        product_type: "cruush_plus", plan_id: "plus_monthly", processor: "in_house", asset: "BTC",
        amount_usd_cents: 2499, status: "paid", created_at: "2026-09-15T12:00:00.000Z",
        completed_at: "2026-09-15T12:10:00.000Z"
      }] })
      .mockResolvedValue({ rows: [] });

    await expect(sendPreviousWeekOrderReport(app, new Date("2026-09-26T04:00:00.000Z"))).resolves.toBe(true);
    expect(sendWeeklyOrderReportEmail).toHaveBeenCalledWith(expect.objectContaining({
      weekStart: "2026-09-14",
      weekEnd: "2026-09-21",
      csv: expect.stringContaining("member@example.com")
    }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("email_sent_at = now()"))).toBe(true);
  });
});
