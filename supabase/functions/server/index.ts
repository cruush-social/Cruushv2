// @ts-nocheck
// @ts-nocheck
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-seed-secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-546a0ad0/health", (c) => {
  return c.json({ status: "ok" });
});

// Get all users
app.get("/make-server-546a0ad0/users", async (c) => {
  try {
    const users = await kv.getByPrefix("user:");
    return c.json({ users: users || [] });
  } catch (error) {
    console.log(`Error fetching users: ${error}`);
    return c.json({ error: "Failed to fetch users", details: String(error) }, 500);
  }
});

// Seed initial user data (PROTECTED: only allow from localhost or with secret header)
app.post("/make-server-546a0ad0/seed-users", async (c) => {
  // Restrict access: only allow from localhost or with a secret header
  const allowed = c.req.header("x-seed-secret") === Deno.env.get("SEED_SECRET") || c.req.header("host")?.startsWith("localhost");
  if (!allowed) {
    return c.json({ error: "Forbidden" }, 403);
  }
  try {
    // Brooklyn, NY coordinates: lat ~40.6782, lng ~-73.9442
    const sampleUsers = [
      {
        id: "user1",
        name: "Jordan",
        age: 26,
        pronouns: "they/them",
        lat: 40.6782 + (Math.random() - 0.5) * 0.01,
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        lastActive: "2m ago",
        distance: "0.3 mi",
        lookingFor: ["Friends", "Dates", "Fun", "Relationship", "Community", "Networking"],
        vibes: ["Artsy", "Chill", "Nerdy", "Adventurous", "Outdoorsy", "Creative", "Activist", "Thoughtful", "Musical", "Playful", "Alt", "Goth"],
        height: "5'9\"",
        weight: "165 lbs",
        photo: null,
      },
      {
        id: "user2",
        name: "Alex",
        age: 29,
        pronouns: "he/him",
        lat: 40.6782 + (Math.random() - 0.5) * 0.01,
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        lastActive: "5m ago",
        distance: "0.5 mi",
        lookingFor: ["Dates", "Relationship", "Fun"],
        vibes: ["Nerdy", "Adventurous", "Alt"],
        height: "6'1\"",
        weight: "180 lbs",
        photo: null,
      },
      {
        id: "user3",
        name: "Sam",
        age: 24,
        pronouns: "she/her",
        lat: 40.6782 + (Math.random() - 0.5) * 0.01,
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        lastActive: "15m ago",
        distance: "0.8 mi",
        lookingFor: ["Friends", "Fun", "Community"],
        vibes: ["Outdoorsy", "Creative", "Goth"],
        height: "5'6\"",
        weight: "140 lbs",
        photo: null,
      },
      {
        id: "user4",
        name: "River",
        age: 31,
        pronouns: "they/them",
        lat: 40.6782 + (Math.random() - 0.5) * 0.01,
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        lastActive: "1h ago",
        distance: "1.2 mi",
        lookingFor: ["Friends", "Community", "Networking"],
        vibes: ["Activist", "Thoughtful", "Chill"],
        height: "5'8\"",
        weight: "155 lbs",
        photo: null,
      },
      {
        id: "user5",
        name: "Casey",
        age: 27,
        pronouns: "he/they",
        lat: 40.6782 + (Math.random() - 0.5) * 0.01,
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        lastActive: "3h ago",
        distance: "1.5 mi",
        lookingFor: ["Dates", "Fun", "Relationship"],
        vibes: ["Musical", "Playful", "Artsy"],
        height: "5'10\"",
        weight: "170 lbs",
        photo: null,
      },
    ];

    const keys = sampleUsers.map(user => `user:${user.id}`);
    await kv.mset(keys, sampleUsers);

    return c.json({ message: "Users seeded successfully", count: sampleUsers.length });
  } catch (error) {
    console.log(`Error seeding users: ${error}`);
    return c.json({ error: "Failed to seed users", details: String(error) }, 500);
  }
});

// Get all conversations for a user
app.get("/make-server-546a0ad0/conversations", async (c) => {
  try {
    const conversations = await kv.getByPrefix("conversation:");
    return c.json({ conversations: conversations || [] });
  } catch (error) {
    console.log(`Error fetching conversations: ${error}`);
    return c.json({ error: "Failed to fetch conversations", details: String(error) }, 500);
  }
});

// Send a message
app.post("/make-server-546a0ad0/messages", async (c) => {
  try {
    const { conversationId, userId, content } = await c.req.json();
    const messageId = `msg_${Date.now()}`;
    const message = {
      id: messageId,
      conversationId,
      userId,
      content,
      timestamp: new Date().toISOString(),
    };

    await kv.set(`message:${conversationId}:${messageId}`, message);
    return c.json({ message });
  } catch (error) {
    console.log(`Error sending message: ${error}`);
    return c.json({ error: "Failed to send message", details: String(error) }, 500);
  }
});

// Get messages for a conversation
app.get("/make-server-546a0ad0/messages/:conversationId", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const messages = await kv.getByPrefix(`message:${conversationId}:`);
    return c.json({ messages: messages || [] });
  } catch (error) {
    console.log(`Error fetching messages: ${error}`);
    return c.json({ error: "Failed to fetch messages", details: String(error) }, 500);
  }
});

// Get all posts from local feed
app.get("/make-server-546a0ad0/posts", async (c) => {
  try {
    const posts = await kv.getByPrefix("post:");
    return c.json({ posts: posts || [] });
  } catch (error) {
    console.log(`Error fetching posts: ${error}`);
    return c.json({ error: "Failed to fetch posts", details: String(error) }, 500);
  }
});

// Create a new post
app.post("/make-server-546a0ad0/posts", async (c) => {
  try {
    const { userId, content, expiresIn } = await c.req.json();
    const postId = `post_${Date.now()}`;
    const post = {
      id: postId,
      userId,
      content,
      expiresIn,
      timestamp: new Date().toISOString(),
    };

    await kv.set(`post:${postId}`, post);
    return c.json({ post });
  } catch (error) {
    console.log(`Error creating post: ${error}`);
    return c.json({ error: "Failed to create post", details: String(error) }, 500);
  }
});

// Send a cruush
app.post("/make-server-546a0ad0/cruush", async (c) => {
  try {
    const { fromUserId, toUserId } = await c.req.json();
    const cruushId = `cruush_${Date.now()}`;
    const cruush = {
      id: cruushId,
      fromUserId,
      toUserId,
      timestamp: new Date().toISOString(),
    };

    await kv.set(`cruush:${cruushId}`, cruush);

    // Check for mutual cruush
    const existingCruush = await kv.getByPrefix(`cruush:`);
    const mutual = existingCruush?.some((c: any) =>
      c.fromUserId === toUserId && c.toUserId === fromUserId
    );

    return c.json({ cruush, mutual });
  } catch (error) {
    console.log(`Error sending cruush: ${error}`);
    return c.json({ error: "Failed to send cruush", details: String(error) }, 500);
  }
});

// Get cruush activity
app.get("/make-server-546a0ad0/cruush/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const allCruush = await kv.getByPrefix("cruush:");

    const received = allCruush?.filter((c: any) => c.toUserId === userId) || [];
    const sent = allCruush?.filter((c: any) => c.fromUserId === userId) || [];

    return c.json({ received, sent });
  } catch (error) {
    console.log(`Error fetching cruush activity: ${error}`);
    return c.json({ error: "Failed to fetch cruush activity", details: String(error) }, 500);
  }
});

Deno.serve(app.fetch);