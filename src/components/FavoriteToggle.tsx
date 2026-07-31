"use client";
import { useState } from "react";
import { Star } from "lucide-react";

export default function FavoriteToggle({
  callId,
  initialFavorite,
  size = 16,
  showOnHoverOnly = false,
}: {
  callId: string;
  initialFavorite: boolean;
  size?: number;
  /** When true, the button is invisible unless hovered (via the `group` ancestor) or currently favorited. */
  showOnHoverOnly?: boolean;
}) {
  const [fav, setFav] = useState(initialFavorite);
  const [pending, setPending] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !fav;
    setFav(next);
    setPending(true);
    try {
      const res = await fetch(`/api/calls/${callId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setFav(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={fav}
      className={`shrink-0 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] disabled:opacity-50 ${
        showOnHoverOnly && !fav ? "opacity-0 group-hover:opacity-100" : ""
      }`}
    >
      <Star
        size={size}
        fill={fav ? "var(--favorite)" : "none"}
        color={fav ? "var(--favorite)" : "currentColor"}
      />
    </button>
  );
}
