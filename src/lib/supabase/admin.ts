import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseUrl } from "@/lib/supabase/env";

/**
 * Service-role client: skips Row Level Security, so every query must filter by
 * user_id itself. Only for server jobs with no signed-in user (the Claude
 * connector's sign-in, the weekly backup).
 */
export function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
