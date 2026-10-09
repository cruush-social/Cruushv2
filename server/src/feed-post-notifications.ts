import type { FastifyInstance } from "fastify";
import { getRelationshipPermissions } from "./match-relationships.js";
import { createAppNotificationAndPush } from "./notification-service.js";
import type { FeedPostAudience } from "./post-schema.js";

const NEARBY_FEED_RADIUS_MILES = 5;
const RECENT_LOCATION_DAYS = 4;
const RECIPIENT_BATCH_SIZE = 500;

type NearbyFeedRecipientRow = {
  user_id: string;
};

export async function notifyNearbyUsersForFeedPost(app: FastifyInstance, input: {
  postId: string;
  authorUserId: string;
  audience: FeedPostAudience;
}) {
  const recipients = await app.db.query<NearbyFeedRecipientRow>(
    `select recipient.id::text as user_id
       from profiles author
       join profiles recipient on recipient.id <> author.id
       join app_users recipient_user on recipient_user.id = recipient.id
       left join notification_preferences preferences on preferences.user_id = recipient.id
      where author.id = $1
        and coalesce(recipient_user.account_status, 'active') = 'active'
        and author.location_updated_at >= now() - ($4::text || ' days')::interval
        and recipient.location_updated_at >= now() - ($4::text || ' days')::interval
        and coalesce(author.fuzzy_lat, author.lat) is not null
        and coalesce(author.fuzzy_lng, author.lng) is not null
        and coalesce(recipient.fuzzy_lat, recipient.lat) is not null
        and coalesce(recipient.fuzzy_lng, recipient.lng) is not null
        and coalesce(preferences.nearby_enabled, true) = true
        and not exists (
          select 1
          from user_blocks block
          where (block.blocker_user_id = $1 and block.blocked_user_id = recipient.id)
             or (block.blocker_user_id = recipient.id and block.blocked_user_id = $1)
        )
        and 3958.8 * 2 * asin(sqrt(
          power(sin(radians((coalesce(recipient.fuzzy_lat, recipient.lat) - coalesce(author.fuzzy_lat, author.lat)) / 2)), 2)
          + cos(radians(coalesce(author.fuzzy_lat, author.lat)))
            * cos(radians(coalesce(recipient.fuzzy_lat, recipient.lat)))
            * power(sin(radians((coalesce(recipient.fuzzy_lng, recipient.lng) - coalesce(author.fuzzy_lng, author.lng)) / 2)), 2)
        )) <= $3::double precision
        and (
          $2::text <> 'crowd'
          or exists (
            select 1
            from feed_post_crowd_targets target
            join profile_sensitive_tokens recipient_token
              on recipient_token.user_id = recipient.id
             and recipient_token.token_hash = target.token_hash
             and recipient_token.token_key_version = target.token_key_version
            where target.post_id = $5::uuid
          )
        )
      order by recipient.location_updated_at desc
      limit $6::integer`,
    [
      input.authorUserId,
      input.audience,
      NEARBY_FEED_RADIUS_MILES,
      String(RECENT_LOCATION_DAYS),
      input.postId,
      RECIPIENT_BATCH_SIZE
    ]
  );

  let sent = 0;

  for (const recipient of recipients.rows) {
    try {
      if (input.audience === "mutuals") {
        const relationship = await getRelationshipPermissions(app, recipient.user_id, input.authorUserId);
        if (!relationship.isMutualCruush || relationship.isBlocked) {
          continue;
        }
      }

      const notification = await createAppNotificationAndPush(app, {
        userId: recipient.user_id,
        type: "nearby_feed_post",
        title: "New Feed post nearby",
        body: "Open Feed to see what’s happening in your area.",
        linkUrl: "/feed?view=nearby#latest",
        dedupeKey: `nearby-feed-post:${input.postId}:${recipient.user_id}`,
        metadata: { postId: input.postId },
        deferPush: true
      });

      if (notification) {
        sent += 1;
      }
    } catch (error) {
      app.log.error(
        { err: error, postId: input.postId, userId: recipient.user_id },
        "nearby Feed notification delivery failed"
      );
    }
  }

  return {
    attempted: true,
    sent
  };
}
