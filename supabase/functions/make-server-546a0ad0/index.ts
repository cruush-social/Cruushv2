// @ts-nocheck
// Basic Supabase Edge Function template
// @ts-expect-error Deno JSR import for Supabase Edge Functions
import { serve } from 'jsr:@std/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }
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
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 200,
      });
    default:
      return new Response(JSON.stringify({ error: 'Not implemented' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 404,
      });
  }
});
