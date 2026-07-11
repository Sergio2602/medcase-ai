import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * Shared top head bar: Logo + Home/Zurück-Pill (links) + optionaler Slot (rechts).
 * Wird auf StartScreen und den rechtlichen Seiten (Impressum/Datenschutz)
 * verwendet, damit beide dasselbe, konsistente Erscheinungsbild haben.
 */
export function AppHeader({
  backHref = "/",
  backLabel = "Home",
  backIcon = "ti-home",
  onBackClick,
  secondaryLink,
  secondaryLinks,
  right,
}: {
  backHref?: string;
  backLabel?: string;
  backIcon?: string;
  onBackClick?: () => void;
  secondaryLink?: { href: string; label: string; icon: string };
  secondaryLinks?: { href: string; label: string; icon: string }[];
  right?: ReactNode;
}) {
  const allSecondaryLinks = secondaryLinks ?? (secondaryLink ? [secondaryLink] : []);
  const backButtonClass =
    "flex items-center gap-1.5 rounded-lg bg-[#eaf0fc] px-3.5 py-[7px] text-sm font-semibold text-accent transition-colors hover:bg-[#dbe6fa]";
  const secondaryButtonClass =
    "flex items-center gap-1.5 rounded-lg border-[1.5px] border-card-border/15 px-3.5 py-[7px] text-sm font-semibold text-muted transition-colors hover:border-accent/30 hover:text-accent";

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-card-border/10 bg-card px-4 py-2.5">
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
