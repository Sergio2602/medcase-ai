"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { loadProfile, initialsOf, type Profile } from "./ProfileCorner";

/**
 * Einheitlicher Seitenkopf für Unterseiten (Local-Test 1, 13.10.2026):
 * optisch identisch mit dem Header der Startseite — Navy-Leiste, links
 * Menü (Drawer), mittig Delfin-Logo, rechts Profil-Kreis. Die Startseite
 * selbst behält ihren eigenen Header (steuert dort direkt die Slides);
 * hier wird stattdessen per Link auf /?s=0|1|2 bzw. /#methodik gesprungen.
 */
export type SiteSection = "home" | "statistik" | "ueber-uns" | "qa" | null;

const HOME_LINKS = [
  { href: "/?s=0", label: "Willkommen" },
  { href: "/?s=1", label: "Fall starten" },
  { href: "/?s=2", label: "Profil & Statistik" },
];

const NAV_LINKS: { key: SiteSection; href: string; label: string; icon: string }[] = [
  { key: null, href: "/#methodik", label: "Methodik", icon: "ti-certificate" },
  { key: "statistik", href: "/statistik", label: "Ausführliche Statistik", icon: "ti-chart-line" },
  { key: "ueber-uns", href: "/ueber-uns", label: "Über uns", icon: "ti-info-circle" },
  { key: "qa", href: "/qa", label: "Q&A", icon: "ti-help-circle" },
];

export function SiteHeader({ active }: { active: SiteSection }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const item =
    "group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground";

  return (
    <Fragment>
      <header className="fixed inset-x-0 top-0 z-30 bg-[#1a3152] shadow-[0_8px_24px_-14px_rgba(15,23,42,0.6)]">
        <div className="mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 md:w-[min(1240px,calc((100vw-2.5rem)*0.86))] md:px-0">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Navigation öffnen"
              aria-expanded={open}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="flex w-[18px] flex-col gap-[4px]" aria-hidden="true">
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
              </span>
            </button>
          </div>
          <Link href="/?s=0" aria-label="Casolvo – Startseite" className="col-start-2 flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 38, width: "auto" }} />
          </Link>
          <div className="col-start-3 flex justify-end">
            <Link
              href="/?s=2"
              aria-label="Profil & Statistik"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
              style={profile ? { backgroundColor: profile.avatarColor, color: "#1a3152", borderColor: "transparent" } : undefined}
            >
              {profile ? initialsOf(profile.name) : <i className="ti ti-user text-[16px]" aria-hidden="true" />}
            </Link>
          </div>
        </div>
      </header>
      <div className="h-16" aria-hidden="true" />

      <div
        className={`fixed inset-0 z-40 bg-[#0b1626]/30 backdrop-blur-[2px] transition-opacity duration-500 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        inert={!open}
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] max-w-[86vw] flex-col bg-[#fbfaf6] shadow-[24px_0_60px_-30px_rgba(15,23,42,0.5)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between bg-[#1a3152] px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 32, width: "auto" }} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Navigation schließen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="ti ti-x text-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-1.5 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Startseite</p>
          <ul className="mb-7 space-y-0.5">
            {HOME_LINKS.map((l, i) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className={item}>
                  <span className="clinical-data flex h-6 w-6 items-center justify-center rounded-full bg-foreground/[0.07] text-[11.5px] font-bold text-foreground/60">
                    {i + 1}
                  </span>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mb-1.5 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Navigation</p>
          <ul className="space-y-0.5">
            {NAV_LINKS.map((l) => {
              const on = l.key !== null && l.key === active;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={`${item} ${on ? "bg-[#1a3152]/[0.07] text-foreground" : ""}`}
                  >
                    <i
                      className={`ti ${l.icon} text-[18px] ${on ? "text-[#1a3152]" : "text-foreground/45 group-hover:text-foreground/70"}`}
                      aria-hidden="true"
                    />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex gap-4 border-t border-foreground/10 px-6 py-4 text-[12px] text-muted">
          <Link href="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link href="/impressum#datenschutz" className="hover:text-foreground">Datenschutz</Link>
        </div>
      </aside>
    </Fragment>
  );
}
