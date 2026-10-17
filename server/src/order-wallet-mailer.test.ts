import { walletEmailFixture } from "./order-wallet-email.fixture.js";
import { afterEach, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { FastifyBaseLogger } from "fastify";
import { buildOrderWalletReadyEmail, sendOrderWalletReadyEmail } from "./mailer.js";
afterEach(() => vi.unstubAllGlobals());
it("sends the rendered HTML and plain text with a stable provider idempotency key", async () => {
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"fixture-provider-id"})});
  vi.stubGlobal("fetch",fetchMock);
  const content=buildOrderWalletReadyEmail("https://cruush.app","ping_pack","ping_10", walletEmailFixture);
  const result=await sendOrderWalletReadyEmail({config:{RESEND_API_KEY:"test-key",MAIL_FROM:"test@example.invalid"} as AppConfig,
    email:"member@example.invalid",idempotencyKey:"order-wallet-ready/test-order",logger:{error:vi.fn()} as unknown as FastifyBaseLogger,content});
  expect(result).toEqual({accepted:true,providerMessageId:"fixture-provider-id"});
  const request=fetchMock.mock.calls[0][1];
  expect(request.headers["Idempotency-Key"]).toBe("order-wallet-ready/test-order");
  expect(JSON.parse(request.body)).toMatchObject({to:["member@example.invalid"],...content});
  expect(content.html).toContain('href="https://cruush.app/store/pulse"');
});
it("does not claim delivery when the email provider is unconfigured", async () => {
  const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
  const result=await sendOrderWalletReadyEmail({config:{} as AppConfig,email:"member@example.invalid",idempotencyKey:"order-wallet-ready/test",logger:{} as FastifyBaseLogger,content:buildOrderWalletReadyEmail("https://cruush.app","cruush_plus","plus_monthly", walletEmailFixture)});
  expect(result.accepted).toBe(false);expect(fetchMock).not.toHaveBeenCalled();
});
