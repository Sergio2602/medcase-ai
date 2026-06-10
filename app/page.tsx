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
    icon: "book",
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
    icon: "building-hospital",
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
    icon: "certificate",
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

// Tabler icon (webfont) rendered as an inline element. `name` is the icon
// slug without the `ti-` prefix, e.g. <Icon name="stethoscope" />.
function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <i className={`ti ti-${name} ${className}`} aria-hidden />;
}

// Patient avatar — a Tabler user glyph tinted by the patient's mood:
// teal while playing, green when the diagnosis was right, red when wrong.
function PatientAvatar({ expression }: { expression: Expression }) {
  const tone =
    expression === "happy"
      ? "text-emerald-500"
      : expression === "sad"
        ? "text-rose-500"
        : "text-brand";

  return (
    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 sm:h-32 sm:w-32">
      <Icon name="user" className={`text-6xl sm:text-7xl ${tone}`} />
      <span className="sr-only">Patient</span>
    </div>
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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header / scoreboard — dark teal bar */}
      <header className="bg-brand-dark">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Icon name="heartbeat" className="text-2xl text-teal-300" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              MedCase
              <span className="text-teal-300">.AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {difficultyMeta &&
              (phase === "playing" ||
                phase === "result" ||
                phase === "loading") && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                  <Icon name="school" className="text-sm text-teal-200" />
                  <span>{difficultyMeta.short}</span>
                </span>
              )}
            <div className="flex gap-4 text-right text-xs">
              <div>
                <div className="font-mono text-lg font-bold text-teal-300">
                  {totalScore}
                </div>
                <div className="text-teal-100/60">PUNKTE</div>
              </div>
              <div>
                <div className="font-mono text-lg font-bold text-white">
                  {solved}/{played}
                </div>
                <div className="text-teal-100/60">GELÖST</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-5 sm:py-14">
        {/* START — intro + difficulty selection, then the start button */}
        {phase === "start" && (
          <div className="flex flex-1 flex-col">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Kriegst du die Diagnose raus?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Gleich stellt sich ein Patient vor. Erhebe die Anamnese,
                untersuche ihn, fordere Labor an – und leg dich auf eine
                Diagnose fest. Je weniger Hinweise du brauchst, desto mehr
                Punkte gibt&apos;s.
              </p>
            </div>

            <p className="mb-3 text-center text-sm font-semibold text-slate-700">
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
                    className={`flex flex-col rounded-2xl border-2 p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-brand ${
                      active
                        ? "border-brand bg-brand/5"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <Icon
                      name={level.icon}
                      className={`text-4xl ${
                        active ? "text-brand" : "text-slate-400"
                      }`}
                    />
                    <span className="mt-3 text-lg font-bold text-slate-900">
                      {level.title}
                    </span>
                    <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Für wen: {level.audience}
                    </span>
                    <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-600">
                      {level.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2">
                          <Icon
                            name="chevron-right"
                            className={`mt-0.5 text-sm ${
                              active ? "text-brand" : "text-slate-400"
                            }`}
                          />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-rose-600" role="alert">
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
                  className="w-full max-w-xs rounded-xl bg-brand px-8 py-4 font-semibold text-white shadow-lg shadow-brand/20 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-white active:opacity-90"
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
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="text-sm text-slate-500">
              Nächster Patient wird aufgerufen…
            </p>
          </div>
        )}

        {/* PLAYING + RESULT share the patient layout */}
        {(phase === "playing" || phase === "result") && medCase && (
          <div className="flex flex-1 flex-col gap-6">
            {/* Patient + speech bubble — stacks vertically on mobile */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <PatientAvatar expression={expression} />
              </div>
              <div className="w-full text-center sm:flex-1 sm:text-left">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {medCase.patientName}, {medCase.age} Jahre,{" "}
                  {medCase.gender === "male" ? "m" : "w"}
                </div>
                <div className="relative rounded-2xl rounded-t-sm bg-[#e6f7f2] p-4 text-sm leading-relaxed text-slate-800 ring-1 ring-brand/25 sm:rounded-t-2xl sm:rounded-tl-sm">
                  {/* tail: points up on mobile (avatar above), left on desktop (avatar beside) */}
                  <span
                    className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#e6f7f2] sm:top-4 sm:translate-x-0 sm:-left-1.5"
                    aria-hidden
                  />
                  &ldquo;{medCase.chiefComplaint}&rdquo;
                </div>
              </div>
            </div>

            {/* Revealed investigation findings */}
            <div className="flex flex-col gap-3">
              {revealed.history && (
                <Finding label="Anamnese" tone="primary" text={medCase.history} />
              )}
              {revealed.examination && (
                <Finding
                  label="Körperliche Untersuchung"
                  tone="secondary"
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
              <div className="mt-auto">
                <p className="mb-3 text-center text-xs text-slate-500">
                  Untersuche den Patienten schrittweise — jeder Hinweis kostet
                  −10 Punkte
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ActionButton
                    icon="message-2"
                    label="Anamnese erheben"
                    done={revealed.history}
                    onClick={() => reveal("history")}
                  />
                  <ActionButton
                    icon="stethoscope"
                    label="Patient untersuchen"
                    done={revealed.examination}
                    onClick={() => reveal("examination")}
                  />
                  <ActionButton
                    icon="flask"
                    label="Labor anfordern"
                    done={revealed.labs}
                    onClick={() => reveal("labs")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDiagnosisPicker(true)}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-brand-dark/20 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-white"
                  >
                    <Icon name="brain" className="text-lg" />
                    Diagnose stellen
                  </button>
                </div>
              </div>
            )}

            {/* Diagnosis picker */}
            {phase === "playing" && showDiagnosisPicker && (
              <div className="mt-auto flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Deine Verdachtsdiagnose?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDiagnosisPicker(false)}
                    className="-mr-1 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    <Icon name="arrow-left" className="text-sm" />
                    zurück
                  </button>
                </div>
                {medCase.diagnosisOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => submitDiagnosis(option)}
                    className="min-h-[56px] rounded-xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-800 ring-1 ring-slate-200 transition hover:bg-brand/5 hover:ring-brand/50 focus:outline-none focus:ring-2 focus:ring-brand active:bg-brand/10"
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
                      ? "bg-brand/10 ring-brand/30"
                      : "bg-rose-50 ring-rose-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex items-center gap-2 text-lg font-bold ${
                        isCorrect ? "text-brand-dark" : "text-rose-600"
                      }`}
                    >
                      <Icon
                        name={isCorrect ? "circle-check" : "circle-x"}
                        className="text-xl"
                      />
                      {isCorrect ? "Richtig!" : "Leider falsch"}
                    </span>
                    <span className="font-mono text-2xl font-bold text-slate-900">
                      +{caseScore}
                    </span>
                  </div>
                  {!isCorrect && (
                    <p className="mt-2 text-sm text-slate-600">
                      Du hattest{" "}
                      <span className="font-semibold text-rose-600">
                        {selected}
                      </span>{" "}
                      getippt.
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-700">
                    Die richtige Diagnose lautet{" "}
                    <span className="font-semibold text-brand-dark">
                      {medCase.correctDiagnosis}
                    </span>
                    .
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {medCase.explanation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => newPatient()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 font-semibold text-white shadow-lg shadow-brand/20 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-white active:opacity-90"
                >
                  Nächster Patient
                  <Icon name="arrow-right" className="text-lg" />
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
  tone: "primary" | "secondary";
}) {
  const tones = {
    primary: "text-brand",
    secondary: "text-[#0e7490]",
  };
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}
      >
        {label}
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

// Structured laboratory results rendered as a grouped table with reference
// ranges and ↑/↓ flags for out-of-range values.
function LabResults({ labs }: { labs: LabCategory[] }) {
  const flagStyles: Record<LabFlag, string> = {
    high: "text-rose-600",
    low: "text-sky-600",
    normal: "text-slate-700",
  };
  const arrows: Record<LabFlag, string> = {
    high: "↑",
    low: "↓",
    normal: "",
  };

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
        <Icon name="flask" className="text-sm" />
        <span>Laborwerte</span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400">
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
                className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand/80"
              >
                {group.category}
              </td>
            </tr>
            {group.values.map((v) => (
              <tr
                key={v.name}
                className="border-t border-slate-200 align-baseline"
              >
                <td className="py-1.5 pr-2 text-slate-600">{v.name}</td>
                <td
                  className={`whitespace-nowrap py-1.5 pl-3 text-right font-mono tabular-nums ${flagStyles[v.flag]}`}
                >
                  <span className="font-medium">{v.value}</span>
                  <span className="ml-1 text-xs text-slate-400">{v.unit}</span>
                  {arrows[v.flag] && (
                    <span className="ml-1 font-semibold">{arrows[v.flag]}</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right font-mono text-xs tabular-nums text-slate-400">
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
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
        <Icon name="scan" className="text-sm" />
        <span>Bildgebung</span>
      </div>
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-lg text-brand ring-1 ring-brand/20">
          <Icon name="scan" />
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{text}</p>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  done,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  done: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-semibold ring-1 transition focus:outline-none focus:ring-2 focus:ring-brand ${
        done
          ? "cursor-not-allowed bg-slate-50 text-slate-400 ring-slate-200"
          : "bg-white text-slate-800 ring-slate-200 hover:bg-brand/5 hover:ring-brand/40 active:bg-brand/10"
      }`}
    >
      {done ? (
        <>
          <Icon name="check" className="text-base text-slate-400" />
          Erledigt
        </>
      ) : (
        <>
          <Icon name={icon} className="text-lg text-brand" />
          {label}
        </>
      )}
    </button>
  );
}
