import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { createCruushPayloadSchema } from "../cruush-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";

type ReceivedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

type SentCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  profile_user_id: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  to_user_name: string | null;
  to_user_pronouns: string | null;
  to_user_photo: string | null;
};

type CreatedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
};

function mapReceivedCruushRow(row: ReceivedCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.from_user_id,
      name: row.display_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

function mapSentCruushRow(row: SentCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.profile_user_id ?? row.to_user_id,
      name: row.display_name?.trim() || row.to_user_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? row.to_user_pronouns ?? "",
      photo: row.photos?.[0] ?? row.to_user_photo ?? null
    }
  };
}

export async function registerCruushRoutes(app: FastifyInstance) {
  app.get("/api/cruush/:userId", async (request, reply) => {
    const authenticatedUserId = getAuthenticatedUserId(request);
    const requestedUserId = (request.params as { userId?: string }).userId?.trim();

    if (!requestedUserId || requestedUserId !== authenticatedUserId) {
      throw new ApiError(403, "FORBIDDEN", "You can only access your own cruush activity.");
    }

    const [receivedResult, sentResult] = await Promise.all([
      app.db.query<ReceivedCruushRow>(
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id = $1
               and back.to_user_id = c.from_user_id::text
           ) as mutual,
           sender.display_name,
           sender.pronouns,
           sender.photos
         from cruushes c
         left join profiles sender on sender.id = c.from_user_id
         where c.to_user_id = $1::text
         order by c.created_at desc`,
        [authenticatedUserId]
      ),
      app.db.query<SentCruushRow>(
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id::text = c.to_user_id
               and back.to_user_id = $1::text
           ) as mutual,
           target.id::text as profile_user_id,
           target.display_name,
           target.pronouns,
           target.photos,
           c.to_user_name,
           c.to_user_pronouns,
           c.to_user_photo
         from cruushes c
         left join profiles target on target.id::text = c.to_user_id
         where c.from_user_id = $1
         order by c.created_at desc`,
        [authenticatedUserId]
      )
    ]);

    return reply.send({
      data: {
        received: receivedResult.rows.map(mapReceivedCruushRow),
        sent: sentResult.rows.map(mapSentCruushRow)
      }
    });
  });

  app.post("/api/cruush", async (request, reply) => {
    const authenticatedUserId = getAuthenticatedUserId(request);
    const payload = createCruushPayloadSchema.parse(request.body);

    if (payload.toUserId === authenticatedUserId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot send a cruush to yourself.");
    }

    const result = await app.db.query<CreatedCruushRow>(
      `with upserted as (
         insert into cruushes (
           from_user_id,
           to_user_id,
           to_user_name,
           to_user_pronouns,
           to_user_photo
         )
         values ($1, $2, $3, $4, $5)
         on conflict (from_user_id, to_user_id) do update
         set
           to_user_name = excluded.to_user_name,
           to_user_pronouns = excluded.to_user_pronouns,
           to_user_photo = excluded.to_user_photo,
           created_at = now()
         returning id, from_user_id, to_user_id, created_at
       )
       select
         u.id,
         u.from_user_id,
         u.to_user_id,
         u.created_at,
         exists(
           select 1
           from cruushes back
           where back.from_user_id::text = u.to_user_id
             and back.to_user_id = u.from_user_id::text
         ) as mutual
       from upserted u`,
      [
        authenticatedUserId,
        payload.toUserId,
        payload.targetUser?.name ?? "",
        payload.targetUser?.pronouns ?? "",
        payload.targetUser?.photo ?? null
      ]
    );

    const created = result.rows[0];

    return reply.code(201).send({
      data: {
        id: created.id,
        fromUserId: created.from_user_id,
        toUserId: created.to_user_id,
        createdAt: new Date(created.created_at).toISOString(),
        mutual: created.mutual
      }
    });
  });
}
