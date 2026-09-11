"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Kopfleiste: flach, volle Breite, linksbündig auf der Inhaltskante
 * (max-w-6xl — dieselbe Kante wie Hero und Seiteninhalt). Logo links,
 * Navigation direkt daneben, aktiver Punkt mit Unterlinie statt Pille.
 * Rechts ein sekundärer „Fall starten“-Einstieg auf allen Seiten außer Home.
 * Sticky; beim Scrollen bekommt sie Hintergrund + Unterlinie, damit sie
 * nicht über dem Inhalt „schwimmt“. Der Name bleibt aus Import-Gründen.
 */
export function CenteredNav({
  active,
}: {
  active: "home" | "statistik" | "ueber-uns" | "qa" | null;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const items: { key: "home" | "statistik" | "ueber-uns" | "qa"; href: string; icon: string; label: string }[] = [
    { key: "home", href: "/", icon: "ti-home", label: "Home" },
    { key: "ueber-uns", href: "/ueber-uns", icon: "ti-info-circle", label: "Über uns" },
    { key: "statistik", href: "/statistik", icon: "ti-chart-bar", label: "Statistik" },
    { key: "qa", href: "/qa", icon: "ti-help-circle", label: "Q&A" },
  ];

  const linkClass = (isActive: boolean) =>
    `flex h-14 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] font-semibold transition-colors sm:px-3 sm:text-[14.5px] ${
      isActive
        ? "border-accent text-foreground"
        : "border-transparent text-muted hover:text-foreground"
    }`;

  return (
    <header
      className={`sticky top-0 z-50 -mx-4 -mt-5 mb-6 border-b-[1.5px] px-4 transition-colors duration-200 md:-mx-10 md:px-10 ${
        scrolled
          ? "border-card-border/12 bg-background/95 backdrop-blur-md"
          : "border-card-border/10 bg-background"
      }`}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center">
        <Link href="/" className="mr-2 flex items-center sm:mr-4" aria-label="Casolvo – Startseite">
          <Logo size={32} />
        </Link>
        <nav className="flex items-center" aria-label="Hauptnavigation">
          {items.map((item) =>
            active === item.key ? (
              <span
                key={item.key}
                aria-current="page"
                className={`${linkClass(true)} ${item.key === "home" ? "hidden sm:flex" : ""}`}
              >
                <i className={`ti ${item.icon} hidden text-[13px] sm:inline`} />
                {item.label}
              </span>
            ) : (
              <Link
                key={item.key}
                href={item.href}
                className={`${linkClass(false)} ${item.key === "home" ? "hidden sm:flex" : ""}`}
              >
                <i className={`ti ${item.icon} hidden text-[13px] sm:inline`} />
                {item.label}
              </Link>
            )
          )}
        </nav>
        {active !== "home" && (
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-bold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Fall starten
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </header>
  );
}
