"use client";

import { useEffect, useRef, useState } from "react";

const CONTACT_EMAIL = "kontakt.medcase@gmail.com";

export function KontaktPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard-API nicht verfügbar — E-Mail-Link bleibt trotzdem klickbar.
    }
  }

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:underline"
        aria-expanded={open}
      >
        Kontakt
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border-[1.5px] bg-card p-4 text-left shadow-lg"
          style={{ borderColor: "#d8d6cd" }}
        >
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <i className="ti ti-mail text-sm" />
            Kontakt
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="break-all text-sm font-semibold text-accent underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ borderColor: "#d8d6cd" }}
          >
            <i className={`ti ${copied ? "ti-check" : "ti-copy"} text-xs`} />
            {copied ? "Kopiert" : "E-Mail kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}
