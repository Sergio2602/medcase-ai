"use client";

import { useState } from "react";
import type { ReviewSession } from "@/lib/reviewMode";

const QUESTIONS: { key: string; label: string; opts: string[] }[] = [
  {
    key: "klinischesDenken",
    label: "Trainiert Medcase deiner Einschätzung nach klinisches Denken (Befunde gezielt anfordern, Diagnose abwägen)?",
    opts: ["Deutlich", "Etwas", "Kaum", "Gar nicht"],
  },
  {
    key: "empfehlung",
    label: "Würdest du Medcase Medizinstudierenden weiterempfehlen?",
    opts: ["Ja, klar", "Eher ja", "Eher nein", "Nein"],
  },
  {
    key: "mechanik",
    label: "War das Spielprinzip (Befunde anfordern → Diagnose → Punkte) direkt verständlich?",
    opts: ["Ja, sofort", "Nach kurzer Eingewöhnung", "Nein, verwirrend"],
  },
  {
    key: "realismus",
    label: "Fühlen sich die Fälle wie realistische Patient:innen an (Anamnese, Befunde, Verlauf)?",
    opts: ["Sehr realistisch", "Überwiegend", "Teils", "Unrealistisch"],
  },
  {
    key: "schwierigkeit",
    label: "Ist der Schwierigkeitsgrad für Studierende zum Lernen angemessen?",
    opts: ["Genau richtig", "Eher zu leicht", "Eher zu schwer"],
  },
  {
    key: "einverstaendnis",
    label: "Dürfen wir dein Urteil nutzen, um Medcase Studierenden und Fakultäten glaubwürdig vorzustellen?",
    opts: ["Ja, mit Namen", "Ja, aber anonym", "Nein, nur intern"],
  },
];

export function SessionFeedbackModal({
  session,
  onClose,
}: {
  session: ReviewSession;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freitext, setFreitext] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "session",
          ...answers,
          freitext,
          reviewer: session.reviewer,
          accessKey: session.accessKey,
        }),
      });
      if (!res.ok) throw new Error();
      setState("ok");
    } catch {
      setState("error");
    }
  }

  function copyLink() {
    try {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {}
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/40 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[20px] border-[1.5px] border-card-border/15 bg-card sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {state === "ok" ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-[#1b5e20]">
              <i className="ti ti-check text-2xl" />
            </span>
            <p className="text-lg font-extrabold">Danke für dein Feedback!</p>
            <p className="max-w-sm text-sm text-muted">
              Wenn dich Medcase überzeugt, empfiehl es gern deinen Studierenden oder
              Kolleg:innen weiter.
            </p>
            <button
              onClick={copyLink}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-accent/40 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
            >
              <i className="ti ti-copy" />
              {copied ? "Link kopiert" : "Link kopieren"}
            </button>
            <button onClick={onClose} className="mt-2 text-sm font-semibold text-muted hover:text-accent">
              Schließen
            </button>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-card-border/10 px-6 pb-4 pt-6">
              <h2 className="text-xl font-extrabold tracking-tight">Kurzes Produkt-Feedback</h2>
              <p className="mt-1 text-sm text-muted">
                Ein paar Fragen, ~1 Minute. Dein Fachurteil hilft uns am meisten.
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <p className="mb-2 text-[13.5px] font-semibold leading-snug">{q.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.opts.map((o) => (
                      <button
                        key={o}
                        onClick={() => setAnswers((a) => ({ ...a, [q.key]: o }))}
                        className={`rounded-lg border-[1.5px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                          answers[q.key] === o
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-card-border/20 text-muted hover:border-accent"
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="mb-2 text-[13.5px] font-semibold leading-snug">
                  Was würdest du verbessern — inhaltlich, didaktisch oder an der Bedienung?
                </p>
                <textarea
                  value={freitext}
                  onChange={(e) => setFreitext(e.target.value)}
                  rows={3}
                  placeholder="Optional …"
                  className="w-full rounded-lg border-[1.5px] border-card-border/20 px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-card-border/10 px-6 pb-6 pt-3">
              {state === "error" && (
                <p className="mb-2 text-sm text-[#b3524f]">Fehlgeschlagen — nochmal versuchen.</p>
              )}
              <button
                onClick={submit}
                disabled={answeredCount === 0 && !freitext.trim()}
                className="w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state === "sending" ? "Sende…" : "Feedback absenden"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
