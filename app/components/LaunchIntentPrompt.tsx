"use client";

import { WaitlistForm } from "./WaitlistSignup";

// Nicht-blockierender Launch-Intent-Nudge. Erscheint EINMAL bei tieferem
// Engagement (>= 10 Fälle). Kein Overlay/Backdrop -> Seite bleibt bedienbar.
// Kontext-abhängige Position:
//   - placement "top"    (im Spiel): oben-mittig, kollidiert nicht mit den
//     unteren "Nächster Patient"/"Ergebnis teilen"-CTAs.
//   - placement "corner" (auf Home): unten rechts, aus Hero + Haupt-CTA heraus.
// Wegklicken ist nicht endgültig: derselbe Eintrag liegt permanent auf der Startseite.
export function LaunchIntentPrompt({
  onClose,
  placement = "top",
}: {
  onClose: () => void;
  placement?: "top" | "corner";
}) {
  const wrap =
    placement === "corner"
      ? "pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0"
      : "pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4";
  return (
    <div className={wrap}>
      <style>{lipCss}</style>
      <div
        className={`${
          placement === "corner" ? "lip-card-corner" : "lip-card"
        } pointer-events-auto w-full max-w-md rounded-2xl border-[1.5px] border-card-border/20 bg-card p-5 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <i className="ti ti-bell text-base" />
            </span>
            <p className="text-[15px] font-extrabold tracking-tight">Zum Launch dabei sein?</p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Vielleicht später
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          Wenn Medcase live geht, sagen wir dir einmal kurz Bescheid und du bekommst deinen{" "}
          <span className="font-semibold text-foreground">1 Monat gratis</span>. Keine Werbung,
          jederzeit abbestellbar.
        </p>
        <div className="mt-3">
          <WaitlistForm source="launch_intent" onDone={onClose} />
        </div>
        <p className="mt-2.5 text-[11.5px] text-muted/80">
          Kein Stress — du findest das jederzeit auf der Startseite.
        </p>
      </div>
    </div>
  );
}

const lipCss = `
.lip-card { animation: lipIn .32s cubic-bezier(.2,.8,.25,1) both; }
.lip-card-corner { animation: lipInUp .32s cubic-bezier(.2,.8,.25,1) both; }
@keyframes lipIn { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
@keyframes lipInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .lip-card, .lip-card-corner { animation: none; } }
`;
