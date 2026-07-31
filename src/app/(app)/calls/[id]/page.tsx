import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedUrl } from "@/lib/supabase/storage";
import { currentUser } from "@/lib/supabase/server";
import { hasFullAccess, participantMatchesUser, toAccessUser } from "@/lib/access";
import ChatPanel from "@/components/ChatPanel";
import Tabs from "@/components/Tabs";
import FavoriteToggle from "@/components/FavoriteToggle";
import SharePopover from "@/components/SharePopover";
import Avatar, { colorFor } from "@/components/Avatar";
import { formatDate, formatDuration, formatClock, sourceLabel } from "@/lib/format";
import type { ActionItem, Call, CallSegment } from "@/lib/types";

type CallWithRefs = Call & {
  clients: { name: string } | null;
  projects: { code: string | null; name: string } | null;
};

export const dynamic = "force-dynamic";

interface SpeakerStat {
  name: string;
  seconds: number;
  percent: number;
  segments: { startPct: number; widthPct: number }[];
}

function computeSpeakerStats(segments: CallSegment[], totalSeconds: number): SpeakerStat[] {
  const bySpeaker = new Map<string, { seconds: number; segs: { start: number; end: number }[] }>();
  for (const s of segments) {
    const name = s.speaker ?? "Inconnu";
    const start = s.start_seconds ?? 0;
    const end = s.end_seconds ?? start;
    const dur = Math.max(0, end - start);
    if (!bySpeaker.has(name)) bySpeaker.set(name, { seconds: 0, segs: [] });
    const entry = bySpeaker.get(name)!;
    entry.seconds += dur;
    entry.segs.push({ start, end });
  }
  const total = totalSeconds || [...bySpeaker.values()].reduce((a, b) => a + b.seconds, 0) || 1;
  return [...bySpeaker.entries()]
    .map(([name, { seconds, segs }]) => ({
      name,
      seconds,
      percent: (seconds / total) * 100,
      segments: segs.map((sg) => ({
        startPct: (sg.start / total) * 100,
        widthPct: Math.max(0.3, ((sg.end - sg.start) / total) * 100),
      })),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function TranscriptTab({ segments }: { segments: CallSegment[] }) {
  return (
    <div className="max-h-[600px] space-y-3 overflow-y-auto pr-2">
      {segments.map((s) => (
        <div key={s.id} className="text-sm">
          <span className="mr-2 text-xs text-[var(--text-muted)]">{formatClock(s.start_seconds)}</span>
          <span className="font-medium text-[var(--accent)]">{s.speaker ?? "?"} : </span>
          {s.text}
        </div>
      ))}
      {segments.length === 0 && <p className="text-sm text-[var(--text-muted)]">Transcript indisponible.</p>}
    </div>
  );
}

function SpeakersTab({ segments, totalSeconds }: { segments: CallSegment[]; totalSeconds: number }) {
  const stats = computeSpeakerStats(segments, totalSeconds);
  if (stats.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Aucune information sur les intervenants.</p>;
  }
  return (
    <div className="space-y-5">
      {stats.map((s) => (
        <div key={s.name}>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Avatar name={s.name} size={20} />
              <span className="font-medium">{s.name}</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {s.percent.toFixed(1)}% · {formatDuration(Math.round(s.seconds))}
            </span>
          </div>
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            {s.segments.map((seg, i) => (
              <span
                key={i}
                className="absolute top-0 h-full rounded-full"
                style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%`, background: colorFor(s.name) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MeetingTab({ c }: { c: CallWithRefs }) {
  return (
    <div className="space-y-5 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Détails</h3>
        <p className="mt-1">
          {formatDate(c.started_at)}
          {c.duration_seconds ? ` · ${formatDuration(c.duration_seconds)}` : ""}
        </p>
        {c.video_url && (
          <a
            href={c.video_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block break-all text-[var(--accent)] hover:underline"
          >
            {c.video_url}
          </a>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Participants{c.participants?.length ? ` · ${c.participants.length}` : ""}
        </h3>
        <ul className="mt-2 space-y-2">
          {(c.participants ?? []).map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <Avatar name={p} size={22} />
              <span>{p}</span>
            </li>
          ))}
          {(!c.participants || c.participants.length === 0) && (
            <p className="text-[var(--text-muted)]">Aucun participant renseigné.</p>
          )}
        </ul>
      </div>

      {(c.clients?.name || c.projects?.name) && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Lié à</h3>
          <p className="mt-1">
            {c.projects?.code ? `${c.projects.code} · ` : ""}
            {c.projects?.name ?? c.clients?.name}
          </p>
        </div>
      )}
    </div>
  );
}

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: callData } = await db
    .from("calls")
    .select("*, clients(name), projects(code, name)")
    .eq("id", id)
    .maybeSingle();
  if (!callData) notFound();
  const c = callData as unknown as CallWithRefs;

  const accessUser = toAccessUser(await currentUser());
  if (!hasFullAccess(accessUser?.email)) {
    const authorized =
      !!accessUser &&
      (c.participants ?? []).some((p) => participantMatchesUser(p, accessUser.email, accessUser.displayName));
    if (!authorized) notFound();
  }

  const [{ data: summary }, { data: segmentsData }] = await Promise.all([
    db.from("call_summaries").select("*").eq("call_id", id).maybeSingle(),
    db.from("call_segments").select("*").eq("call_id", id).order("idx"),
  ]);
  const segments = (segmentsData ?? []) as CallSegment[];

  const videoSrc = c.media_path ? await signedUrl(c.media_path) : null;
  const totalSeconds =
    c.duration_seconds ?? Math.max(0, ...segments.map((s) => s.end_seconds ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <Link href="/calls" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
        ← Calls
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <FavoriteToggle callId={id} initialFavorite={c.is_favorite} size={20} />
          <div>
            <h1 className="text-xl font-semibold">{c.title ?? "Sans titre"}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {formatDate(c.started_at)} · {sourceLabel(c.source)}
              {c.clients?.name ? ` · ${c.clients.name}` : ""}
              {c.projects?.code ? ` · ${c.projects.code}` : ""}
            </p>
          </div>
        </div>
        <SharePopover callId={id} initialEnabled={c.share_enabled} initialToken={c.share_token} />
      </div>

      {c.recording_status === "failed" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="font-medium">Bot non admis.</span> {c.failure_reason}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: media + tabs */}
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

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <Tabs
              tabs={[
                { key: "transcript", label: "Transcript", content: <TranscriptTab segments={segments} /> },
                {
                  key: "speakers",
                  label: "Speakers",
                  content: <SpeakersTab segments={segments} totalSeconds={totalSeconds} />,
                },
                { key: "meeting", label: "Meeting", content: <MeetingTab c={c} /> },
              ]}
            />
          </section>
        </div>

        {/* Right: summary + insights + chat */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
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

          <div className="flex h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
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
