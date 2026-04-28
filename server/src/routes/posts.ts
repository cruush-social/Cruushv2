import type { FastifyInstance } from "fastify";
import { createPostPayloadSchema } from "../post-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  expires_in: "1h" | "6h" | "24h";
  expires_at: string | Date;
  created_at: string | Date;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

function mapPostRow(row: PostRow) {
  return {
    id: row.id,
    content: row.content,
    expiresIn: row.expires_in,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    distance: "Nearby",
    user: {
      id: row.user_id,
      name: row.display_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

const POST_COLUMNS = `
  p.id,
  p.user_id,
  p.content,
  p.expires_in,
  p.expires_at,
  p.created_at,
  pr.display_name,
  pr.pronouns,
  pr.photos
`;

export async function registerPostRoutes(app: FastifyInstance) {
  app.get("/api/posts", async (request, reply) => {
    getAuthenticatedUserId(request);

    const result = await app.db.query<PostRow>(
      `select ${POST_COLUMNS}
       from posts p
       left join profiles pr on pr.id = p.user_id
       where p.expires_at > now()
       order by p.created_at desc
       limit 100`
    );

    return reply.send({
      data: result.rows.map(mapPostRow)
    });
  });

  app.post("/api/posts", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const payload = createPostPayloadSchema.parse(request.body);

    const result = await app.db.query<PostRow>(
      `with inserted as (
         insert into posts (user_id, content, expires_in, expires_at)
         values (
           $1,
           $2,
           $3,
           now() + case
             when $3 = '1h' then interval '1 hour'
             when $3 = '6h' then interval '6 hours'
             else interval '24 hours'
           end
         )
         returning id, user_id, content, expires_in, expires_at, created_at
       )
       select
         i.id,
         i.user_id,
         i.content,
         i.expires_in,
         i.expires_at,
         i.created_at,
         pr.display_name,
         pr.pronouns,
         pr.photos
       from inserted i
       left join profiles pr on pr.id = i.user_id`,
      [userId, payload.content, payload.expiresIn]
    );

    return reply.code(201).send({
      data: mapPostRow(result.rows[0])
    });
  });
}
