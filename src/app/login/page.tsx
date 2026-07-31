"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginInner() {
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const error = params.get("error");

  const signIn = async () => {
    setLoading(true);
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-[var(--accent)]">Call Data</p>
      <h1 className="mt-3 text-2xl font-semibold">Connexion</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Réservé aux comptes de l&apos;agence.
      </p>
      {error === "domain" && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          Ce compte n&apos;est pas autorisé (domaine non reconnu).
        </p>
      )}
      <button
        onClick={signIn}
        disabled={loading}
        className="mt-6 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 font-medium text-black shadow-sm transition hover:bg-[var(--surface-2)] disabled:opacity-50"
      >
        {loading ? "Redirection…" : "Continuer avec Google"}
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
