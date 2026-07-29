import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { createGoogleCalendar } from "@/lib/integrations/recall";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Google OAuth callback for the calendar-connect flow: exchange the code for
 * a refresh_token, then register it with Recall (Calendar V2) so it starts
 * emitting `calendar.sync_events` for this person's calendar.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = env.app.url || url.origin;

  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/calls?calendar=missing_code`);

  const redirectUri = `${origin}/auth/calendar/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.calendarOAuth.clientId,
      client_secret: env.google.calendarOAuth.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error(`[calendar-connect] token exchange ${tokenRes.status}:`, await tokenRes.text());
    return NextResponse.redirect(`${origin}/calls?calendar=exchange_failed`);
  }

  const { refresh_token: refreshToken } = (await tokenRes.json()) as { refresh_token?: string };
  if (!refreshToken) {
    // Google omits refresh_token on repeat consent without prompt=consent;
    // we always send prompt=consent, so this should only happen if revoked
    // mid-flow — surface it rather than silently registering nothing.
    return NextResponse.redirect(`${origin}/calls?calendar=no_refresh_token`);
  }

  try {
    await createGoogleCalendar(refreshToken);
  } catch (e) {
    console.error("[calendar-connect] Recall createGoogleCalendar failed:", e);
    return NextResponse.redirect(`${origin}/calls?calendar=recall_error`);
  }

  return NextResponse.redirect(`${origin}/calls?calendar=connected`);
}
