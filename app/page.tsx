"use client";

import { useEffect, useState } from "react";
import { Logo } from "./components/Logo";

type Difficulty = "vorklinik" | "klinik" | "examen";
type Phase = "start" | "loading" | "playing" | "result";
type Flag = "high" | "low" | "normal";
type Discipline =
  | "zufaellig"
  | "innere"
  | "kardiologie"
  | "chirurgie"
  | "allgemeinmedizin"
  | "neurologie"
  | "hno"
  | "augenheilkunde"
  | "anaesthesiologie";

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
  keyTakeaway?: string;
  explanation: string;
};

type Revealed = {
  history: boolean;
  examination: boolean;
  imaging: boolean;
  labs: boolean;
};

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
  const [discipline, setDiscipline] = useState<Discipline>("zufaellig");
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [revealed, setRevealed] = useState<Revealed>({
    history: false,
    examination: false,
    imaging: false,
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

  async function startCase(selected: Difficulty, selectedDiscipline?: Discipline) {
    setDifficulty(selected);
    if (selectedDiscipline) setDiscipline(selectedDiscipline);
    setPhase("loading");
    setRevealed({
      history: false,
      examination: false,
      imaging: false,
      labs: false,
    });
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
      ? Math.max(
          BASE_SCORE - revealCount(revealed) * INVESTIGATION_COST,
          MIN_SCORE
        )
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
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1140px]">
        {phase === "start" && <StartScreen onStart={startCase} />}
        {phase === "loading" && <LoadingScreen />}
        {(phase === "playing" || phase === "result") && activeCase && (
          <GameScreen
            caseData={activeCase}
            difficulty={difficulty}
            discipline={discipline}
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

const PATIENT_PREVIEWS = [
  {
    initials: "KM",
    color: "#90caf9",
    name: "Klaus M.",
    meta: "58 J. · männlich",
    quote: "Starke Brustschmerzen seit heute Morgen …",
    revealed: ["Anamnese", "Untersuchung"],
    score: 90,
    solved: "4/5",
  },
  {
    initials: "SF",
    color: "#a5d6a7",
    name: "Sabine F.",
    meta: "34 J. · weiblich",
    quote: "Seit drei Tagen Fieber und Husten, jetzt auch Atemnot …",
    revealed: ["Anamnese", "Labor"],
    score: 80,
    solved: "3/5",
  },
  {
    initials: "TR",
    color: "#ffd54f",
    name: "Thomas R.",
    meta: "45 J. · männlich",
    quote: "Plötzlich einseitige Schwäche im Arm, Sprache verwaschen …",
    revealed: ["Anamnese"],
    score: 90,
    solved: "5/5",
  },
];

function RotatingPatientPreview() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % PATIENT_PREVIEWS.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const p = PATIENT_PREVIEWS[index];

  return (
    <div>
      <div
        className="card p-5 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="mb-3 flex items-center gap-3">
          <div
            className="avatar-circle h-9 w-9 text-xs"
            style={{ backgroundColor: p.color }}
          >
            {p.initials}
          </div>
          <div>
            <p className="text-sm font-bold">{p.name}</p>
            <p className="text-xs text-muted">{p.meta}</p>
          </div>
        </div>
        <p className="mb-3 border-l-[1.5px] border-card-border/20 pl-3 text-sm italic">
          „{p.quote}{'"'}
        </p>
        <div className="mb-3 flex flex-col gap-1.5 text-sm font-semibold">
          {p.revealed.map((f) => (
            <span key={f} className="flex items-center gap-1.5 text-accent">
              <i className="ti ti-check" />
              {f}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-[#eef7f0] px-2.5 py-1 text-xs font-bold text-[#15803d]">
            {p.score} Punkte
          </span>
          <span className="rounded-full bg-[#eef7f0] px-2.5 py-1 text-xs font-bold text-[#15803d]">
            {p.solved} gelöst
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {PATIENT_PREVIEWS.map((_, i) => (
          <div
            key={i}
            className="transition-all duration-300"
            style={{
              backgroundColor: "#a8a69c",
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: i === index ? 3 : 9999,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatsRow() {
  return (
    <div className="mt-3 grid grid-cols-3 divide-x divide-card-border/15 border-t border-card-border/15 pt-3">
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
    label: "Klinik",
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

const DISCIPLINES: { id: Discipline; label: string; locked: boolean }[] = [
  { id: "zufaellig", label: "Zufällig", locked: false },
  { id: "innere", label: "Innere", locked: false },
  { id: "kardiologie", label: "Kardiologie", locked: true },
  { id: "chirurgie", label: "Chirurgie", locked: true },
  { id: "allgemeinmedizin", label: "Allgemeinmedizin", locked: true },
  { id: "neurologie", label: "Neurologie", locked: true },
  { id: "hno", label: "HNO", locked: true },
  { id: "augenheilkunde", label: "Augenheilkunde", locked: true },
  { id: "anaesthesiologie", label: "Anästhesiologie", locked: true },
];

function BereichCard({
  id,
  icon,
  title,
  badge,
  description,
  selected,
  collapsed,
  onSelect,
}: {
  id: Difficulty;
  icon: string;
  title: string;
  badge?: string;
  description: string;
  selected: boolean;
  collapsed: boolean;
  onSelect: (id: Difficulty) => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={() => onSelect(id)}
        className="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-card-border/20 px-4 py-2.5 text-left transition-colors hover:border-accent"
      >
        <i className={`${icon} text-muted`} />
        <span className="font-semibold">{title}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(id)}
      className={`relative w-full rounded-xl border-[1.5px] px-5 py-4 text-left transition-colors ${
        selected
          ? "border-accent bg-accent"
          : "border-card-border/20 hover:border-accent"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className={`${icon} ${selected ? "text-accent-foreground" : ""}`} />
          <span
            className={`font-bold ${selected ? "text-accent-foreground" : ""}`}
          >
            {title}
          </span>
          {badge && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                selected ? "bg-white text-accent" : "bg-accent/10 text-accent"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {selected && (
          <i className="ti ti-check text-lg text-accent-foreground" />
        )}
      </div>
      <p
        className={`text-sm ${
          selected ? "text-accent-foreground/80" : "text-muted"
        }`}
      >
        {description}
      </p>
    </button>
  );
}

function DifficultyModal({
  onSelect,
  onClose,
}: {
  onSelect: (d: Difficulty, disc: Discipline) => void;
  onClose: () => void;
}) {
  const [highlighted, setHighlighted] = useState<Difficulty | null>(null);
  const [discipline, setDiscipline] = useState<Discipline>("zufaellig");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[20px] border-[1.5px] bg-card sm:max-w-md sm:rounded-xl"
        style={{ borderColor: "#d8d6cd" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="shrink-0 px-6 pb-4 pt-6">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
            {"LOS GEHT'S"}
          </span>
          <h2 className="mb-1 text-xl font-extrabold">Bereich wählen</h2>
          <p className="text-sm text-muted">
            Wähle die Schwierigkeit für deinen ersten Fall.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <div className="flex flex-col gap-2">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((id) => (
              <BereichCard
                key={id}
                id={id}
                icon={`ti ${DIFFICULTY_ICONS[id]} text-xl`}
                title={DIFFICULTY_INFO[id].label}
                badge={id === "klinik" ? "Neu: Disziplinen" : undefined}
                description={DIFFICULTY_INFO[id].description}
                selected={highlighted === id}
                collapsed={!!highlighted && highlighted !== id}
                onSelect={setHighlighted}
              />
            ))}
          </div>

          {highlighted === "klinik" && (
            <div className="mt-4 border-t border-dashed border-card-border/20 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                  Disziplin wählen
                </span>
                <span className="text-[11px] italic text-muted/70">
                  für deine Famulatur-Vorbereitung
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DISCIPLINES.map((d) => {
                  const selected = discipline === d.id;
                  if (d.locked) {
                    return (
                      <div
                        key={d.id}
                        className="flex cursor-not-allowed items-center justify-center gap-1 rounded-lg border-[1.5px] border-card-border/15 bg-foreground/[0.02] px-2 py-2.5 text-center text-xs font-semibold text-muted/60"
                      >
                        {d.label}
                        <i className="ti ti-lock text-[11px] opacity-60" />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={d.id}
                      onClick={() => setDiscipline(d.id)}
                      className={`rounded-lg border-[1.5px] px-2 py-2.5 text-center text-xs font-semibold transition-colors ${
                        selected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-card-border/20 bg-card hover:border-accent"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs leading-relaxed text-accent">
                <i className="ti ti-info-circle mt-0.5 text-sm" />
                Aktuell nur Innere spielbar. Weitere Fächer sind in Vorbereitung — kein festes Datum.
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div
          className="shrink-0 px-6 pb-6 pt-3"
          style={{ borderTop: "1.5px solid #d8d6cd" }}
        >
          <button
            onClick={() => highlighted && onSelect(highlighted, discipline)}
            disabled={!highlighted}
            className="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:bg-card-border/20 disabled:text-muted"
          >
            Fall starten →
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeNote() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card mt-3 flex gap-4 p-5">
      <div
        className="avatar-circle h-10 w-10 shrink-0 text-sm"
        style={{ backgroundColor: "#90caf9" }}
      >
        S
      </div>
      <div>
        <p className="text-sm font-bold">Eine Nachricht von Sergio</p>
        {/* TODO Sergio: echten Text einsetzen */}
        <p
          className={`mt-1 text-sm leading-relaxed text-muted ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          Hi, ich bin Sergio, Medizinstudent im 7. Semester. Ich baue Medcase,
          weil ich selbst gemerkt habe wie sehr Fall-Denken hilft. Über
          Feedback freue ich mich jederzeit.
        </p>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-1 text-sm font-semibold text-accent"
          >
            mehr lesen
          </button>
        )}
      </div>
    </div>
  );
}

function HowItWorksCard() {
  const steps = ["Anamnese erheben", "Befunde anfordern", "Diagnose stellen"];
  return (
    <div className="card mt-3 p-5">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
        So funktioniert’s
      </p>
      <div className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
              style={{ backgroundColor: "#E6F1FB", color: "#0C447C" }}
            >
              {i + 1}
            </div>
            <span className="text-sm font-semibold">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartScreen({
  onStart,
}: {
  onStart: (d: Difficulty, disc: Discipline) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="pb-4">
      <div
        className="mb-3 flex items-center justify-between rounded-xl border-[1.5px] bg-card px-4 py-2.5"
        style={{ borderColor: "#d8d6cd" }}
      >
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-1.5 rounded-lg border-[1.5px] bg-card px-3.5 py-[7px] text-sm font-semibold"
            style={{ borderColor: "#d8d6cd" }}
          >
            <i className="ti ti-home text-sm" />
            Home
          </button>
        </div>
        <span className="flex items-center gap-1 text-sm text-muted">
          <span className="font-extrabold text-foreground">140+</span>
          &nbsp;Fälle
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_320px] md:items-start">
        <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-[#eaf0fc] px-4 py-1.5 text-sm font-bold text-accent">
          Für Medizinstudierende · Deutschland
        </span>
        <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
          Patientenfälle lösen. Nicht nur auswendig lernen.
        </h1>
        <p className="mt-2 max-w-md text-lg leading-relaxed text-muted">
          Echte klinische Situationen — Anamnese, Untersuchung, Labor. Du
          entscheidest was du brauchst. Weniger Untersuchungen, mehr Punkte.
        </p>
        <button
          onClick={() => setShowPicker(true)}
          className="group relative mt-3 overflow-hidden rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground"
        >
          Ersten Fall lösen{" "}
          <span className="inline-block transition-transform duration-200 ease-out group-hover:translate-x-2 group-active:translate-x-2">
            →
          </span>
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-accent to-transparent"
            aria-hidden="true"
          />
        </button>
        <p className="mt-2 text-sm text-muted">
          Kostenlos · Kein Account nötig · 5 Fälle täglich
        </p>
      </div>
      <div className="flex flex-col">
        <RotatingPatientPreview />
        <HowItWorksCard />
      </div>
      {showPicker && (
        <DifficultyModal
          onSelect={onStart}
          onClose={() => setShowPicker(false)}
        />
      )}
      </div>
      <StatsRow />
      <WelcomeNote />
      <footer
        className="mt-3 flex items-center justify-between border-t border-card-border/15 pt-3"
        style={{ fontSize: 11, color: "#5f5e5a" }}
      >
        <span>© 2026 Medcase</span>
        <div className="flex items-center gap-4">
          <span>Impressum</span>
          <span>Kontakt</span>
        </div>
      </footer>
    </div>
  );
}

const LOADING_STAGES = [
  { icon: "ti-door-enter", text: "Patient betritt die Klinik …" },
  { icon: "ti-file-check", text: "Fall wird vorbereitet …" },
];

function LoadingScreen() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 900);
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
  locked,
  onClick,
}: {
  label: string;
  done: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done || locked}
      className={`flex items-center rounded-xl border-[1.5px] px-4 py-2.5 font-medium transition-colors ${
        done
          ? "border-card-border/20 bg-foreground/5 text-muted"
          : locked
          ? "cursor-not-allowed border-card-border/15 bg-foreground/[0.02] text-muted/50"
          : "border-card-border/20 bg-card hover:border-accent"
      }`}
    >
      {done ? "✕ " : "○ "}
      {label}
      {done && (
        <span className="ml-2 text-xs font-bold text-[#dc2626]">−10P</span>
      )}
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

function ImagingCard({ imaging }: { imaging: string }) {
  if (!imaging) return null;
  return (
    <div className="card p-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        Bildgebung
      </p>
      <p className="leading-relaxed">{imaging}</p>
    </div>
  );
}

function LabCard({ labs }: { labs: LabCategory[] }) {
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
              {cat.values.map((v) => {
                const flagged = v.flag === "high" || v.flag === "low";
                return (
                  <tr
                    key={v.name}
                    className={`border-b border-card-border/10 last:border-0 ${
                      flagged ? "bg-[#dc2626]/[0.04]" : ""
                    }`}
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
                      {v.flag === "high" && (
                        <span className="ml-1 font-extrabold">↑</span>
                      )}
                      {v.flag === "low" && (
                        <span className="ml-1 font-extrabold">↓</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 text-muted">{v.unit}</td>
                    <td
                      className={`py-1.5 ${
                        flagged ? "font-medium text-foreground/70" : "text-muted"
                      }`}
                    >
                      {v.reference}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function DiagnosisIsland({
  phase,
  caseData,
  options,
  selectedDiagnosis,
  onSubmit,
  possiblePoints,
  lastResultCorrect,
  lastScoreEarned,
  onNext,
}: {
  phase: Phase;
  caseData: Case;
  options: string[];
  selectedDiagnosis: string | null;
  onSubmit: (option: string) => void;
  possiblePoints: number;
  lastResultCorrect: boolean;
  lastScoreEarned: number;
  onNext: () => void;
}) {
  const [resultExpanded, setResultExpanded] = useState(true);

  if (phase === "result") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4">
        <div
          className={`pointer-events-auto w-full max-w-[700px] rounded-2xl border-2 p-5 shadow-[0_16px_40px_-8px_rgba(15,15,15,0.18)] md:mr-[314px] ${
            lastResultCorrect
              ? "border-[#bbdab2] bg-[#eef7ed]"
              : "border-[#e7c2bd] bg-[#fbeeed]"
          }`}
        >
          <div className={`flex items-center gap-3 ${resultExpanded ? "mb-1" : ""}`}>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
                lastResultCorrect ? "bg-[#15803d]" : "bg-[#c0362c]"
              }`}
            >
              <i
                className={`ti ${
                  lastResultCorrect ? "ti-check" : "ti-x"
                } text-base`}
              />
            </div>
            <p
              className={`text-lg font-extrabold ${
                lastResultCorrect ? "text-[#15803d]" : "text-[#c0362c]"
              }`}
            >
              {lastResultCorrect ? "Richtig erkannt" : "Leider falsch"}
            </p>
            {!resultExpanded && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  lastResultCorrect
                    ? "bg-[#15803d]/10 text-[#15803d]"
                    : "bg-[#c0362c]/10 text-[#c0362c]"
                }`}
              >
                {lastResultCorrect ? `+${lastScoreEarned} Punkte` : "0 Punkte"}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!resultExpanded && (
                <button
                  onClick={onNext}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Nächster Patient →
                </button>
              )}
              <button
                onClick={() => setResultExpanded(!resultExpanded)}
                className="flex items-center gap-1 rounded-full border-[1.5px] border-current px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: "#5f5e5a" }}
                aria-label={resultExpanded ? "Minimieren" : "Erweitern"}
              >
                <span>Details</span>
                <i className={`text-[11px] ${resultExpanded ? "ti ti-chevron-down" : "ti ti-chevron-up"}`} />
              </button>
            </div>
          </div>
          {resultExpanded && (
            <>
          <p className="mb-4 mt-1 text-sm font-medium text-foreground/70">
            {lastResultCorrect ? (
              <>
                Du hast{" "}
                <span className="font-mono font-bold text-foreground">
                  +{lastScoreEarned}
                </span>{" "}
                Punkte erzielt.
              </>
            ) : (
              <>
                Du hast{" "}
                <span className="font-bold text-foreground">
                  {selectedDiagnosis}
                </span>{" "}
                gewählt — richtig war{" "}
                <span className="font-bold text-foreground">
                  {caseData.correctDiagnosis}
                </span>
                .
              </>
            )}
          </p>

          <div className="mb-4 grid grid-cols-2 gap-2">
            {caseData.diagnosisOptions.map((opt) => {
              const isCorrectAnswer = opt === caseData.correctDiagnosis;
              const isWrongPick =
                opt === selectedDiagnosis &&
                opt !== caseData.correctDiagnosis;
              return (
                <div
                  key={opt}
                  className={`flex items-center justify-between gap-2 rounded-lg border-[1.5px] px-3 py-2.5 text-[13.5px] font-semibold ${
                    isCorrectAnswer
                      ? "border-[#15803d]/40 bg-[#f1f9ef] text-[#14532d]"
                      : isWrongPick
                      ? "border-[#c0362c]/40 bg-[#fdf1f0] text-[#7f1d1d]"
                      : "border-card-border/15 bg-card text-foreground/80"
                  }`}
                >
                  {opt}
                  {isCorrectAnswer && (
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#15803d] text-white">
                      <i className="ti ti-check text-[10px]" />
                    </span>
                  )}
                  {isWrongPick && (
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#c0362c] text-white">
                      <i className="ti ti-x text-[10px]" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mb-4 rounded-xl bg-white/60 p-4">
            {caseData.keyTakeaway && (
              <>
                <p className="mb-2 text-sm font-bold leading-relaxed text-foreground">
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                    {lastResultCorrect
                      ? "Warum es richtig ist"
                      : "Worauf es ankam"}
                  </span>
                  {caseData.keyTakeaway}
                </p>
                <div className="my-3 h-px bg-foreground/[0.08]" />
              </>
            )}
            <p className="text-[13.5px] leading-relaxed text-foreground/75">
              <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                Vollständige Begründung
              </span>
              {caseData.explanation}
            </p>
          </div>

          <button
            onClick={onNext}
            className="w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Nächster Patient →
          </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[700px] rounded-2xl border-[1.5px] border-card-border/15 bg-card p-5 shadow-[0_16px_40px_-8px_rgba(15,15,15,0.18)] md:mr-[314px]">
        <div className="mb-3 flex items-center justify-between px-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
            <i className="ti ti-help-circle text-accent" />
            Diagnose stellen
          </span>
          <span className="text-xs font-medium text-muted">
            Noch{" "}
            <span className="font-mono font-bold text-accent">
              {possiblePoints}
            </span>{" "}
            Punkte möglich
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSubmit(opt)}
              disabled={!!selectedDiagnosis}
              className="rounded-xl border-[1.5px] border-card-border/20 bg-foreground/[0.015] px-4 py-3.5 text-center text-sm font-semibold leading-snug transition-colors hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type ReportState = "idle" | "open" | "loading" | "success" | "error";

function ReportCaseCard({
  caseId,
  difficulty,
}: {
  caseId: string;
  difficulty: Difficulty;
}) {
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [reason, setReason] = useState("");
  const [tooltipVisible, setTooltipVisible] = useState(false);

  async function handleSubmit() {
    setReportState("loading");
    try {
      const res = await fetch("/api/report-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, difficulty, reason }),
      });
      if (!res.ok) throw new Error();
      setReportState("success");
      setTimeout(() => {
        setReportState("idle");
        setReason("");
      }, 3000);
    } catch {
      setReportState("error");
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setTooltipVisible((v) => !v)}
            onBlur={() => setTooltipVisible(false)}
            className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-card-border/25 text-muted transition-colors hover:border-accent hover:text-accent"
            aria-label="Was bedeutet Fall melden?"
          >
            <i className="ti ti-help text-[11px]" />
          </button>
          {tooltipVisible && (
            <div className="absolute bottom-7 left-0 z-10 w-56 rounded-xl border-[1.5px] border-card-border/20 bg-card p-3 text-xs leading-relaxed text-foreground/80 shadow-sm">
              {/* TODO: Tooltip-Text kann später überarbeitet werden */}
              Fall wirkt medizinisch unplausibel oder du hast eine Frage dazu?
              Melde ihn kurz, wir prüfen ihn dann.
            </div>
          )}
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            Fall melden
          </span>
        </div>
        {reportState === "idle" && (
          <button
            onClick={() => setReportState("open")}
            className="rounded-lg border-[1.5px] border-card-border/20 bg-card px-2.5 py-1 text-xs font-semibold transition-colors hover:border-accent"
          >
            Melden
          </button>
        )}
        {reportState === "open" && (
          <button
            onClick={() => {
              setReportState("idle");
              setReason("");
            }}
            className="text-muted transition-opacity hover:opacity-60"
            aria-label="Schließen"
          >
            <i className="ti ti-x text-sm" />
          </button>
        )}
      </div>

      {reportState === "open" && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional: Was stimmt nicht? (kann auch leer bleiben)"
            rows={5}
            className="w-full resize-none rounded-lg border-[1.5px] border-card-border/20 bg-background px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleSubmit}
            className="w-full rounded-lg border-[1.5px] border-card-border/20 bg-card py-1.5 text-xs font-semibold transition-colors hover:border-accent"
          >
            Absenden
          </button>
        </div>
      )}

      {reportState === "loading" && (
        <p className="mt-2 text-xs text-muted">Wird gesendet …</p>
      )}

      {reportState === "success" && (
        <p className="mt-2 text-xs font-semibold text-[#15803d]">
          Vielen Dank für deine Meldung – wir schauen uns den Fall an.
        </p>
      )}

      {reportState === "error" && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-[#dc2626]">
            Etwas ist schiefgelaufen. Bitte nochmal versuchen.
          </p>
          <button
            onClick={() => setReportState("open")}
            className="ml-2 text-xs font-semibold text-accent underline"
          >
            Zurück
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPanel({
  dailyUsed,
  dailyLimit,
  possiblePoints,
  revealed,
  caseId,
  difficulty,
}: {
  dailyUsed: number;
  dailyLimit: number;
  possiblePoints: number;
  revealed: Revealed;
  caseId: string;
  difficulty: Difficulty;
}) {
  const checklist: { key: keyof Revealed; label: string }[] = [
    { key: "history", label: "Anamnese" },
    { key: "examination", label: "Untersuchung" },
    { key: "imaging", label: "Bildgebung" },
    { key: "labs", label: "Labor" },
  ];

  return (
    <>
      <div className="card p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Fortschritt heute
        </p>
        <p className="mt-3 text-2xl font-extrabold">
          {dailyUsed}
          <span className="text-base font-semibold text-muted">
            {" "}
            / {dailyLimit} Fällen
          </span>
        </p>
        <div className="mt-2.5 h-1.5 rounded-full bg-foreground/10">
          <div
            className="h-1.5 rounded-full bg-accent transition-all"
            style={{
              width: `${Math.min((dailyUsed / dailyLimit) * 100, 100)}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Free Tier · läuft täglich neu an
        </p>
      </div>

      <div className="card p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Mögliche Punkte
        </p>
        <p className="clinical-data mt-2 text-4xl font-extrabold text-accent">
          {possiblePoints}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted">
          von {BASE_SCORE} möglich
        </p>
      </div>

      <div className="card p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
          Befundstatus
        </p>
        <div className="flex flex-col gap-2.5">
          {checklist.map((item) => {
            const done = revealed[item.key];
            return (
              <div
                key={item.key}
                className={`flex items-center gap-2.5 text-sm font-semibold ${
                  done ? "text-foreground" : "text-muted"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    done
                      ? "border-foreground bg-foreground text-white"
                      : "border-card-border/25"
                  }`}
                >
                  {done && <i className="ti ti-x text-[10px]" />}
                </span>
                {item.label}
                {done && (
                  <span className="clinical-data ml-auto text-xs font-bold text-[#dc2626]">
                    −10
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ReportCaseCard caseId={caseId} difficulty={difficulty} />
    </>
  );
}

function GameScreen({
  caseData,
  difficulty,
  discipline,
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
  discipline: Discipline;
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
  const disciplineLabel =
    DISCIPLINES.find((d) => d.id === discipline)?.label ?? "Zufällig";
  const color = avatarColorForCase(caseData.id);
  const revealCount = Object.values(revealed).filter(Boolean).length;
  const possiblePoints = Math.max(
    BASE_SCORE - revealCount * INVESTIGATION_COST,
    MIN_SCORE
  );
  const isResult = phase === "result";

  return (
    <div>
      <header className="sticky top-0 z-30 mb-6 -mt-5 bg-background/95 pb-2 pt-4 backdrop-blur">
        <div
          className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card px-[18px] py-3"
          style={{ borderColor: "#d8d6cd" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onGoHome}
              className="flex min-w-0 items-center overflow-hidden transition-opacity hover:opacity-80"
            >
              <Logo size={30} />
            </button>
            <div className="h-5 w-px shrink-0 bg-foreground/10" />
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button
                onClick={onGoHome}
                className="flex shrink-0 items-center gap-1 font-semibold text-muted transition-opacity hover:opacity-80"
              >
                <i className="ti ti-arrow-left" /> Start
              </button>
              <span className="shrink-0 text-muted/40">→</span>
              <span className="shrink-0 font-semibold">{difficultyLabel}</span>
              <span className="shrink-0 text-muted/40">→</span>
              <span className="truncate font-semibold text-accent">
                {disciplineLabel}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatPill label="PUNKTE" value={score} />
            <StatPill label="GELÖST" value={`${solved}/${played}`} />
          </div>
        </div>
      </header>

      <div
        className={`grid gap-6 md:grid-cols-[1fr_280px] ${
          isResult ? "pb-[100px]" : "pb-[340px]"
        }`}
      >
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
                „{caseData.chiefComplaint}{'"'}
              </blockquote>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              <i className="ti ti-clipboard-check text-accent" />
              Befunde anfordern
            </p>
            <div className="flex flex-wrap gap-3">
              <RevealButton
                label="Anamnese"
                done={revealed.history}
                locked={isResult}
                onClick={() =>
                  setRevealed((r) => ({ ...r, history: true }))
                }
              />
              <RevealButton
                label="Untersuchung"
                done={revealed.examination}
                locked={isResult}
                onClick={() =>
                  setRevealed((r) => ({ ...r, examination: true }))
                }
              />
              <RevealButton
                label="Bildgebung"
                done={revealed.imaging}
                locked={isResult}
                onClick={() =>
                  setRevealed((r) => ({ ...r, imaging: true }))
                }
              />
              <RevealButton
                label="Labor"
                done={revealed.labs}
                locked={isResult}
                onClick={() => setRevealed((r) => ({ ...r, labs: true }))}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {isResult ? (
                "Fall abgeschlossen — du kannst die Befunde weiterhin nachlesen."
              ) : (
                <>
                  Jeder Befund kostet{" "}
                  <span className="font-semibold text-accent">
                    −10 Punkte
                  </span>
                  . Weniger Befunde, mehr Punkte.
                </>
              )}
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
          {revealed.imaging && <ImagingCard imaging={caseData.imaging} />}
          {revealed.labs && <LabCard labs={caseData.labs} />}
        </div>

        <aside className="hidden flex-col gap-4 md:sticky md:top-24 md:flex md:self-start">
          <StatusPanel
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
            possiblePoints={possiblePoints}
            revealed={revealed}
            caseId={caseData.id}
            difficulty={difficulty}
          />
        </aside>

        <div className="flex flex-col gap-4 md:hidden">
          <StatusPanel
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
            possiblePoints={possiblePoints}
            revealed={revealed}
            caseId={caseData.id}
            difficulty={difficulty}
          />
        </div>
      </div>

      <DiagnosisIsland
        phase={phase}
        caseData={caseData}
        options={caseData.diagnosisOptions}
        selectedDiagnosis={selectedDiagnosis}
        onSubmit={onSubmitDiagnosis}
        possiblePoints={possiblePoints}
        lastResultCorrect={lastResultCorrect}
        lastScoreEarned={lastScoreEarned}
        onNext={onNext}
      />
    </div>
  );
}
