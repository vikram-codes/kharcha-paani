import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Browser Supabase client (publishable key only; RLS protects the data). */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
