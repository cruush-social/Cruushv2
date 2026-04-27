// Basic Supabase Edge Function template
import { serve } from 'std/server';

serve(async (req) => {
  // Parse the request URL to route endpoints
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/make-server-546a0ad0\//, '');

  // Example routing logic
  switch (path) {
    case 'conversations':
      // Return a mock conversations response
      return new Response(JSON.stringify({
        conversations: [
          {
            id: '1',
            user: { name: 'Demo User', pronouns: 'they/them', photo: '', },
            lastMessage: 'Hello from Edge Function!',
            unread: true,
            time: 'now',
          },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    default:
      return new Response(JSON.stringify({ error: 'Not implemented' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404,
      });
  }
});
