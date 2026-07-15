"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "disclaimerSeen";
const COOKIE_DAYS = 365;

// Wurde der Hinweis schon bestätigt? (Nur client-seitig aufrufen.)
export function hasSeenDisclaimer(): boolean {
  return Boolean(getCookie(COOKIE_NAME));
}

// Nicht-blockierender Hinweis-Banner unten: erscheint beim ersten Besuch,
// blockiert nichts (man kann sofort einen Fall starten), "Verstanden"
// schließt ihn dauerhaft (Cookie). Der medizinische Disclaimer steht
// zusätzlich dauerhaft im Spiel (siehe GameScreen). Selbst-verwaltend —
// wird einmal global im Layout gemountet.
export function DisclaimerBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) setVisible(true);
  }, []);

  if (!visible) return null;

  function accept() {
    setCookie(COOKIE_NAME, "true", COOKIE_DAYS);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
      <div
        role="region"
        aria-label="Hinweis zur Nutzung"
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border-[1.5px] border-card-border/15 bg-card/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:gap-4"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <i className="ti ti-shield-check text-[13px]" />
        </span>
        <p className="flex-1 text-[12.5px] leading-relaxed text-muted">
          <span className="font-semibold text-foreground">
            Fiktive Übungsfälle — kein ärztlicher Rat.
          </span>{" "}
          Medcase ist ein Lerntool und ersetzt keine ärztliche Diagnose oder Beratung.
          Ein technisch notwendiges Cookie speichert deinen Fortschritt — keine
          Tracking-Cookies.{" "}
          <Link href="/impressum#datenschutz" className="text-accent underline underline-offset-2">
            Datenschutz
          </Link>
          {" · "}
          <Link href="/impressum" className="text-accent underline underline-offset-2">
            Impressum
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
