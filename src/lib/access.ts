import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Sees every call regardless of participation. */
const UNRESTRICTED_EMAIL = "malik@peechstudio.com";

export function hasFullAccess(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === UNRESTRICTED_EMAIL;
}

/**
 * `participants` stores free-text names (diarized speaker labels for Recall,
 * name-or-email for Attio/Meet) — there's no clean id to join against the
 * logged-in Supabase user. We match on email (when a participant happens to
 * be one) or on the user's first/last name appearing in the participant
 * string, case-insensitively. Imperfect for calls where a speaker was
 * mislabeled by diarization, but the best available signal without asking
 * every source system to also report participant emails.
 */
export function participantMatchesUser(
  participant: string,
  email: string,
  displayName?: string | null
): boolean {
  const p = participant.toLowerCase().trim();
  if (!p) return false;

  const emailLower = email.toLowerCase();
  if (p === emailLower) return true;
  const localPart = emailLower.split("@")[0];
  if (localPart && localPart.length > 2 && p.includes(localPart)) return true;

  if (displayName) {
    const parts = displayName.toLowerCase().split(/\s+/).filter((s) => s.length > 2);
    if (parts.some((part) => p.includes(part))) return true;
  }
  return false;
}

export interface AccessUser {
  email: string;
  displayName: string | null;
}

/** Extracts {email, displayName} from a Supabase auth user (Google OAuth metadata). */
export function toAccessUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): AccessUser | null {
  if (!user?.email) return null;
  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;
  return { email: user.email, displayName };
}

/**
 * Set of call ids the given user is allowed to see, or `null` when they
 * have unrestricted access (no filtering needed). Scans all non-duplicate
 * calls' participants — fine at this app's scale (a few hundred calls).
 */
export async function visibleCallIdsFor(user: AccessUser | null): Promise<Set<string> | null> {
  if (!user || hasFullAccess(user.email)) return null;

  const { data } = await supabaseAdmin()
    .from("calls")
    .select("id, participants")
    .is("duplicate_of", null)
    .limit(5000);

  const ids = new Set<string>();
  for (const row of (data ?? []) as { id: string; participants: string[] }[]) {
    if ((row.participants ?? []).some((p) => participantMatchesUser(p, user.email, user.displayName))) {
      ids.add(row.id);
    }
  }
  return ids;
}
