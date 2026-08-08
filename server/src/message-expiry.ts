import type { FastifyInstance } from "fastify";
import { runTransaction } from "./db.js";
import { deleteEncryptedMediaObject } from "./media-storage.js";

const EXPIRY_BATCH_SIZE = 200;

type ExpiredMediaObject = {
  id: string;
  object_key: string;
  variant_object_keys: string[] | null;
};

type ExpiryResult = {
  expiredMessages: number;
  expiredFeedPosts: number;
  cleanedMediaObjects: number;
  failedMediaObjects: number;
};

/**
 * Removes expired messages and then cleans message media which is no longer
 * referenced by an attachment or the quick-access gallery. The database row
 * is soft-deleted before storage cleanup so a failed object deletion is
 * retried by the next sweep without exposing the media through normal reads.
 */
export async function expireDisappearingMessages(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  batchSize = EXPIRY_BATCH_SIZE
): Promise<ExpiryResult> {
  const result = await runTransaction(app.db, async (db) => {
    const expiredMessages = await db.query<{ id: string }>(
      `select id::text as id
       from messages
       where expires_at is not null
         and expires_at <= now()
       order by expires_at asc
       limit $1
       for update skip locked`,
      [batchSize]
    );
    const messageIds = expiredMessages.rows.map((row) => row.id);

    if (messageIds.length > 0) {
      await db.query(
        `delete from messages
         where id = any($1::uuid[])`,
        [messageIds]
      );
    }

    const expiredFeedPosts = await db.query<{ id: string }>(
      `select id::text as id
       from posts
       where expires_at <= now()
       order by expires_at asc
       limit $1
       for update skip locked`,
      [batchSize]
    );
    const feedPostIds = expiredFeedPosts.rows.map((row) => row.id);

    if (feedPostIds.length > 0) {
      await db.query(
        `delete from posts
         where id = any($1::uuid[])`,
        [feedPostIds]
      );
    }

    const orphanedMedia = await db.query<ExpiredMediaObject>(
      `select
         media.id::text as id,
         media.object_key,
         coalesce(array_agg(variant.object_key) filter (where variant.object_key is not null), '{}') as variant_object_keys
       from media_objects media
       left join media_variants variant
         on variant.media_object_id = media.id
        and variant.deleted_at is null
       where media.surface in ('message_photo', 'message_media', 'feed_photo')
         and not exists (
           select 1
         from message_media_attachments attachment
         where attachment.media_object_id = media.id
       )
         and not exists (
           select 1
           from feed_post_media_attachments attachment
           where attachment.media_object_id = media.id
         )
         and not exists (
           select 1
           from message_favorite_images favorite
           where favorite.media_object_id = media.id
         )
         and (media.deleted_at is null or media.deleted_at <= now())
       group by media.id, media.object_key
       order by media.created_at asc
       limit $1`,
      [batchSize]
    );
    const mediaIds = orphanedMedia.rows.map((row) => row.id);

    if (mediaIds.length > 0) {
      await db.query(
        `update media_objects
         set deleted_at = coalesce(deleted_at, now())
         where id = any($1::uuid[])`,
        [mediaIds]
      );
    }

    return {
      expiredMessages: messageIds.length,
      expiredFeedPosts: feedPostIds.length,
      orphanedMedia: orphanedMedia.rows
    };
  });

  let cleanedMediaObjects = 0;
  let failedMediaObjects = 0;

  for (const media of result.orphanedMedia) {
    const objectKeys = [media.object_key, ...(media.variant_object_keys ?? [])].filter(Boolean);
    let storageDeleted = true;

    for (const objectKey of new Set(objectKeys)) {
      try {
        await deleteEncryptedMediaObject(app.config, objectKey);
      } catch (error) {
        storageDeleted = false;
        app.log.error({ err: error, mediaId: media.id, objectKey }, "expired media cleanup failed");
      }
    }

    if (!storageDeleted) {
      failedMediaObjects += 1;
      continue;
    }

    await app.db.query(
      `delete from media_objects media
       where media.id = $1
         and media.deleted_at is not null
         and not exists (
           select 1 from message_media_attachments attachment
           where attachment.media_object_id = media.id
         )
         and not exists (
           select 1 from feed_post_media_attachments attachment
           where attachment.media_object_id = media.id
         )
         and not exists (
           select 1 from message_favorite_images favorite
           where favorite.media_object_id = media.id
         )`,
      [media.id]
    );
    cleanedMediaObjects += 1;
  }

  return {
    expiredMessages: result.expiredMessages,
    expiredFeedPosts: result.expiredFeedPosts,
    cleanedMediaObjects,
    failedMediaObjects
  };
}

export function startMessageExpiryScheduler(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  intervalMs = 60 * 1000
) {
  const run = () => {
    void expireDisappearingMessages(app).catch((error) => {
      app.log.error({ err: error }, "scheduled message expiry sweep failed");
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
