import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Browser Supabase client (publishable key only; RLS protects the data). */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
