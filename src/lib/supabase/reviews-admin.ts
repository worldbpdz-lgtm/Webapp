import "server-only";
import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

export function reviewsAdmin() {
  if (_client) return _client;

  const url = process.env.REVIEWS_SUPABASE_URL;
  const key = process.env.REVIEWS_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing REVIEWS_SUPABASE_URL or REVIEWS_SUPABASE_SERVICE_ROLE_KEY");
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}