import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { adminClient, sessionFor, userClient } from "@/lib/supabase/admin";

/**
 * Connector links: https://<app>/api/mcp/<token>. The token is 32 random bytes;
 * only its SHA-256 hash is stored. A request with a valid token runs as its
 * owner through a normal user session, so Row Level Security still applies.
 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

const admin = adminClient;

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
  const session = await sessionFor(row.user_id);
  if (!session) return null;
  sessions.set(hash, { userId: row.user_id, accessToken: session.accessToken, expiresAt: session.expiresAt });
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 3_600_000) {
    await a.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }
  return session.client;
}

/** Forget cached sessions (after a revoke on this instance). */
export const forgetSessions = () => sessions.clear();
