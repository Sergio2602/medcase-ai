"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startReviewMode } from "@/lib/reviewMode";

type Reviewer = { name: string; role: string; fach: string };

const ROLES = [
  "Assistenzarzt/-ärztin",
  "Facharzt/-ärztin",
  "Dozent/-in",
  "PJ / höheres Semester",
];

const REVIEWER_KEY = "medcase:reviewer";

export function ReviewClient({ accessKey }: { accessKey: string }) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [draft, setDraft] = useState<Reviewer>({ name: "", role: ROLES[0], fach: "" });

  useEffect(() => {
    try {
      const r = localStorage.getItem(REVIEWER_KEY);
      if (r) setReviewer(JSON.parse(r));
    } catch {}
  }, []);

  function saveReviewer() {
    if (!draft.name.trim()) return;
    localStorage.setItem(REVIEWER_KEY, JSON.stringify(draft));
    setReviewer(draft);
  }

  function startPlaying() {
    if (!reviewer) return;
    startReviewMode({ reviewer, accessKey });
    router.push("/");
  }

  // Schritt 1: Reviewer-Daten (einmalig, lokal gemerkt).
  if (!reviewer) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-extrabold tracking-tight">Fall-Review</h1>
        <p className="mt-1 text-sm text-muted">
          Danke, dass du Medcase gegenliest. Kurz zu dir — wird lokal gespeichert und
          jedem Feedback beigelegt, damit wir nachfassen und dich (auf Wunsch) als
          Reviewer:in nennen können.
        </p>
        <div className="card mt-6 flex flex-col gap-4 p-6">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-lg border-[1.5px] border-card-border/20 px-3 py-2 text-sm font-normal outline-none focus:border-accent"
              placeholder="Dr. med. …"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Rolle
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              className="rounded-lg border-[1.5px] border-card-border/20 px-3 py-2 text-sm font-normal outline-none focus:border-accent"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Fachrichtung
            <input
              value={draft.fach}
              onChange={(e) => setDraft({ ...draft, fach: e.target.value })}
              className="rounded-lg border-[1.5px] border-card-border/20 px-3 py-2 text-sm font-normal outline-none focus:border-accent"
              placeholder="z.B. Innere Medizin"
            />
          </label>
          <button
            onClick={saveReviewer}
            disabled={!draft.name.trim()}
            className="mt-1 rounded-xl bg-accent py-3 font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Weiter →
          </button>
        </div>
      </div>
    );
  }

  // Schritt 2: Erklärung + Start ins Spiel (Review-Modus).
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-extrabold tracking-tight">Bereit, {reviewer.name}?</h1>
      <p className="mt-1 text-sm text-muted">
        {reviewer.role}
        {reviewer.fach ? ` · ${reviewer.fach}` : ""}
      </p>

      <div className="card mt-6 flex flex-col gap-4 p-6">
        <p className="text-sm leading-relaxed text-foreground/90">
          Du spielst jetzt echte Fälle — genau wie ein:e Student:in: Befunde selbst
          anfordern, Diagnose stellen. <span className="font-semibold">Nach jedem Fall</span>{" "}
          gibst du ein kurzes fachliches Urteil (plausibel / geht so / nicht plausibel).
          Wenn du magst, beantwortest du am Ende{" "}
          <span className="font-semibold">ein paar Fragen zum Produkt</span>.
        </p>
        <button
          onClick={startPlaying}
          className="group rounded-xl bg-accent py-3.5 text-lg font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
        >
          Spielen &amp; bewerten{" "}
          <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
        </button>
        <button
          onClick={() => {
            localStorage.removeItem(REVIEWER_KEY);
            setReviewer(null);
          }}
          className="text-xs font-medium text-muted hover:text-accent"
        >
          Andere Person? Angaben ändern
        </button>
      </div>

      <a
        href={`/review/uebersicht?key=${encodeURIComponent(accessKey)}`}
        className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
      >
        Bisherige Reviews ansehen →
      </a>
    </div>
  );
}
