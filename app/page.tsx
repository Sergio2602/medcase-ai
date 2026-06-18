"use client";

import { useEffect, useState } from "react";
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
      const minDelay = new Promise((resolve) => setTimeout(resolve, 1800));
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
      await minDelay;
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

  function goHome() {
    setPhase("start");
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
            onGoHome={goHome}
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
          />
        )}
      </div>
    </div>
  );
}

function PatientPreviewCard() {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-3">
        <div
          className="avatar-circle h-9 w-9 text-xs"
          style={{ backgroundColor: "#90CAF9" }}
        >
          KM
        </div>
        <div>
          <p className="text-sm font-bold">Klaus M.</p>
          <p className="text-xs text-muted">58 J. · männlich</p>
        </div>
      </div>
      <p className="mb-3 border-l-[1.5px] border-card-border/20 pl-3 text-sm italic">
        „Starke Brustschmerzen seit heute Morgen …"
      </p>
      <div className="mb-3 flex flex-col gap-1.5 text-sm font-semibold">
        <span className="text-accent">▤ Anamnese</span>
        <span className="text-accent">✓ Untersuchung</span>
      </div>
      <div className="flex gap-2">
        <span className="rounded-full bg-[#eef7f0] px-2.5 py-1 text-xs font-bold text-[#15803d]">
          90 Punkte
        </span>
        <span className="rounded-full bg-[#eef7f0] px-2.5 py-1 text-xs font-bold text-[#15803d]">
          4/5 gelöst
        </span>
      </div>
    </div>
  );
}

function StatsRow() {
  return (
    <div className="mt-10 grid grid-cols-3 divide-x divide-card-border/15 border-t border-card-border/15 pt-6">
      <div className="px-4 text-center first:pl-0">
        <p className="text-2xl font-extrabold">140+</p>
        <p className="text-sm text-muted">Klinische Fälle</p>
      </div>
      <div className="px-4 text-center">
        <p className="text-2xl font-extrabold">3</p>
        <p className="text-sm text-muted">Schwierigkeitsstufen</p>
      </div>
      <div className="px-4 text-center opacity-50 last:pr-0">
        <p className="text-base font-bold">Pro-Preis folgt</p>
        <p className="text-sm text-muted">nach Validierung</p>
      </div>
    </div>
  );
}

const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; description: string }
> = {
  vorklinik: {
    label: "Vorklinik",
    description: "Grundlagenfächer: Anatomie, Physiologie, Biochemie.",
  },
  klinik: {
    label: "Innere",
    description: "Internistische Leitsymptome und Differentialdiagnosen.",
  },
  examen: {
    label: "PJ",
    description: "Komplexere Fälle wie im Praktischen Jahr.",
  },
};

const DIFFICULTY_ICONS: Record<Difficulty, string> = {
  vorklinik: "ti-book-2",
  klinik: "ti-stethoscope",
  examen: "ti-building-hospital",
};

function DifficultyModal({
  onSelect,
  onClose,
}: {
  onSelect: (d: Difficulty) => void;
  onClose: () => void;
}) {
  const [highlighted, setHighlighted] = useState<Difficulty | null>(null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-xl font-extrabold">Bereich wählen</h2>
        <p className="mb-5 text-sm text-muted">
          Wähle die Schwierigkeit für deinen ersten Fall.
        </p>
        <div className="flex flex-col gap-3">
          {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((id) => {
            const active = highlighted === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setHighlighted(id);
                  onSelect(id);
                }}
                className={`relative flex items-start gap-3 rounded-xl border-[1.5px] p-4 text-left transition-colors ${
                  active
                    ? "border-accent bg-[#eaf0fc]"
                    : "border-card-border/20 hover:border-accent"
                }`}
              >
                <i
                  className={`ti ${DIFFICULTY_ICONS[id]} mt-0.5 text-xl ${
                    active ? "text-accent" : "text-muted"
                  }`}
                />
                <div>
                  <p className="font-bold">{DIFFICULTY_INFO[id].label}</p>
                  <p className="mt-1 text-sm text-muted">
                    {DIFFICULTY_INFO[id].description}
                  </p>
                </div>
                {active && (
                  <i className="ti ti-check absolute right-4 top-4 text-lg text-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WelcomeNote() {
  return (
    <div className="card mt-10 flex gap-4 p-5">
      <div className="avatar-circle h-10 w-10 shrink-0 text-sm" style={{ backgroundColor: "#90CAF9" }}>
        S
      </div>
      <div>
        <p className="text-sm font-bold">Eine Nachricht von Sergio</p>
        {/* TODO Sergio: echten Text einsetzen */}
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Hi, ich bin Sergio, Medizinstudent im 7. Semester. Ich baue Medcase,
          weil ich selbst gemerkt habe wie sehr Fall-Denken hilft. Über
          Feedback freue ich mich jederzeit.
        </p>
      </div>
    </div>
  );
}

function StartScreen({ onStart }: { onStart: (d: Difficulty) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="grid gap-10 py-10 md:grid-cols-[1fr_320px] md:items-start">
      <div>
        <Logo size={36} />
        <span className="mt-7 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-[#eaf0fc] px-4 py-1.5 text-sm font-bold text-accent">
          Für Medizinstudierende · Deutschland
        </span>
        <h1 className="mt-6 max-w-xl text-5xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">
          Patientenfälle lösen. Nicht nur auswendig lernen.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
          Echte klinische Situationen — Anamnese, Untersuchung, Labor. Du
          entscheidest was du brauchst. Weniger Untersuchungen, mehr Punkte.
        </p>
        <button
          onClick={() => setShowPicker(true)}
          className="mt-8 rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
        >
          Jetzt starten →
        </button>
        <p className="mt-3 text-sm text-muted">
          Kostenlos · Kein Account nötig · 5 Fälle täglich
        </p>
        <StatsRow />
        <WelcomeNote />
      </div>
      <PatientPreviewCard />
      {showPicker && (
        <DifficultyModal
          onSelect={onStart}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

const LOADING_STAGES = [
  { icon: "ti-door-enter", text: "Patient trifft in der Notaufnahme ein …" },
  { icon: "ti-notes", text: "Anamnese wird erhoben …" },
  { icon: "ti-flask", text: "Befunde werden vorbereitet …" },
  { icon: "ti-file-check", text: "Fall wird finalisiert …" },
];

function LoadingScreen() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 450);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 py-32 text-center">
      <Logo size={32} />
      <div className="motion-pulse flex flex-col items-center gap-3">
        <i
          className={`ti ${LOADING_STAGES[stage].icon} text-3xl text-accent`}
        />
        <p className="text-muted">{LOADING_STAGES[stage].text}</p>
      </div>
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
  onGoHome,
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
  onGoHome: () => void;
  dailyUsed: number;
  dailyLimit: number;
}) {
  const difficultyLabel =
    DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const color = avatarColorForCase(caseData.id);

  return (
    <div>
      <header className="sticky top-0 z-30 mb-6 -mt-8 border-b border-card-border/15 bg-background/95 px-1 py-5 backdrop-blur md:-mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onGoHome}
            className="transition-opacity hover:opacity-80"
          >
            <Logo size={30} />
          </button>
          <div className="flex items-center gap-3">
            <DifficultyPill label={difficultyLabel} />
            <StatPill label="PUNKTE" value={score} />
            <StatPill label="GELÖST" value={`${solved}/${played}`} />
          </div>
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
