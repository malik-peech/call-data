import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedUrl } from "@/lib/supabase/storage";
import { formatClock, formatDate } from "@/lib/format";
import type { ActionItem, CallSegment } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SharedCall {
  id: string;
  title: string | null;
  started_at: string | null;
  media_path: string | null;
  video_url: string | null;
  share_enabled: boolean;
  clients: { name: string } | null;
  projects: { name: string } | null;
}

/**
 * Public, unauthenticated read-only view of a call — no chat, no favorite,
 * no share controls. Reached only when `share_enabled` is true for the
 * matching `share_token`; the token is a random UUID, not enumerable.
 */
export default async function SharedCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();

  const { data: call } = await db
    .from("calls")
    .select("id, title, started_at, media_path, video_url, share_enabled, clients(name), projects(name)")
    .eq("share_token", token)
    .maybeSingle();

  const c = call as unknown as SharedCall | null;
  if (!c || !c.share_enabled) notFound();

  const [{ data: summary }, { data: segmentsData }] = await Promise.all([
    db
      .from("call_summaries")
      .select("summary, key_points, decisions, action_items")
      .eq("call_id", c.id)
      .maybeSingle(),
    db.from("call_segments").select("*").eq("call_id", c.id).order("idx"),
  ]);
  const segments = (segmentsData ?? []) as CallSegment[];
  const videoSrc = c.media_path ? await signedUrl(c.media_path) : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">Call Data</p>
      <h1 className="mt-2 text-xl font-semibold">{c.title ?? "Sans titre"}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {formatDate(c.started_at)}
        {c.clients?.name ? ` · ${c.clients.name}` : ""}
        {c.projects?.name ? ` · ${c.projects.name}` : ""}
      </p>

      <div className="mt-6 space-y-6">
        {videoSrc ? (
          <video controls src={videoSrc} className="w-full rounded-xl border border-[var(--border)]" />
        ) : c.video_url ? (
          <a
            href={c.video_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Voir la vidéo
          </a>
        ) : null}

        {summary?.summary && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Résumé</h2>
            <p className="mt-2 text-sm leading-relaxed">{summary.summary}</p>

            {Array.isArray(summary.key_points) && summary.key_points.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase text-[var(--text-muted)]">Points clés</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {(summary.key_points as string[]).map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </>
            )}

            {Array.isArray(summary.decisions) && summary.decisions.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase text-[var(--text-muted)]">Décisions</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {(summary.decisions as string[]).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </>
            )}

            {Array.isArray(summary.action_items) && summary.action_items.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  Prochaines étapes
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {(summary.action_items as ActionItem[]).map((a, i) => (
                    <li key={i}>
                      {a.owner ? <span className="text-[var(--accent)]">{a.owner} — </span> : ""}
                      {a.task}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Transcript</h2>
          <div className="mt-3 max-h-[600px] space-y-3 overflow-y-auto pr-2">
            {segments.map((s) => (
              <div key={s.id} className="text-sm">
                <span className="mr-2 text-xs text-[var(--text-muted)]">{formatClock(s.start_seconds)}</span>
                <span className="font-medium text-[var(--accent)]">{s.speaker ?? "?"} : </span>
                {s.text}
              </div>
            ))}
            {segments.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Transcript indisponible.</p>
            )}
          </div>
        </section>
      </div>

      <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
        Lien partagé en lecture seule via Call Data — Peech Newic.
      </p>
    </div>
  );
}
