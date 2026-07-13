"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Zentrierte, sticky Nav-Pille: Logo + Home/Statistik/Über-uns als eine
 * Gruppe, mittig auf der Seite. Ersetzt AppHeader auf allen Hauptseiten
 * (Home, Statistik, Über uns, Impressum) für den einheitlichen, "frischen"
 * Look. Startet mit einem sehr dezenten Rand, bekommt ab 20px Scroll
 * Hintergrund + Blur.
 */
export function CenteredNav({
  active,
}: {
  active: "home" | "statistik" | "ueber-uns" | "qa" | null;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      isActive ? "bg-accent text-accent-foreground" : "text-muted hover:text-accent"
    }`;

  const items: { key: "home" | "statistik" | "ueber-uns" | "qa"; href: string; icon: string; label: string }[] = [
    { key: "home", href: "/", icon: "ti-home", label: "Home" },
    { key: "statistik", href: "/statistik", icon: "ti-chart-bar", label: "Statistik" },
    { key: "ueber-uns", href: "/ueber-uns", icon: "ti-info-circle", label: "Über uns" },
    { key: "qa", href: "/qa", icon: "ti-help-circle", label: "Q&A" },
  ];

  return (
    <div
      className={`sticky top-3 z-50 mx-auto mb-6 flex w-fit items-center gap-1 rounded-full px-2 py-1.5 transition-all duration-300 ${
        scrolled
          ? "border-[1.5px] border-card-border/10 bg-card/90 backdrop-blur-md"
          : "border-[1.5px] border-card-border/8 bg-card/40 backdrop-blur-sm"
      }`}
    >
      <span className="flex items-center pl-1.5 pr-1">
        <Logo size={26} />
      </span>
      <div className="h-5 w-px shrink-0 bg-card-border/15" />
      {items.map((item) =>
        active === item.key ? (
          <span key={item.key} className={linkClass(true)}>
            <i className={`ti ${item.icon} text-sm`} />
            {item.label}
          </span>
        ) : (
          <Link key={item.key} href={item.href} className={linkClass(false)}>
            <i className={`ti ${item.icon} text-sm`} />
            {item.label}
          </Link>
        )
      )}
    </div>
  );
}
