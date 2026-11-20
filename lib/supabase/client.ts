import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

// Typed as `any` on purpose (see lib/supabase/server.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
