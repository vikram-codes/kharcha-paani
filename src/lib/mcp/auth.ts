import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Connector links: https://<app>/api/mcp/<token>. The token is 32 random bytes;
 * only its SHA-256 hash is stored. A request with a valid token runs as its
 * owner through a normal user session, so Row Level Security still applies.
 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

function admin() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Session = { userId: string; accessToken: string; expiresAt: number };
const sessions = new Map<string, Session>(); // per warm server instance

/** Valid, unrevoked token → a Supabase client signed in as its owner. null = reject. */
export async function clientForToken(token: string): Promise<SupabaseClient<Database> | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = hashToken(token);
  // Checked on every request: a link revoked in Settings stops working at once,
  // even on server instances that still hold a session for it.
  const a = admin();
  const { data: row } = await a.from("api_tokens").select("id,user_id,revoked_at,last_used_at").eq("token_hash", hash).maybeSingle();
  if (!row || row.revoked_at) {
    sessions.delete(hash);
    return null;
  }
  const cached = sessions.get(hash);
  if (cached && cached.expiresAt - Date.now() > 60_000) return userClient(cached.accessToken);
  const { data: user } = await a.auth.admin.getUserById(row.user_id);
  if (!user?.user?.email) return null;

  // A one-time login link is generated server-side (no email is sent) and exchanged for a session.
  const { data: link, error } = await a.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
  if (error || !link.properties?.hashed_token) return null;
  const anon = createClient<Database>(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (!verified.session) return null;

  sessions.set(hash, { userId: row.user_id, accessToken: verified.session.access_token, expiresAt: (verified.session.expires_at ?? 0) * 1000 });
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 3_600_000) {
    await a.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }
  return userClient(verified.session.access_token);
}

function userClient(accessToken: string) {
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Forget cached sessions (after a revoke on this instance). */
export const forgetSessions = () => sessions.clear();
