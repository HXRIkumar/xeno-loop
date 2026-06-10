"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Realtime is PRIMARY in production (Supabase DB). It's gated behind a flag because locally we
// run against a plain Postgres whose changes Supabase can't see — there the hook falls back to
// 3s polling. Set NEXT_PUBLIC_REALTIME_ENABLED=true when the DB is Supabase.
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
