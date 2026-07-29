"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessagesSquare, LogOut, CalendarPlus, CalendarCheck } from "lucide-react";

const NAV = [
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/chat", label: "Recherche IA", icon: MessagesSquare },
  { href: "/calendars", label: "Agendas connectés", icon: CalendarCheck },
];

export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="px-2 text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
        Call Data
      </div>
      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <a
          href="/auth/calendar/connect"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <CalendarPlus size={16} />
          Connecter mon agenda
        </a>
        {email && <p className="px-3 pb-2 text-xs text-[var(--text-muted)] truncate">{email}</p>}
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            <LogOut size={16} />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
