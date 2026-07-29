import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "@/lib/types";

/**
 * Cookie-bound Supabase client for Server Components / Route Handlers.
 * Uses the anon key + the user's session (RLS-scoped). For privileged data
 * access use `supabaseAdmin()` instead.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a Server Component — safe to ignore (middleware refreshes).
        }
      },
    },
  });
}

/** Current authenticated user (or null). */
export async function currentUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
