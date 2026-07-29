import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedUrl } from "@/lib/supabase/storage";
import ChatPanel from "@/components/ChatPanel";
import { formatDate, formatClock, sourceLabel } from "@/lib/format";
import type { ActionItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: call } = await db
    .from("calls")
    .select("*, clients(name), projects(code, name)")
    .eq("id", id)
    .single();
  if (!call) notFound();

  const [{ data: summary }, { data: segments }] = await Promise.all([
    db.from("call_summaries").select("*").eq("call_id", id).maybeSingle(),
    db.from("call_segments").select("*").eq("call_id", id).order("idx"),
  ]);

  const videoSrc = call.media_path ? await signedUrl(call.media_path) : null;
  const c = call as typeof call & {
    clients: { name: string } | null;
    projects: { code: string | null; name: string } | null;
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <Link href="/calls" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
        ← Calls
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{c.title ?? "Sans titre"}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatDate(c.started_at)} · {sourceLabel(c.source)}
            {c.clients?.name ? ` · ${c.clients.name}` : ""}
            {c.projects?.code ? ` · ${c.projects.code}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: media + summary + transcript */}
        <div className="space-y-6">
          {videoSrc ? (
            <video controls src={videoSrc} className="w-full rounded-xl border border-[var(--border)]" />
          ) : c.video_url ? (
            <a
              href={c.video_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
            >
              <ExternalLink size={16} />
              Voir la vidéo {c.source === "attio" ? "dans Attio" : "dans Drive"}
            </a>
          ) : null}

          {summary?.summary && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Résumé
              </h2>
              <p className="mt-2 text-sm leading-relaxed">{summary.summary}</p>

              {Array.isArray(summary.key_points) && summary.key_points.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Points clés
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {(summary.key_points as string[]).map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </>
              )}

              {Array.isArray(summary.action_items) && summary.action_items.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Actions
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Transcript
            </h2>
            <div className="mt-3 max-h-[600px] space-y-3 overflow-y-auto pr-2">
              {(segments ?? []).map((s) => (
                <div key={s.id} className="text-sm">
                  <span className="mr-2 text-xs text-[var(--text-muted)]">
                    {formatClock(s.start_seconds)}
                  </span>
                  <span className="font-medium text-[var(--accent)]">{s.speaker ?? "?"} : </span>
                  {s.text}
                </div>
              ))}
              {(!segments || segments.length === 0) && (
                <p className="text-sm text-[var(--text-muted)]">Transcript indisponible.</p>
              )}
            </div>
          </section>
        </div>

        {/* Right: chat */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)]">
          <div className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Interroger ce call
            </h2>
            <div className="min-h-0 flex-1">
              <ChatPanel scope="call" callId={id} placeholder="Ex : quelles décisions ont été prises ?" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
