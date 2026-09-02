import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

export const PING_PACKS = [
  {
    id: "ping_3",
    name: "3 Pings",
    description: "3 permanent Ping credits",
    pingCount: 3,
    amountCents: 299,
    currency: "USD"
  },
  {
    id: "ping_10",
    name: "10 Pings",
    description: "10 permanent Ping credits",
    pingCount: 10,
    amountCents: 799,
    currency: "USD"
  },
  {
    id: "ping_25",
    name: "25 Pings",
    description: "25 permanent Ping credits",
    pingCount: 25,
    amountCents: 1499,
    currency: "USD"
  }
] as const;

export type PingPack = typeof PING_PACKS[number];
export type PingPackId = PingPack["id"];

export function getPingPack(packId: string): PingPack {
  const pack = PING_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new ApiError(400, "VALIDATION_ERROR", "That Ping pack is not available.");
  }

  return pack;
}

export async function grantPingPackPurchase(
  db: DbClient,
  input: {
    userId: string;
    cryptoPaymentIntentId: string;
    pack: PingPack;
  }
) {
  const result = await db.query<{ id: string }>(
    `insert into ping_pack_purchases (
       user_id,
       crypto_payment_intent_id,
       pack_id,
       ping_count,
       amount_cents,
       currency
     ) values ($1, $2, $3, $4, $5, $6)
     on conflict (crypto_payment_intent_id) do nothing
     returning id::text as id`,
    [
      input.userId,
      input.cryptoPaymentIntentId,
      input.pack.id,
      input.pack.pingCount,
      input.pack.amountCents,
      input.pack.currency
    ]
  );

  return {
    inserted: result.rows.length === 1,
    purchaseId: result.rows[0]?.id ?? null
  };
}
