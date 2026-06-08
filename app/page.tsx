"use client";

import { useState } from "react";

type Expression = "neutral" | "pain" | "happy" | "sad";

type MedCase = {
  patientName: string;
  age: number;
  gender: "male" | "female";
  chiefComplaint: string;
  history: string;
  examination: string;
  labs: string;
  correctDiagnosis: string;
  diagnosisOptions: string[];
  explanation: string;
};

type Phase = "start" | "loading" | "playing" | "result";

type InvestigationKey = "history" | "examination" | "labs";

const INVESTIGATION_COST = 10;
const BASE_SCORE = 100;

// A simple SVG patient face whose features shift with the patient's mood.
function PatientFace({ expression }: { expression: Expression }) {
  const skin = "#f0c9a4";

  // Eyebrows + mouth path drive the emotion.
  const brows: Record<Expression, string> = {
    neutral: "M30 42 L46 42 M74 42 L90 42",
    pain: "M30 46 L46 38 M74 38 L90 46",
    happy: "M30 40 L46 44 M74 44 L90 40",
    sad: "M30 38 L46 44 M74 44 L90 38",
  };

  const mouths: Record<Expression, string> = {
    neutral: "M46 78 Q60 80 74 78",
    pain: "M46 82 Q60 70 74 82", // grimace
    happy: "M44 74 Q60 92 76 74", // smile
    sad: "M44 84 Q60 72 76 84", // frown
  };

  const expressionLabel: Record<Expression, string> = {
    neutral: "neutral",
    pain: "schmerzverzerrt",
    happy: "erleichtert",
    sad: "traurig",
  };

  return (
    <svg
      viewBox="0 0 120 120"
      className="h-28 w-28 drop-shadow-lg sm:h-32 sm:w-32"
      role="img"
      aria-label={`Patient wirkt ${expressionLabel[expression]}`}
    >
      <circle cx="60" cy="60" r="52" fill={skin} stroke="#0f172a" strokeWidth="3" />
      {/* eyes */}
      <circle cx="42" cy="56" r="6" fill="#0f172a" />
      <circle cx="78" cy="56" r="6" fill="#0f172a" />
      {/* eyebrows */}
      <path
        d={brows[expression]}
        stroke="#0f172a"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* mouth */}
      <path
        d={mouths[expression]}
        stroke="#0f172a"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* sweat drop when in pain */}
      {expression === "pain" && (
        <path
          d="M98 40 q-5 8 0 12 a4 4 0 0 0 6 -6 z"
          fill="#38bdf8"
          opacity="0.85"
        />
      )}
    </svg>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [medCase, setMedCase] = useState<MedCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Record<InvestigationKey, boolean>>({
    history: false,
    examination: false,
    labs: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [showDiagnosisPicker, setShowDiagnosisPicker] = useState(false);

  const [caseScore, setCaseScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [played, setPlayed] = useState(0);

  const isCorrect = selected !== null && selected === medCase?.correctDiagnosis;

  async function newPatient() {
    setPhase("loading");
    setError(null);
    setMedCase(null);
    setRevealed({ history: false, examination: false, labs: false });
    setSelected(null);
    setShowDiagnosisPicker(false);
    setCaseScore(0);

    try {
      const response = await fetch("/api/generate-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Etwas ist schiefgelaufen.");
      }

      setMedCase(data as MedCase);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      setPhase("start");
    }
  }

  function reveal(key: InvestigationKey) {
    setRevealed((prev) => ({ ...prev, [key]: true }));
  }

  function submitDiagnosis(diagnosis: string) {
    if (!medCase) return;

    const usedInvestigations =
      Object.values(revealed).filter(Boolean).length;
    const correct = diagnosis === medCase.correctDiagnosis;
    const score = correct
      ? Math.max(
          BASE_SCORE - usedInvestigations * INVESTIGATION_COST,
          BASE_SCORE - 3 * INVESTIGATION_COST
        )
      : 0;

    setSelected(diagnosis);
    setCaseScore(score);
    setTotalScore((t) => t + score);
    setPlayed((p) => p + 1);
    if (correct) setSolved((s) => s + 1);
    setShowDiagnosisPicker(false);
    setPhase("result");
  }

  const expression: Expression =
    phase === "result" ? (isCorrect ? "happy" : "sad") : "pain";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10 sm:py-14">
        {/* Header / scoreboard */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <h1 className="text-xl font-bold tracking-tight">
              MedCase
              <span className="text-emerald-400">.AI</span>
            </h1>
          </div>
          <div className="flex gap-4 text-right text-xs">
            <div>
              <div className="font-mono text-lg font-bold text-emerald-400">
                {totalScore}
              </div>
              <div className="text-slate-500">PUNKTE</div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-sky-400">
                {solved}/{played}
              </div>
              <div className="text-slate-500">GELÖST</div>
            </div>
          </div>
        </header>

        {/* START */}
        {phase === "start" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <div className="rounded-full bg-slate-900 p-6 ring-1 ring-slate-800">
              <PatientFace expression="neutral" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                Trauen Sie sich die Diagnose zu?
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-400">
                Ein neuer Patient kommt herein. Befragen Sie ihn, untersuchen
                Sie ihn, fordern Sie Labor an – und stellen Sie dann die
                Diagnose. Je weniger Hinweise Sie brauchen, desto höher Ihre
                Punktzahl.
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={newPatient}
              className="rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Ersten Patienten ansehen
            </button>
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Ein Patient meldet sich an…</p>
          </div>
        )}

        {/* PLAYING + RESULT share the patient layout */}
        {(phase === "playing" || phase === "result") && medCase && (
          <div className="flex flex-1 flex-col gap-6">
            {/* Patient + speech bubble */}
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-full bg-slate-900 p-3 ring-1 ring-slate-800">
                <PatientFace expression={expression} />
              </div>
              <div className="flex-1">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {medCase.patientName}, {medCase.age} Jahre,{" "}
                  {medCase.gender === "male" ? "m" : "w"}
                </div>
                <div className="relative rounded-2xl rounded-tl-sm bg-slate-800 p-4 text-sm leading-relaxed text-slate-100 ring-1 ring-slate-700">
                  <span
                    className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 bg-slate-800"
                    aria-hidden
                  />
                  &ldquo;{medCase.chiefComplaint}&rdquo;
                </div>
              </div>
            </div>

            {/* Revealed investigation findings */}
            <div className="flex flex-col gap-3">
              {revealed.history && (
                <Finding label="Anamnese" tone="sky" text={medCase.history} />
              )}
              {revealed.examination && (
                <Finding
                  label="Untersuchung"
                  tone="violet"
                  text={medCase.examination}
                />
              )}
              {revealed.labs && (
                <Finding
                  label="Labor & Bildgebung"
                  tone="amber"
                  text={medCase.labs}
                />
              )}
            </div>

            {/* PLAYING controls */}
            {phase === "playing" && !showDiagnosisPicker && (
              <div className="mt-auto grid grid-cols-2 gap-3">
                <ActionButton
                  done={revealed.history}
                  onClick={() => reveal("history")}
                >
                  💬 Anamnese erheben
                </ActionButton>
                <ActionButton
                  done={revealed.examination}
                  onClick={() => reveal("examination")}
                >
                  🔍 Patient untersuchen
                </ActionButton>
                <ActionButton
                  done={revealed.labs}
                  onClick={() => reveal("labs")}
                >
                  🧪 Labor anfordern
                </ActionButton>
                <button
                  type="button"
                  onClick={() => setShowDiagnosisPicker(true)}
                  className="rounded-xl bg-emerald-500 px-4 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  🎯 Diagnose stellen
                </button>
              </div>
            )}

            {/* Diagnosis picker */}
            {phase === "playing" && showDiagnosisPicker && (
              <div className="mt-auto flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-300">
                    Wie lautet Ihre Diagnose?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDiagnosisPicker(false)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    ← zurück zur Abklärung
                  </button>
                </div>
                {medCase.diagnosisOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => submitDiagnosis(option)}
                    className="rounded-xl bg-slate-800 px-4 py-3 text-left text-sm font-medium text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:ring-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* RESULT */}
            {phase === "result" && (
              <div className="mt-auto flex flex-col gap-4">
                <div
                  className={`rounded-2xl p-5 ring-1 ${
                    isCorrect
                      ? "bg-emerald-500/10 ring-emerald-500/40"
                      : "bg-red-500/10 ring-red-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-lg font-bold ${
                        isCorrect ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isCorrect ? "✓ Richtig!" : "✗ Leider falsch"}
                    </span>
                    <span className="font-mono text-2xl font-bold">
                      +{caseScore}
                    </span>
                  </div>
                  {!isCorrect && (
                    <p className="mt-2 text-sm text-slate-300">
                      Sie sagten{" "}
                      <span className="font-semibold text-red-300">
                        {selected}
                      </span>
                      .
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-200">
                    Die richtige Diagnose war{" "}
                    <span className="font-semibold text-emerald-300">
                      {medCase.correctDiagnosis}
                    </span>
                    .
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {medCase.explanation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={newPatient}
                  className="rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  Nächster Patient →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Finding({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "sky" | "violet" | "amber";
}) {
  const tones = {
    sky: "text-sky-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
  };
  return (
    <div className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
      <div
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}
      >
        {label}
      </div>
      <p className="text-sm leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  done,
}: {
  children: React.ReactNode;
  onClick: () => void;
  done: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      className={`rounded-xl px-4 py-4 text-sm font-semibold ring-1 transition focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
        done
          ? "cursor-not-allowed bg-slate-900 text-slate-600 ring-slate-800"
          : "bg-slate-800 text-slate-100 ring-slate-700 hover:bg-slate-700"
      }`}
    >
      {done ? "✓ Erledigt" : children}
    </button>
  );
}
