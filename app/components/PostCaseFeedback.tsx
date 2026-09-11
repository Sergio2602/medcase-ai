"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

// Overlay NACH einem Fall (nicht mehr eingebettet): Studenten-Micro-Survey
// (nutzt du's zusätzlich? / Preis) → Redis + PostHog. Das frühere
// Experten-Review ("doctor"-Variante, /review-Einstieg) wurde entfernt.
export function PostCaseFeedback({
  onClose,
}: {
  kind: "student";
  caseData: { id: string; difficulty: string; correctDiagnosis: string };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-foreground/40 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[20px] border-[1.5px] border-card-border/15 bg-card p-6 sm:max-w-xl sm:rounded-2xl sm:p-9"
        onClick={(e) => e.stopPropagation()}
      >
        <StudentSurvey onClose={onClose} />
      </div>
    </div>
  );
}

function StudentSurvey({ onClose }: { onClose: () => void }) {
  const [nutzung, setNutzung] = useState<string | null>(null);
  const [preis, setPreis] = useState<string | null>(null);
  const done = nutzung !== null && preis !== null;

  function pickNutzung(v: string) {
    setNutzung(v);
    track("survey_nutzung", { answer: v });
  }
  function pickPreis(v: string) {
    setPreis(v);
    track("survey_preis", { answer: v });
    // Beide Antworten da → ein kombinierter Redis-Eintrag (für die Übersicht).
    fetch("/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "student", nutzung, preis: v }),
    }).catch(() => {});
  }

  if (done) {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
          <i className="ti ti-heart-handshake text-3xl" />
        </span>
        <p className="text-xl font-extrabold tracking-tight">Danke für dein Feedback!</p>
        <p className="mt-1.5 text-sm text-muted">Das hilft uns wirklich weiter.</p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground sm:w-auto sm:px-12"
        >
          Weiter
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
        Zwei Taps, ehrlich reicht
      </p>
      <p className="mt-1 text-xl font-extrabold tracking-tight">Hilf uns, Medcase zu verbessern</p>

      <p className="mb-3 mt-6 text-[15px] font-semibold leading-snug">
        Würdest du Medcase <span className="text-accent">zusätzlich zu AMBOSS &amp; Anki</span> nutzen —
        z.B. zur Famulatur- oder Klausur-Vorbereitung?
      </p>
      <div className="flex flex-wrap gap-2.5">
        {["Ja, regelmäßig", "Ab und zu", "Eher nicht", "Nein"].map((o) => (
          <Chip key={o} label={o} active={nutzung === o} onClick={() => pickNutzung(o)} />
        ))}
      </div>

      {nutzung !== null && (
        <div className="mt-6">
          <p className="mb-3 text-[15px] font-semibold leading-snug">
            Für unbegrenzte Fälle: Was fändest du fair pro Monat?
          </p>
          <div className="flex flex-wrap gap-2.5">
            {["Nur gratis", "1–3 €", "4–6 €", "7–10 €", "> 10 €"].map((o) => (
              <Chip key={o} label={o} active={preis === o} onClick={() => pickPreis(o)} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="mt-7 rounded-lg border-[1.5px] border-card-border/25 px-5 py-2 text-[13px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Überspringen
      </button>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-[1.5px] px-4 py-2 text-[13.5px] font-semibold transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-accent/35 text-accent hover:border-accent hover:bg-accent/5"
      }`}
    >
      {label}
    </button>
  );
}
