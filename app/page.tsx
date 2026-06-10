"use client";

import { useState } from "react";

type Expression = "neutral" | "pain" | "happy" | "sad";

type LabFlag = "high" | "low" | "normal";

type LabValue = {
  name: string;
  value: string;
  unit: string;
  reference: string;
  flag: LabFlag;
};

type LabCategory = {
  category: string;
  values: LabValue[];
};

type MedCase = {
  patientName: string;
  age: number;
  gender: "male" | "female";
  chiefComplaint: string;
  history: string;
  examination: string;
  labs: LabCategory[];
  imaging: string;
  correctDiagnosis: string;
  diagnosisOptions: string[];
  explanation: string;
};

type Phase = "start" | "loading" | "playing" | "result";

type InvestigationKey = "history" | "examination" | "labs";

type Difficulty = "vorklinik" | "klinik" | "examen";

type DifficultyLevel = {
  id: Difficulty;
  icon: string;
  title: string;
  short: string;
  audience: string;
  bullets: string[];
};

const DIFFICULTIES: DifficultyLevel[] = [
  {
    id: "vorklinik",
    icon: "🩺",
    title: "Vorklinik",
    short: "Vorklinik",
    audience: "Semester 1–4",
    bullets: [
      "Klassische Leitsymptome, keine Komplikationen",
      "Häufige Erkrankungen (Appendizitis, HWI, Pneumonie)",
      "Einfache Sprache, eindeutige Befunde",
    ],
  },
  {
    id: "klinik",
    icon: "🏥",
    title: "Klinik",
    short: "Klinik",
    audience: "Semester 5–8, Famulatur",
    bullets: [
      "Mehrere Symptome, Differentialdiagnosen erforderlich",
      "Atypische Verläufe möglich",
      "Labor und Untersuchung entscheidend",
    ],
  },
  {
    id: "examen",
    icon: "🎓",
    title: "PJ / Staatsexamen",
    short: "Examen",
    audience: "PJ, Examensvorbereitung",
    bullets: [
      "Komplexe Fälle mit Komorbiditäten",
      "Seltene und maskierte Diagnosen",
      "Zeitdruck, unvollständige Informationen",
    ],
  },
];

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

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  // Card highlighted on the selection screen before the player confirms.
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(
    null
  );

  const difficultyMeta = DIFFICULTIES.find((d) => d.id === difficulty) ?? null;

  const isCorrect = selected !== null && selected === medCase?.correctDiagnosis;

  async function newPatient(level: Difficulty | null = difficulty) {
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
        body: JSON.stringify(level ? { difficulty: level } : {}),
        cache: "no-store",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Etwas ist schiefgelaufen.");
      }

      setMedCase(data as MedCase);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      // Return to the start screen with the chosen level still highlighted so
      // the player can retry.
      if (level) setPendingDifficulty(level);
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
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:px-5 sm:py-14">
        {/* Header / scoreboard */}
        <header className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <h1 className="text-xl font-bold tracking-tight">
              MedCase
              <span className="text-emerald-400">.AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {difficultyMeta &&
              (phase === "playing" ||
                phase === "result" ||
                phase === "loading") && (
                <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-700">
                  <span aria-hidden>{difficultyMeta.icon}</span>
                  <span>{difficultyMeta.short}</span>
                </span>
              )}
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
          </div>
        </header>

        {/* START — intro + difficulty selection, then the start button */}
        {phase === "start" && (
          <div className="flex flex-1 flex-col">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold">
                Kriegst du die Diagnose raus?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Gleich stellt sich ein Patient vor. Erhebe die Anamnese,
                untersuche ihn, fordere Labor an – und leg dich auf eine
                Diagnose fest. Je weniger Hinweise du brauchst, desto mehr
                Punkte gibt&apos;s.
              </p>
            </div>

            <p className="mb-3 text-center text-sm font-semibold text-slate-300">
              Wähle deinen Schwierigkeitsgrad
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {DIFFICULTIES.map((level) => {
                const active = pendingDifficulty === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setPendingDifficulty(level.id)}
                    aria-pressed={active}
                    className={`flex flex-col rounded-2xl border-2 p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                      active
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-4xl" aria-hidden>
                      {level.icon}
                    </span>
                    <span className="mt-3 text-lg font-bold">
                      {level.title}
                    </span>
                    <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Für wen: {level.audience}
                    </span>
                    <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-300">
                      {level.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2">
                          <span
                            className={
                              active ? "text-emerald-400" : "text-slate-500"
                            }
                            aria-hidden
                          >
                            ›
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            {pendingDifficulty && (
              <div className="mt-6 flex justify-center sm:mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setDifficulty(pendingDifficulty);
                    newPatient(pendingDifficulty);
                  }}
                  className="w-full max-w-xs rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 active:bg-emerald-400"
                >
                  Ersten Patienten aufrufen
                </button>
              </div>
            )}
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-slate-400">
              Nächster Patient wird aufgerufen…
            </p>
          </div>
        )}

        {/* PLAYING + RESULT share the patient layout */}
        {(phase === "playing" || phase === "result") && medCase && (
          <div className="flex flex-1 flex-col gap-6">
            {/* Patient + speech bubble — stacks vertically on mobile */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0 rounded-full bg-slate-900 p-3 ring-1 ring-slate-800">
                <PatientFace expression={expression} />
              </div>
              <div className="w-full text-center sm:flex-1 sm:text-left">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {medCase.patientName}, {medCase.age} Jahre,{" "}
                  {medCase.gender === "male" ? "m" : "w"}
                </div>
                <div className="relative rounded-2xl rounded-t-sm bg-slate-800 p-4 text-sm leading-relaxed text-slate-100 ring-1 ring-slate-700 sm:rounded-t-2xl sm:rounded-tl-sm">
                  {/* tail: points up on mobile (avatar above), left on desktop (avatar beside) */}
                  <span
                    className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-slate-800 sm:top-4 sm:translate-x-0 sm:-left-1.5"
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
                  label="Körperliche Untersuchung"
                  tone="violet"
                  text={medCase.examination}
                />
              )}
              {revealed.labs && (
                <>
                  <LabResults labs={medCase.labs} />
                  {medCase.imaging?.trim() && (
                    <Imaging text={medCase.imaging} />
                  )}
                </>
              )}
            </div>

            {/* PLAYING controls */}
            {phase === "playing" && !showDiagnosisPicker && (
              <div className="mt-auto grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    Deine Verdachtsdiagnose?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDiagnosisPicker(false)}
                    className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-300"
                  >
                    ← zurück
                  </button>
                </div>
                {medCase.diagnosisOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => submitDiagnosis(option)}
                    className="min-h-[56px] rounded-xl bg-slate-800 px-4 py-4 text-left text-sm font-medium text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:ring-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 active:bg-slate-700"
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
                      Du hattest{" "}
                      <span className="font-semibold text-red-300">
                        {selected}
                      </span>{" "}
                      getippt.
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-200">
                    Die richtige Diagnose lautet{" "}
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
                  onClick={() => newPatient()}
                  className="w-full rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 active:bg-emerald-400"
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
  tone: "sky" | "violet";
}) {
  const tones = {
    sky: "text-sky-400",
    violet: "text-violet-400",
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

// Structured laboratory results rendered as a grouped table with reference
// ranges and ↑/↓ flags for out-of-range values.
function LabResults({ labs }: { labs: LabCategory[] }) {
  const flagStyles: Record<LabFlag, string> = {
    high: "text-rose-400",
    low: "text-sky-400",
    normal: "text-slate-200",
  };
  const arrows: Record<LabFlag, string> = {
    high: "↑",
    low: "↓",
    normal: "",
  };

  return (
    <div className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-400">
        <span aria-hidden>🧪</span>
        <span>Laborwerte</span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th className="pb-1 text-left font-medium">Parameter</th>
            <th className="pb-1 pl-3 text-right font-medium">Wert</th>
            <th className="pb-1 pl-3 text-right font-medium">Referenz</th>
          </tr>
        </thead>
        {labs.map((group) => (
          <tbody key={group.category}>
            <tr>
              <td
                colSpan={3}
                className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-teal-300/80"
              >
                {group.category}
              </td>
            </tr>
            {group.values.map((v) => (
              <tr
                key={v.name}
                className="border-t border-slate-800/70 align-baseline"
              >
                <td className="py-1.5 pr-2 text-slate-300">{v.name}</td>
                <td
                  className={`whitespace-nowrap py-1.5 pl-3 text-right font-mono tabular-nums ${flagStyles[v.flag]}`}
                >
                  <span className="font-medium">{v.value}</span>
                  <span className="ml-1 text-xs text-slate-500">{v.unit}</span>
                  {arrows[v.flag] && (
                    <span className="ml-1 font-semibold">{arrows[v.flag]}</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right font-mono text-xs tabular-nums text-slate-500">
                  {v.reference}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// Imaging findings — narrative radiology report shown beneath the lab table.
function Imaging({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-400">
        <span aria-hidden>🩻</span>
        <span>Bildgebung</span>
      </div>
      <div className="flex gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-lg ring-1 ring-teal-500/20"
          aria-hidden
        >
          🩻
        </div>
        <p className="text-sm leading-relaxed text-slate-300">{text}</p>
      </div>
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
      className={`min-h-[56px] rounded-xl px-4 py-4 text-sm font-semibold ring-1 transition focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
        done
          ? "cursor-not-allowed bg-slate-900 text-slate-600 ring-slate-800"
          : "bg-slate-800 text-slate-100 ring-slate-700 hover:bg-slate-700 active:bg-slate-700"
      }`}
    >
      {done ? "✓ Erledigt" : children}
    </button>
  );
}
