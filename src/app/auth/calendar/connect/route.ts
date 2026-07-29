import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Start of the per-user "connect my calendar to Recall" flow. Requires an
 * already-authenticated agency user (the app login already enforces the
 * email domain) — /auth/* is public in middleware, so we gate it here.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${env.app.url}/login`);

  const redirectUri = `${env.app.url}/auth/calendar/callback`;
  const params = new URLSearchParams({
    client_id: env.google.calendarOAuth.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Forces Google to re-issue a refresh_token even if this user already
    // consented before (otherwise a repeat consent returns none).
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
