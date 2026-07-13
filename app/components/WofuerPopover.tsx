"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kurzes Motivations-Q&A direkt in der Nav-Pille — "Wofür soll ich Medcase
 * nutzen?" für Erstbesucher, die nicht erst bis zum Gründer-Absatz unten auf
 * der Seite scrollen. Gleiches Popover-Pattern wie KontaktPopover, nur nach
 * unten statt nach oben öffnend (Nav sitzt oben, nicht im Footer).
 */
export function WofuerPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
          open ? "bg-accent text-accent-foreground" : "text-muted hover:text-accent"
        }`}
        aria-expanded={open}
      >
        <i className="ti ti-help-circle text-sm" />
        Wofür?
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border-[1.5px] bg-card p-4 text-left shadow-lg"
          style={{ borderColor: "#d8d6cd" }}
        >
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <i className="ti ti-bulb text-sm text-accent" />
            Wofür soll ich Medcase nutzen?
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Um dich vor einer Famulatur oder Klausur auf die häufigsten
            klinischen Fälle vorzubereiten: Du forderst Anamnese,
            Untersuchung und Labor selbst an und lernst so, welche
            Befundkombination zu welcher Diagnose passt — unabhängig von
            Anki-Karten.
          </p>
        </div>
      )}
    </div>
  );
}
