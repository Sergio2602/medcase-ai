"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * Shared top head bar: Logo + Home/Zurück-Pill (links) + optionaler Slot (rechts).
 * Wird auf StartScreen und den rechtlichen Seiten (Impressum/Datenschutz)
 * verwendet, damit beide dasselbe, konsistente Erscheinungsbild haben.
 *
 * `sticky` ist bewusst opt-in (nur Home nutzt es aktuell): pinnt die Leiste
 * beim Scrollen fest und blendet Hintergrund/Blur erst nach ~20px ein, statt
 * sie von Anfang an als Karte zu zeigen. Ohne das Prop bleibt das Verhalten
 * exakt wie vorher — Statistik/Über-uns/Impressum sind davon nicht betroffen.
 */
export function AppHeader({
  backHref = "/",
  backLabel = "Home",
  backIcon = "ti-home",
  onBackClick,
  secondaryLink,
  secondaryLinks,
  right,
  sticky = false,
}: {
  backHref?: string;
  backLabel?: string;
  backIcon?: string;
  onBackClick?: () => void;
  secondaryLink?: { href: string; label: string; icon: string };
  secondaryLinks?: { href: string; label: string; icon: string }[];
  right?: ReactNode;
  sticky?: boolean;
}) {
  const allSecondaryLinks = secondaryLinks ?? (secondaryLink ? [secondaryLink] : []);
  const backButtonClass =
    "flex items-center gap-1.5 rounded-lg bg-[#ecf0f9] px-3.5 py-[7px] text-sm font-semibold text-accent transition-colors hover:bg-[#d8e0f4]";
  const secondaryButtonClass =
    "flex items-center gap-1.5 rounded-lg border-[1.5px] border-card-border/15 px-3.5 py-[7px] text-sm font-semibold text-muted transition-colors hover:border-accent/30 hover:text-accent";

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sticky]);

  const wrapperClass = sticky
    ? `sticky top-0 z-50 mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 transition-all duration-300 ${
        scrolled
          ? "border-[1.5px] border-card-border/10 bg-card/85 backdrop-blur-md"
          : "border-[1.5px] border-transparent bg-transparent"
      }`
    : "mb-4 flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-card-border/10 bg-card px-4 py-2.5";

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-3">
        <Logo size={30} />
        <div className="h-6 w-px shrink-0 bg-card-border/10" />
        {onBackClick ? (
          <button type="button" onClick={onBackClick} className={backButtonClass}>
            <i className={`ti ${backIcon} text-sm`} />
            {backLabel}
          </button>
        ) : (
          <Link href={backHref} className={backButtonClass}>
            <i className={`ti ${backIcon} text-sm`} />
            {backLabel}
          </Link>
        )}
        {allSecondaryLinks.map((link) => (
          <Link key={link.href} href={link.href} className={secondaryButtonClass}>
            <i className={`ti ${link.icon} text-sm`} />
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        ))}
      </div>
      {right}
    </div>
  );
}
