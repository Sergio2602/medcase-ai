"use client";

import { useState } from "react";
import { Logo } from "./components/Logo";

type Difficulty = "vorklinik" | "klinik" | "examen";
type Phase = "start" | "loading" | "playing" | "result";
type Flag = "high" | "low" | "normal";

type LabValue = {
  name: string;
  value: string;
  unit: string;
  reference: string;
  flag: Flag;
};

type LabCategory = {
  category: string;
  values: LabValue[];
};

type Case = {
  id: string;
  difficulty: Difficulty;
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

type Revealed = { history: boolean; examination: boolean; labs: boolean };

const BASE_SCORE = 100;
const INVESTIGATION_COST = 10;
const MIN_SCORE = BASE_SCORE - 3 * INVESTIGATION_COST;

const AVATAR_COLORS = [
  "#EF9A9A",
  "#90CAF9",
  "#A5D6A7",
  "#FFD54F",
  "#CE93D8",
  "#FFAB73",
];

function avatarColorForCase(caseId: string) {
  let hash = 0;
  for (let i = 0; i < caseId.length; i++) {
    hash = (hash * 31 + caseId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "vorklinik", label: "Vorklinik" },
  { id: "klinik", label: "Innere" },
  { id: "examen", label: "PJ" },
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [difficulty, setDifficulty] = useState<Difficulty>("klinik");
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [revealed, setRevealed] = useState<Revealed>({
    history: false,
    examination: false,
    labs: false,
  });
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(
    null
  );
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [played, setPlayed] = useState(0);
  const [lastResultCorrect, setLastResultCorrect] = useState(false);
  const [lastScoreEarned, setLastScoreEarned] = useState(0);
  const [dailyUsed, setDailyUsed] = useState(0);
  const dailyLimit = 5;

  async function startCase(selected: Difficulty) {
    setDifficulty(selected);
    setPhase("loading");
    setRevealed({ history: false, examination: false, labs: false });
    setSelectedDiagnosis(null);
    try {
      const res = await fetch("/api/generate-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: selected }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      }
      setActiveCase(data as Case);
      setDailyUsed((d) => d + 1);
      setPhase("playing");
    } catch {
      setPhase("start");
    }
  }

  function revealCount(r: Revealed) {
    return Object.values(r).filter(Boolean).length;
  }

  function submitDiagnosis(option: string) {
    if (!activeCase || selectedDiagnosis) return;
    setSelectedDiagnosis(option);
    const correct = option === activeCase.correctDiagnosis;
    const earned = correct
      ? Math.max(BASE_SCORE - revealCount(revealed) * INVESTIGATION_COST, MIN_SCORE)
      : 0;
    setLastResultCorrect(correct);
    setLastScoreEarned(earned);
    setScore((s) => s + earned);
    setPlayed((p) => p + 1);
    if (correct) setSolved((s) => s + 1);
    setTimeout(() => setPhase("result"), 500);
  }

  function nextCase() {
    startCase(difficulty);
  }

  return (
    <div className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        {phase === "start" && <StartScreen onStart={startCase} />}
        {phase === "loading" && <LoadingScreen />}
        {(phase === "playing" || phase === "result") && activeCase && (
          <GameScreen
            caseData={activeCase}
            difficulty={difficulty}
            score={score}
            solved={solved}
            played={played}
            revealed={revealed}
            setRevealed={setRevealed}
            selectedDiagnosis={selectedDiagnosis}
            onSubmitDiagnosis={submitDiagnosis}
            phase={phase}
            lastResultCorrect={lastResultCorrect}
            lastScoreEarned={lastScoreEarned}
            onNext={nextCase}
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
          />
        )}
      </div>
    </div>
  );
}

function DifficultyToggle({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const index = DIFFICULTIES.findIndex((d) => d.id === value);
  return (
    <div className="relative flex rounded-xl border-[1.5px] border-card-border/20 bg-card p-1">
      <div
        className="absolute inset-y-1 left-1 rounded-lg bg-accent transition-transform duration-300"
        style={{
          width: `calc((100% - 0.5rem) / 3)`,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
      {DIFFICULTIES.map((d) => (
        <button
          key={d.id}
          onClick={() => onChange(d.id)}
          className={`relative z-10 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
            value === d.id ? "text-accent-foreground" : "text-foreground"
          }`}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

function StartScreen({ onStart }: { onStart: (d: Difficulty) => void }) {
  const [pending, setPending] = useState<Difficulty>("klinik");
  return (
    <div className="flex flex-col items-center gap-10 py-20 text-center">
      <Logo size={36} />
      <div>
        <h1 className="text-3xl font-extrabold">
          Klinisches Denken trainieren
        </h1>
        <p className="mt-2 text-muted">
          Wähle einen Bereich, um deinen ersten Fall zu starten.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <DifficultyToggle value={pending} onChange={setPending} />
      </div>
      <button
        onClick={() => onStart(pending)}
        className="rounded-xl bg-accent px-8 py-3 font-bold text-accent-foreground transition-transform hover:scale-[1.02]"
      >
        Fall starten
      </button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-center motion-pulse">
      <Logo size={32} />
      <p className="text-muted">Patient wird vorbereitet …</p>
    </div>
  );
}

function DifficultyPill({ label }: { label: string }) {
  return (
    <span className="rounded-lg border-[1.5px] border-card-border/20 bg-card px-3 py-1.5 text-sm font-semibold">
      {label}
    </span>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <span className="rounded-lg border-[1.5px] border-card-border/20 bg-card px-3 py-1.5 text-sm font-semibold">
      <span className="mr-1 text-muted">{label}</span>
      <span className="text-accent">{value}</span>
    </span>
  );
}

function RevealButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`rounded-xl border-[1.5px] px-4 py-2.5 font-medium transition-colors ${
        done
          ? "border-[#16a34a]/30 bg-[#16a34a]/10 text-[#16a34a]"
          : "border-card-border/20 bg-card hover:border-accent"
      }`}
    >
      {done ? "✓ " : "○ "}
      {label}
    </button>
  );
}

function FindingCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="card p-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </p>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}

function LabCard({
  labs,
  imaging,
}: {
  labs: LabCategory[];
  imaging: string;
}) {
  return (
    <div className="card p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
        Labor
      </p>
      {labs.map((cat) => (
        <div key={cat.category} className="mb-4 last:mb-0">
          <p className="mb-2 text-sm font-semibold">{cat.category}</p>
          <table className="clinical-data w-full text-sm">
            <thead>
              <tr className="border-b border-card-border/15 text-left text-xs uppercase text-muted">
                <th className="pb-1 pr-4">Parameter</th>
                <th className="pb-1 pr-4">Wert</th>
                <th className="pb-1 pr-4">Einheit</th>
                <th className="pb-1">Referenz</th>
              </tr>
            </thead>
            <tbody>
              {cat.values.map((v) => (
                <tr
                  key={v.name}
                  className="border-b border-card-border/10 last:border-0"
                >
                  <td className="py-1.5 pr-4">{v.name}</td>
                  <td
                    className={`py-1.5 pr-4 font-semibold ${
                      v.flag === "high"
                        ? "text-[#dc2626]"
                        : v.flag === "low"
                        ? "text-[#2563eb]"
                        : ""
                    }`}
                  >
                    {v.value}
                  </td>
                  <td className="py-1.5 pr-4 text-muted">{v.unit}</td>
                  <td className="py-1.5 text-muted">{v.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {imaging && (
        <div className="mt-2">
          <p className="mb-1 text-sm font-semibold">Bildgebung</p>
          <p className="leading-relaxed">{imaging}</p>
        </div>
      )}
    </div>
  );
}

function GameScreen({
  caseData,
  difficulty,
  score,
  solved,
  played,
  revealed,
  setRevealed,
  selectedDiagnosis,
  onSubmitDiagnosis,
  phase,
  lastResultCorrect,
  lastScoreEarned,
  onNext,
  dailyUsed,
  dailyLimit,
}: {
  caseData: Case;
  difficulty: Difficulty;
  score: number;
  solved: number;
  played: number;
  revealed: Revealed;
  setRevealed: React.Dispatch<React.SetStateAction<Revealed>>;
  selectedDiagnosis: string | null;
  onSubmitDiagnosis: (option: string) => void;
  phase: Phase;
  lastResultCorrect: boolean;
  lastScoreEarned: number;
  onNext: () => void;
  dailyUsed: number;
  dailyLimit: number;
}) {
  const difficultyLabel =
    DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const color = avatarColorForCase(caseData.id);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-3">
          <DifficultyPill label={difficultyLabel} />
          <StatPill label="PUNKTE" value={score} />
          <StatPill label="GELÖST" value={`${solved}/${played}`} />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-6">
          <div className="card flex gap-4 p-5">
            <div
              className="avatar-circle h-14 w-14 shrink-0 text-lg"
              style={{ backgroundColor: color }}
            >
              {initials(caseData.patientName)}
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {caseData.patientName}, {caseData.age} Jahre
              </h2>
              <p className="text-sm text-muted">
                {caseData.gender === "male" ? "Männlich" : "Weiblich"}
              </p>
              <blockquote className="mt-3 border-l-[1.5px] border-accent pl-3 italic">
                „{caseData.chiefComplaint}“
              </blockquote>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Befunde anfordern
            </p>
            <div className="flex flex-wrap gap-3">
              <RevealButton
                label="Anamnese"
                done={revealed.history}
                onClick={() =>
                  setRevealed((r) => ({ ...r, history: true }))
                }
              />
              <RevealButton
                label="Untersuchung"
                done={revealed.examination}
                onClick={() =>
                  setRevealed((r) => ({ ...r, examination: true }))
                }
              />
              <RevealButton
                label="Labor"
                done={revealed.labs}
                onClick={() => setRevealed((r) => ({ ...r, labs: true }))}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              Jeder Befund kostet{" "}
              <span className="font-semibold text-accent">−10 Punkte</span>
            </p>
          </div>

          {revealed.history && (
            <FindingCard title="Anamnese" text={caseData.history} />
          )}
          {revealed.examination && (
            <FindingCard
              title="Körperliche Untersuchung"
              text={caseData.examination}
            />
          )}
          {revealed.labs && (
            <LabCard labs={caseData.labs} imaging={caseData.imaging} />
          )}

          {phase === "playing" && (
            <div className="card p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                Diagnose stellen
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {caseData.diagnosisOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onSubmitDiagnosis(opt)}
                    disabled={!!selectedDiagnosis}
                    className={`rounded-xl border-[1.5px] px-4 py-3 text-left font-medium transition-colors ${
                      selectedDiagnosis === opt
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-card-border/20 bg-card hover:border-accent"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === "result" && (
            <div className="card p-5">
              <p
                className={`text-lg font-bold ${
                  lastResultCorrect ? "text-[#16a34a]" : "text-[#dc2626]"
                }`}
              >
                {lastResultCorrect
                  ? `Richtig — +${lastScoreEarned} Punkte`
                  : "Leider falsch"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Korrekte Diagnose:{" "}
                <span className="font-semibold text-foreground">
                  {caseData.correctDiagnosis}
                </span>
              </p>
              <p className="mt-3 leading-relaxed">{caseData.explanation}</p>
              <button
                onClick={onNext}
                className="mt-4 w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground"
              >
                Nächster Patient
              </button>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Fortschritt heute
            </p>
            <div className="mt-3 h-2 rounded-full bg-foreground/10">
              <div
                className="h-2 rounded-full bg-accent transition-all"
                style={{
                  width: `${Math.min((dailyUsed / dailyLimit) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              {dailyUsed} von {dailyLimit} Fällen · Free Tier
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
