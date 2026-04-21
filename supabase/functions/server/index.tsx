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
    allowHeaders: ["Content-Type", "Authorization"],
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

// Seed initial user data
app.post("/make-server-546a0ad0/seed-users", async (c) => {
  try {
    const sampleUsers = [
      {
        id: "user1",
        name: "Jordan",
        age: 26,
        pronouns: "they/them",
        lat: 37.7749,
        lng: -122.4194,
        lastActive: "2m ago",
        distance: "0.3 mi",
        lookingFor: ["Friends", "Dates", "Fun"],
        vibes: ["Artsy", "Chill"],
        height: "5'9\"",
        weight: "165 lbs",
        photo: null,
      },
      {
        id: "user2",
        name: "Alex",
        age: 29,
        pronouns: "he/him",
        lat: 37.7759,
        lng: -122.4184,
        lastActive: "5m ago",
        distance: "0.5 mi",
        lookingFor: ["Dates", "Relationship"],
        vibes: ["Nerdy", "Adventurous"],
        height: "6'1\"",
        weight: "180 lbs",
        photo: null,
      },
      {
        id: "user3",
        name: "Sam",
        age: 24,
        pronouns: "she/her",
        lat: 37.7739,
        lng: -122.4204,
        lastActive: "15m ago",
        distance: "0.8 mi",
        lookingFor: ["Friends", "Fun"],
        vibes: ["Outdoorsy", "Creative"],
        height: "5'6\"",
        weight: "140 lbs",
        photo: null,
      },
      {
        id: "user4",
        name: "River",
        age: 31,
        pronouns: "they/them",
        lat: 37.7769,
        lng: -122.4174,
        lastActive: "1h ago",
        distance: "1.2 mi",
        lookingFor: ["Friends", "Community"],
        vibes: ["Activist", "Thoughtful"],
        height: "5'8\"",
        weight: "155 lbs",
        photo: null,
      },
      {
        id: "user5",
        name: "Casey",
        age: 27,
        pronouns: "he/they",
        lat: 37.7729,
        lng: -122.4214,
        lastActive: "3h ago",
        distance: "1.5 mi",
        lookingFor: ["Dates", "Fun"],
        vibes: ["Musical", "Playful"],
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