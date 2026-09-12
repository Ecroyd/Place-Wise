import { createClient } from "@supabase/supabase-js";

export function getPlacewiseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return createClient(url, key, {
    db: { schema: "placewise" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
