import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

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

/**
 * A normal signed-in session for `userId`, made server-side (a one-time login
 * link is generated and exchanged at once; no email is sent). Queries through
 * it run under Row Level Security like the owner's own browser. Used by the
 * Claude connector and the reminder job.
 */
export async function sessionFor(userId: string) {
  const a = adminClient();
  const { data: user } = await a.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (!email) return null;
  const { data: link, error } = await a.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) return null;
  const anon = createClient<Database>(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (!verified.session) return null;
  return { accessToken: verified.session.access_token, expiresAt: (verified.session.expires_at ?? 0) * 1000, client: userClient(verified.session.access_token) };
}

/** A client that acts with a user's access token (RLS applies). */
export function userClient(accessToken: string) {
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
