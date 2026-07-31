const SOURCE_LABELS: Record<string, string> = {
  recall: "Recall",
  attio: "Attio",
  google_meet: "Meet",
};

export function sourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s;
}

const SOURCE_COLORS: Record<string, string> = {
  recall: "#8b5cf6",
  attio: "#3b82f6",
  google_meet: "#22c55e",
};

export function sourceColor(s: string): string {
  return SOURCE_COLORS[s] ?? "#9aa4b2";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function formatClock(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
