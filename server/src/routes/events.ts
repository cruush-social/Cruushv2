import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { sendEventPassEmail } from "../mailer.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const LAUNCH_PARTY_SLUG = "the-chocolate-factory-launch";
const LAUNCH_PARTY_EVENT_ID = "4c18a3ac-5dbd-48b6-b24f-703fd6fbb11e";
const LAUNCH_PARTY_TITLE = "cruush beta launch";
const LAUNCH_PARTY_VENUE_NAME = "The Chocolate Factory";
const LAUNCH_PARTY_ADDRESS = "70 Scott Ave, Brooklyn, NY 11237";
const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_MILES = 3958.7613;
const HOUR_MS = 60 * 60 * 1000;
const EVENT_PASS_ICON_NAMES = [
  "camera",
  "cruush",
  "crowds",
  "feed",
  "ghost",
  "lucky",
  "map",
  "messages",
  "notifications",
  "profile",
  "safety",
  "send",
  "settings",
  "visibility"
] as const;

type EventPassIconName = typeof EVENT_PASS_ICON_NAMES[number];
type EventPassWindow = {
  iconName: EventPassIconName;
  validFrom: string;
  validUntil: string;
  hourIndex: number;
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  venue_name: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  radius_miles: string | number;
  starts_at: string | Date;
  ends_at: string | Date;
  pin_disappears_at: string | Date;
  chat_expires_at: string | Date;
  ra_url: string;
  icon_asset: string;
  attendee_count?: string | number | null;
  joined?: boolean | null;
  pass_icon_name?: EventPassIconName | null;
  conversation_id?: string | null;
};

type LaunchEvent = ReturnType<typeof mapEventRow>;
type EventChatJoinRow = {
  conversation_id: string;
  current_user_role: "owner" | "admin" | "member";
};

const eventParamsSchema = z.object({
  slug: z.string().trim().min(1)
}).strict();

const coordinatesPayloadSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180)
}).strict();

function configuredDate(value: string | Date) {
  return new Date(value).toISOString();
}

function getLaunchEventTimes(app: FastifyInstance, row: EventRow) {
  if (row.slug !== LAUNCH_PARTY_SLUG) {
    return {
      startsAt: configuredDate(row.starts_at),
      endsAt: configuredDate(row.ends_at),
      pinDisappearsAt: configuredDate(row.pin_disappears_at),
      chatExpiresAt: configuredDate(row.chat_expires_at)
    };
  }

  return {
    startsAt: configuredDate(app.config.LAUNCH_PARTY_STARTS_AT ?? row.starts_at),
    endsAt: configuredDate(app.config.LAUNCH_PARTY_ENDS_AT ?? row.ends_at),
    pinDisappearsAt: configuredDate(app.config.LAUNCH_PARTY_ENDS_AT ?? row.pin_disappears_at),
    chatExpiresAt: configuredDate(app.config.LAUNCH_PARTY_CHAT_EXPIRES_AT ?? row.chat_expires_at)
  };
}

function mapEventRow(app: FastifyInstance, row: EventRow) {
  const times = getLaunchEventTimes(app, row);
  const latitude = row.slug === LAUNCH_PARTY_SLUG
    ? Number(app.config.LAUNCH_PARTY_LATITUDE ?? row.latitude)
    : Number(row.latitude);
  const longitude = row.slug === LAUNCH_PARTY_SLUG
    ? Number(app.config.LAUNCH_PARTY_LONGITUDE ?? row.longitude)
    : Number(row.longitude);
  const radiusMiles = row.slug === LAUNCH_PARTY_SLUG
    ? Number(app.config.LAUNCH_PARTY_RADIUS_MILES ?? row.radius_miles)
    : Number(row.radius_miles);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    venueName: row.venue_name,
    address: row.address,
    coordinates: {
      latitude,
      longitude
    },
    radiusMiles,
    ...times,
    raUrl: row.slug === LAUNCH_PARTY_SLUG ? app.config.LAUNCH_PARTY_RA_URL ?? row.ra_url : row.ra_url,
    iconAsset: row.icon_asset,
    attendeeCount: Number(row.attendee_count ?? 0),
    joined: row.joined === true,
    passIconName: null,
    conversationId: row.conversation_id ?? null
  };
}

function isEventPinVisible(app: FastifyInstance, event: LaunchEvent) {
  if (event.slug === LAUNCH_PARTY_SLUG && app.config.LAUNCH_PARTY_ENABLED === false) {
    return false;
  }

  const now = Date.now();

  if (event.slug === LAUNCH_PARTY_SLUG) {
    return now < Date.parse(event.pinDisappearsAt);
  }

  return now >= Date.parse(event.startsAt) && now < Date.parse(event.pinDisappearsAt);
}

function eventSelectSql(whereClause: string) {
  return `select
      event.id::text as id,
      event.slug,
      event.title,
      event.venue_name,
      event.address,
      event.latitude,
      event.longitude,
      event.radius_miles,
      event.starts_at,
      event.ends_at,
      event.pin_disappears_at,
      event.chat_expires_at,
      event.ra_url,
      event.icon_asset,
      coalesce(attendee_counts.attendee_count, 0) as attendee_count,
      (membership.user_id is not null) as joined,
      null::text as pass_icon_name,
      chat.conversation_id::text as conversation_id
    from launch_events event
    left join lateral (
      select count(*)::int as attendee_count
      from event_memberships member
      where member.event_id = event.id
    ) attendee_counts on true
    left join event_memberships membership
      on membership.event_id = event.id
     and membership.user_id = $1
    left join event_chats chat
      on chat.event_id = event.id
     and chat.expires_at > now()
    ${whereClause}`;
}

async function loadEvent(app: FastifyInstance, userId: string, slug: string) {
  if (slug === LAUNCH_PARTY_SLUG) {
    await ensureConfiguredLaunchEvent(app);
  }

  const result = await app.db.query<EventRow>(
    eventSelectSql("where event.slug = $2 and event.active = true limit 1"),
    [userId, slug]
  );
  const row = result.rows[0];

  if (!row || (row.slug === LAUNCH_PARTY_SLUG && app.config.LAUNCH_PARTY_ENABLED === false)) {
    throw new ApiError(404, "NOT_FOUND", "Event not found.");
  }

  return mapEventRow(app, row);
}

async function ensureConfiguredLaunchEvent(app: FastifyInstance) {
  if (app.config.LAUNCH_PARTY_ENABLED === false) {
    return;
  }

  await app.db.query(
    `insert into launch_events (
       id,
       slug,
       title,
       venue_name,
       address,
       latitude,
       longitude,
       radius_miles,
       starts_at,
       ends_at,
       pin_disappears_at,
       chat_expires_at,
       ra_url,
       icon_asset,
       active
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $10::timestamptz, $11::timestamptz, $12, 'party-hat', true
     )
     on conflict (slug) do update
     set
       title = excluded.title,
       venue_name = excluded.venue_name,
       address = excluded.address,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       radius_miles = excluded.radius_miles,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       pin_disappears_at = excluded.pin_disappears_at,
       chat_expires_at = excluded.chat_expires_at,
       ra_url = excluded.ra_url,
       icon_asset = excluded.icon_asset,
       active = excluded.active,
       updated_at = now()`,
    [
      LAUNCH_PARTY_EVENT_ID,
      LAUNCH_PARTY_SLUG,
      LAUNCH_PARTY_TITLE,
      LAUNCH_PARTY_VENUE_NAME,
      LAUNCH_PARTY_ADDRESS,
      app.config.LAUNCH_PARTY_LATITUDE,
      app.config.LAUNCH_PARTY_LONGITUDE,
      app.config.LAUNCH_PARTY_RADIUS_MILES,
      app.config.LAUNCH_PARTY_STARTS_AT,
      app.config.LAUNCH_PARTY_ENDS_AT,
      app.config.LAUNCH_PARTY_CHAT_EXPIRES_AT,
      app.config.LAUNCH_PARTY_RA_URL
    ]
  );

  await app.db.query(
    `insert into event_staff (event_id, user_id, role)
     select $1, app_user.id, 'owner'
     from app_users app_user
     where lower(app_user.email) = lower($2)
     on conflict (event_id, user_id) do update
     set role = 'owner'`,
    [
      LAUNCH_PARTY_EVENT_ID,
      app.config.LAUNCH_PARTY_CHAT_ADMIN_EMAIL
    ]
  );
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function distanceMiles(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const dLat = degreesToRadians(second.latitude - first.latitude);
  const dLng = degreesToRadians(second.longitude - first.longitude);
  const lat1 = degreesToRadians(first.latitude);
  const lat2 = degreesToRadians(second.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

function floorHourMs(value: number) {
  return Math.floor(value / HOUR_MS) * HOUR_MS;
}

function getEventPassWindow(event: LaunchEvent, now = new Date()): EventPassWindow {
  const currentHourMs = floorHourMs(now.getTime());
  const eventStartHourMs = floorHourMs(Date.parse(event.startsAt));
  const hourIndex = Math.max(0, Math.floor((currentHourMs - eventStartHourMs) / HOUR_MS));
  const iconName = EVENT_PASS_ICON_NAMES[hourIndex % EVENT_PASS_ICON_NAMES.length];

  return {
    iconName,
    validFrom: new Date(currentHourMs).toISOString(),
    validUntil: new Date(currentHourMs + HOUR_MS).toISOString(),
    hourIndex
  };
}

function getEventPassGuide(event: LaunchEvent) {
  const startsAtMs = floorHourMs(Date.parse(event.startsAt));
  const endsAtMs = Date.parse(event.endsAt);
  const firstWindow = getEventPassWindow(event, new Date(startsAtMs));
  const windows: EventPassWindow[] = [];

  for (
    let cursorMs = startsAtMs, hourIndex = firstWindow.hourIndex;
    cursorMs < endsAtMs;
    cursorMs += HOUR_MS, hourIndex += 1
  ) {
    windows.push({
      iconName: EVENT_PASS_ICON_NAMES[hourIndex % EVENT_PASS_ICON_NAMES.length],
      validFrom: new Date(cursorMs).toISOString(),
      validUntil: new Date(Math.min(cursorMs + HOUR_MS, endsAtMs)).toISOString(),
      hourIndex
    });
  }

  return windows;
}

async function upsertCurrentPassIcon(app: FastifyInstance, eventId: string, userId: string, passWindow: EventPassWindow) {
  const inserted = await app.db.query<{ icon_name: EventPassIconName }>(
    `insert into event_pass_icons (event_id, user_id, icon_name)
     values ($1, $2, $3)
     on conflict (event_id, user_id) do update
     set
       icon_name = excluded.icon_name,
       generated_at = now(),
       emailed_at = case
         when event_pass_icons.icon_name = excluded.icon_name then event_pass_icons.emailed_at
         else null
       end
     returning icon_name`,
    [eventId, userId, passWindow.iconName]
  );

  return inserted.rows[0]?.icon_name ?? passWindow.iconName;
}

async function assertEventStaff(app: FastifyInstance, eventId: string, userId: string) {
  const result = await app.db.query<{ role: "owner" | "staff" }>(
    `select role
     from event_staff
     where event_id = $1
       and user_id = $2
     limit 1`,
    [eventId, userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(403, "FORBIDDEN", "Only event staff can view the door pass guide.");
  }
}

function escapeSvgText(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

async function buildPassJpeg(event: LaunchEvent, passWindow: EventPassWindow) {
  const svg = `<svg width="1200" height="1600" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="passGradient" x1="120" x2="1080" y1="180" y2="1420" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ff0072"/>
        <stop offset="48%" stop-color="#6f00ff"/>
        <stop offset="100%" stop-color="#1181ff"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="1600" fill="#050505"/>
    <rect x="70" y="70" width="1060" height="1460" rx="40" fill="#0d0d10" stroke="#ffffff" stroke-opacity="0.2" stroke-width="4"/>
    <path d="M600 640C572.8 615.1 150 335.5 150 35.5C150 -129.5 261.6 -260 412.5 -260C507.2 -260 566.3 -207.9 600 -146.6C633.8 -207.9 692.8 -260 787.5 -260C938.4 -260 1050 -129.5 1050 35.5C1050 335.5 627.2 615.1 600 640Z" transform="translate(0 520) scale(0.72)" fill="url(#passGradient)" opacity="0.92"/>
    <text x="600" y="220" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="88" font-weight="700">cruush</text>
    <text x="600" y="320" text-anchor="middle" fill="#ffffff" fill-opacity="0.72" font-family="Arial, sans-serif" font-size="34" letter-spacing="8">DOOR PASS</text>
    <text x="600" y="890" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="112" font-weight="700">${escapeSvgText(passWindow.iconName)}</text>
    <text x="600" y="995" text-anchor="middle" fill="#ffffff" fill-opacity="0.78" font-family="Arial, sans-serif" font-size="38">${escapeSvgText(event.venueName)}</text>
    <text x="600" y="1060" text-anchor="middle" fill="#ffffff" fill-opacity="0.62" font-family="Arial, sans-serif" font-size="30">${escapeSvgText(event.address)}</text>
    <text x="600" y="1370" text-anchor="middle" fill="#ffffff" fill-opacity="0.52" font-family="Arial, sans-serif" font-size="26">valid this hour only</text>
    <text x="600" y="1415" text-anchor="middle" fill="#ffffff" fill-opacity="0.42" font-family="Arial, sans-serif" font-size="22">${escapeSvgText(passWindow.validFrom)} - ${escapeSvgText(passWindow.validUntil)}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export async function registerEventRoutes(app: FastifyInstance) {
  app.get("/api/events/active", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    await ensureConfiguredLaunchEvent(app);
    const result = await app.db.query<EventRow>(
      `${eventSelectSql("where event.active = true order by event.starts_at asc")}`,
      [userId]
    );
    const events = result.rows
      .map((row) => mapEventRow(app, row))
      .filter((event) => isEventPinVisible(app, event));

    return reply.send({ data: events });
  });

  app.get("/api/events/:slug", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const event = await loadEvent(app, userId, slug);

    return reply.send({ data: event });
  });

  app.get("/api/events/:slug/pass-guide", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const event = await loadEvent(app, userId, slug);
    await assertEventStaff(app, event.id, userId);

    return reply.send({
      data: {
        eventSlug: event.slug,
        venueName: event.venueName,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        current: getEventPassWindow(event),
        guide: getEventPassGuide(event)
      }
    });
  });

  app.post("/api/events/:slug/reveal-pass", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const payload = coordinatesPayloadSchema.parse(request.body);
    const event = await loadEvent(app, userId, slug);
    const milesFromVenue = distanceMiles(payload, event.coordinates);

    if (milesFromVenue > event.radiusMiles) {
      throw new ApiError(
        403,
        "EVENT_RADIUS_REQUIRED",
        `The door password will be revealed when you are within ${event.radiusMiles} mile of ${event.venueName}.`,
        {
          distanceMiles: Number(milesFromVenue.toFixed(2)),
          radiusMiles: event.radiusMiles,
          raUrl: event.raUrl
        }
      );
    }

    const passWindow = getEventPassWindow(event);
    const iconName = await upsertCurrentPassIcon(app, event.id, userId, passWindow);

    return reply.send({
      data: {
        eventSlug: event.slug,
        iconName,
        validFrom: passWindow.validFrom,
        validUntil: passWindow.validUntil,
        hourIndex: passWindow.hourIndex,
        withinRadius: true,
        emailAvailable: Boolean(app.config.RESEND_API_KEY && app.config.MAIL_FROM) || app.config.EMAIL_PREVIEW_ENABLED === true
      }
    });
  });

  app.post("/api/events/:slug/pass-email", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const event = await loadEvent(app, userId, slug);
    const passWindow = getEventPassWindow(event);
    const passResult = await app.db.query<{ icon_name: EventPassIconName; email: string }>(
      `select pass.icon_name, app_user.email
       from event_pass_icons pass
       join app_users app_user on app_user.id = pass.user_id
       where pass.event_id = $1
         and pass.user_id = $2
         and pass.generated_at >= $3::timestamptz
         and pass.generated_at < $4::timestamptz
       limit 1`,
      [event.id, userId, passWindow.validFrom, passWindow.validUntil]
    );
    const pass = passResult.rows[0];

    if (!pass?.icon_name) {
      throw new ApiError(409, "PASS_NOT_REVEALED", "Reveal your current door pass before emailing it.");
    }

    const jpeg = await buildPassJpeg(event, passWindow);
    const delivery = await sendEventPassEmail({
      attachment: {
        filename: `${event.slug}-door-pass.jpg`,
        content: jpeg.toString("base64")
      },
      config: app.config,
      email: pass.email,
      event: {
        address: event.address,
        passIconName: passWindow.iconName,
        venueName: event.venueName
      },
      logger: app.log
    });

    await app.db.query(
      `update event_pass_icons
       set emailed_at = now()
       where event_id = $1
         and user_id = $2`,
      [event.id, userId]
    );

    return reply.send({
      data: {
        emailed: true,
        previewUrl: delivery.previewUrl
      }
    });
  });

  app.post("/api/events/:slug/join-chat", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const event = await loadEvent(app, userId, slug);
    const result = await app.db.query<EventChatJoinRow>(
      `with upsert_membership as (
         insert into event_memberships (event_id, user_id, joined_at, last_seen_at)
         select $1, $2, now(), now()
         from (
           select
             count(*)::int as member_count,
             coalesce(bool_or(member.user_id = $2), false) as already_joined
           from event_memberships member
           where member.event_id = $1
         ) chat_capacity
         where chat_capacity.already_joined
            or chat_capacity.member_count < $5
         on conflict (event_id, user_id) do update
         set last_seen_at = now()
         returning event_id
       ), existing_chat as (
         select conversation_id
         from event_chats
         where event_id = $1
           and expires_at > now()
         limit 1
       ), selected_staff_owner as (
         select staff.user_id
         from event_staff staff
         where staff.event_id = $1
         order by case staff.role when 'owner' then 0 else 1 end, staff.created_at asc
         limit 1
       ), inserted_conversation as (
         insert into conversations (kind, title, created_by, disappearing_timer)
         select 'group', $3, selected_staff_owner.user_id, '7d'
         from upsert_membership
         left join selected_staff_owner on true
         where not exists (select 1 from existing_chat)
         returning id
       ), resolved_chat as (
         select conversation_id from existing_chat
         union all
         select id as conversation_id from inserted_conversation
         limit 1
       ), upsert_event_chat as (
         insert into event_chats (event_id, conversation_id, expires_at)
         select $1, resolved_chat.conversation_id, $4
         from resolved_chat
         join upsert_membership on true
         on conflict (event_id) do update
         set conversation_id = excluded.conversation_id,
             expires_at = excluded.expires_at
         returning conversation_id
       ), insert_staff_members as (
         insert into conversation_members (conversation_id, user_id, role, muted, last_read_at)
         select
           upsert_event_chat.conversation_id,
           staff.user_id,
           case staff.role when 'owner' then 'owner' else 'admin' end,
           true,
           null
         from upsert_event_chat
         join event_staff staff on staff.event_id = $1
         on conflict (conversation_id, user_id) do update
         set role = excluded.role
       ), insert_attendee_member as (
         insert into conversation_members (conversation_id, user_id, role, muted, last_read_at)
         select upsert_event_chat.conversation_id, $2, 'member', true, now()
         from upsert_event_chat
         on conflict (conversation_id, user_id) do update
         set last_read_at = coalesce(conversation_members.last_read_at, now())
         returning conversation_id, role
       )
       select conversation_id::text, role as current_user_role
       from insert_attendee_member
       limit 1`,
      [event.id, userId, `${event.venueName} party chat`, event.chatExpiresAt, app.config.LAUNCH_PARTY_CHAT_MAX_MEMBERS]
    );
    const conversationId = result.rows[0]?.conversation_id;

    if (!conversationId) {
      throw new ApiError(409, "FEATURE_RESTRICTED", "The party group chat is full.");
    }

    return reply.send({
      data: {
        eventSlug: event.slug,
        conversationId,
        joined: true,
        currentUserRole: result.rows[0]?.current_user_role ?? "member"
      }
    });
  });

  app.get("/api/events/:slug/attendees", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { slug } = eventParamsSchema.parse(request.params);
    const event = await loadEvent(app, userId, slug);
    const result = await app.db.query<{
      attendee_count: string | number;
      attendees: unknown;
    }>(
      `select
         count(member.user_id)::int as attendee_count,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', member.user_id::text,
           'name', coalesce(profile.display_name, app_user.display_name, 'cruush user'),
           'photo', profile.photos[1]
         ) order by member.last_seen_at desc) filter (where member.user_id is not null), '[]'::jsonb) as attendees
       from event_memberships member
       join app_users app_user on app_user.id = member.user_id
       left join profiles profile on profile.id = member.user_id
       where member.event_id = $1`,
      [event.id]
    );
    const row = result.rows[0];

    return reply.send({
      data: {
        eventSlug: event.slug,
        count: Number(row?.attendee_count ?? 0),
        attendees: Array.isArray(row?.attendees) ? row.attendees : []
      }
    });
  });
}
