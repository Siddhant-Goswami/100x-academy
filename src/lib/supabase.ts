import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser client using the anon key. All access is constrained by Row Level
// Security; the anon key is safe to ship. Server-side writes (sync-lessons, the
// proxy's llm_usage logging) use the service role key and never run here.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

// Lazily created so static pages without credentials still build.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    if (!client) {
      if (!url || !anon) {
        throw new Error('Supabase env vars are not set. Copy .env.example to .env.');
      }
      client = createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    // @ts-expect-error dynamic forward
    return client[prop];
  },
});

export const hasSupabase = Boolean(url && anon);
