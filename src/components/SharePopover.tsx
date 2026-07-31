"use client";
import { useEffect, useRef, useState } from "react";
import { Share2, Check, Copy } from "lucide-react";

export default function SharePopover({
  callId,
  initialEnabled,
  initialToken,
}: {
  callId: string;
  initialEnabled: boolean;
  initialToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [token, setToken] = useState(initialToken);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const setShare = async (next: boolean) => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/calls/${callId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_enabled: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnabled(Boolean(data.share_enabled));
        if (data.share_token) setToken(data.share_token);
      }
    } finally {
      setPending(false);
    }
  };

  const shareUrl = token ? `${origin}/share/${token}` : "";

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--surface-2)]"
      >
        <Share2 size={14} />
        Partager
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Accès externe</p>
              <p className="text-xs text-[var(--text-muted)]">
                {enabled ? "Toute personne avec le lien peut voir ce call." : "Non partagé."}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={enabled}
              disabled={pending}
              onClick={() => setShare(!enabled)}
              className={`h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition ${
                  enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {enabled && token && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate bg-transparent text-xs outline-none"
              />
              <button
                onClick={copy}
                className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                aria-label="Copier le lien"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
