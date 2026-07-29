"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "@/lib/types";

/** Browser Supabase client (auth in the client — sign-in button, etc.). */
export function supabaseBrowser() {
  return createBrowserClient<Database>(env.supabase.url, env.supabase.anonKey);
}
