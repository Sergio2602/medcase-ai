"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Logo } from "./components/Logo";
import { OnboardingTour } from "./components/OnboardingTour";
import { KontaktPopover } from "./components/KontaktPopover";
import { AppHeader } from "./components/AppHeader";
import { generateShareCard } from "@/lib/generateShareCard";
import { recordCaseResult, readCaseResults } from "@/lib/stats";

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
  // Optional — only present on newly-curated, source-checked cases. Absent on
  // the older bank, which must keep rendering exactly as before (no UI change
  // when this is undefined).
  differentialNotes?: DifferentialNote[];
  // Optional — 1-sentence, sourced context on why this diagnosis is in the
  // bank (common in real hospitals, or rare-but-cannot-miss). Display only,
  // no scoring effect. Only rendered post-reveal (never during play, to avoid
  // leaking the answer category before the user commits).
  caseContext?: CaseContext;
};

type CaseContext = {
  category: "haeufig" | "cannot-miss";
  note: string;
};

type DifferentialNote = {
  // Must match one of diagnosisOptions verbatim (not the correct diagnosis).
  option: string;
  // 1-2 Sätze: warum diese Diagnose NICHT zutrifft, idealerweise mit dem
  // konkreten unterscheidenden Befund gegenüber der korrekten Diagnose.
  whyNot: string;
};

type Revealed = {
  history: boolean;
  examination: boolean;
  imaging: boolean;
  labs: boolean;
};

const BASE_SCORE = 100;
const INVESTIGATION_COST = 10;
const MIN_SCORE = BASE_SCORE - 4 * INVESTIGATION_COST;

function hasImaging(c: Case): boolean {
  return typeof c.imaging === "string" && c.imaging.trim().length > 0;
}

const AVATAR_COLORS = [
  "#EF9A9A",
  "#90CAF9",
  "#A5D6A7",
  "#FFD54F",
  "#CE93D8",
  "#FFAB73",
];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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
  const [revealedAtSubmit, setRevealedAtSubmit] = useState<Revealed>({
    history: false,
    examination: false,
    imaging: false,
    labs: false,
  });
  const [dailyUsed, setDailyUsed] = useState(0);
  const dailyLimit = 5;
  const caseStartedAtRef = useRef<number | null>(null);

  // Score/Solved/Played sind React-State (verschwinden bei Reload) — beim
  // Mount aus dem persistierten Statistik-Log (localStorage, siehe
  // lib/stats.ts) vorbefüllen, damit der Punktestand über Reloads hinweg
  // bestehen bleibt, statt wieder bei 0 zu starten. Rein additiv: neue
  // Fälle zählen weiterhin per setScore/setSolved/setPlayed in submitDiagnosis.
  useEffect(() => {
    const results = readCaseResults();
    if (results.length === 0) return;
    setScore(results.reduce((sum, r) => sum + r.score, 0));
    setSolved(results.filter((r) => r.correct).length);
    setPlayed(results.length);
  }, []);

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
    setRevealedAtSubmit({
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
      const loadedCase = data as Case;
      setActiveCase({
        ...loadedCase,
        diagnosisOptions: shuffle(loadedCase.diagnosisOptions),
      });
      setDailyUsed((d) => d + 1);
      caseStartedAtRef.current = Date.now();
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
    setRevealedAtSubmit(revealed);
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
    const startedAt = caseStartedAtRef.current;
    recordCaseResult({
      caseId: activeCase.id,
      discipline,
      difficulty: activeCase.difficulty,
      correct,
      score: earned,
      durationSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      timestamp: Date.now(),
    });
    setPhase("result");
  }

  function nextCase() {
    startCase(difficulty);
  }

  function goHome() {
    setPhase("start");
  }

  return (
    <div className={`min-h-screen px-4 pt-5 md:px-10 ${phase === "playing" || phase === "result" ? "" : "pb-8"}`}>
      <div className="mx-auto max-w-[1320px]">
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
            revealedAtSubmit={revealedAtSubmit}
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
    caseId: "FALL-0127",
    initials: "KM",
    color: "#90caf9",
    name: "Klaus M.",
    meta: "58 J. · männlich",
    quote: "Starke Brustschmerzen seit heute Morgen …",
    revealed: ["Anamnese", "Untersuchung"],
  },
  {
    caseId: "FALL-0084",
    initials: "SF",
    color: "#a5d6a7",
    name: "Sabine F.",
    meta: "34 J. · weiblich",
    quote: "Seit drei Tagen Fieber und Husten, jetzt auch Atemnot …",
    revealed: ["Anamnese", "Labor"],
  },
  {
    caseId: "FALL-0211",
    initials: "TR",
    color: "#ffd54f",
    name: "Thomas R.",
    meta: "45 J. · männlich",
    quote: "Plötzlich einseitige Schwäche im Arm, Sprache verwaschen …",
    revealed: ["Anamnese"],
  },
];

const HOW_STEPS: { label: string; state: "done" | "current" | "next" }[] = [
  { label: "Anamnese erheben", state: "done" },
  { label: "Befunde anfordern", state: "current" },
  { label: "Diagnose stellen", state: "next" },
];

function RotatingPatientPreview() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % PATIENT_PREVIEWS.length);
        setVisible(true);
      }, 300);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const p = PATIENT_PREVIEWS[index];
  const possiblePoints = 100 - p.revealed.length * 10;

  return (
    <div className="card p-5">
      {/* Card header — always visible */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-[#16a34a]"
            style={{ animation: "pulse-soft 2s ease-in-out infinite" }}
          />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
            Laufender Fall
          </span>
        </div>
        <span className="font-mono text-[10.5px] text-muted/60">{p.caseId}</span>
      </div>

      {/* Patient block — fades on carousel transition */}
      <div className="transition-opacity duration-300" style={{ opacity: visible ? 1 : 0 }}>
        {/* Avatar + name */}
        <div className="mb-3 flex items-center gap-3">
          <div className="avatar-circle h-9 w-9 text-xs" style={{ backgroundColor: p.color }}>
            {p.initials}
          </div>
          <div>
            <p className="text-sm font-bold">{p.name}</p>
            <p className="text-xs text-muted">{p.meta}</p>
          </div>
        </div>

        {/* Quote */}
        <p className="mb-4 border-l-[1.5px] border-card-border/20 pl-3 text-sm italic text-foreground/80">
          „{p.quote}{'"'}
        </p>

        {/* Revealed findings */}
        <div className="mb-4 flex flex-col gap-2">
          {p.revealed.map((f) => (
            <div key={f} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-accent">
                <i className="ti ti-check text-[12px]" />
                {f}
              </span>
              <span className="font-mono text-[11px] font-bold text-[#dc2626]">−10</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mb-3 border-t border-card-border/10" />

        {/* Noch möglich */}
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
            Noch möglich
          </span>
          <span className="font-mono text-[26px] font-extrabold leading-none text-accent">
            {possiblePoints}
          </span>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mb-3 mt-1 flex items-center justify-center gap-1.5">
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

      {/* Progress steps */}
      <div className="border-t border-card-border/10 pt-3">
        <div className="flex flex-col gap-2">
          {HOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {step.state === "done" ? (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#1d4ed8", color: "#ffffff" }}
                >
                  <i className="ti ti-check text-[10px]" />
                </div>
              ) : step.state === "current" ? (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                  style={{ backgroundColor: "#E6F1FB", color: "#0C447C" }}
                >
                  {i + 1}
                </div>
              ) : (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                  style={{ backgroundColor: "rgba(15,15,15,0.07)", color: "#5f5e5a" }}
                >
                  {i + 1}
                </div>
              )}
              <span
                className={`text-xs ${
                  step.state === "current"
                    ? "font-bold text-foreground"
                    : step.state === "done"
                    ? "font-medium text-muted"
                    : "font-medium text-muted/60"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsRow() {
  const items = [
    { icon: "ti-files", value: "140+", label: "Klinische Fälle", muted: false },
    { icon: "ti-stairs-up", value: "3", label: "Schwierigkeitsstufen", muted: false },
    { icon: "ti-diamond", value: "—", label: "Pro-Preis folgt", muted: true },
  ];
  return (
    <div className="mt-5 flex items-center border-y border-card-border/15 py-4">
      {items.map((item, i) => (
        <div key={item.label} className="contents">
          {i > 0 && <div className="h-10 w-px shrink-0 bg-card-border/15" />}
          <div className={`flex flex-1 flex-col items-center gap-1 px-4 text-center ${item.muted ? "opacity-50" : ""}`}>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
              <i className={`ti ${item.icon} text-sm`} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{item.value}</p>
            <p className={`text-[12px] font-medium text-muted ${item.muted ? "italic" : ""}`}>{item.label}</p>
          </div>
        </div>
      ))}
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
        <p className="flex items-center gap-2 text-sm font-bold">
          Eine Nachricht von Sergio
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-accent/10 text-accent">
            Gründer
          </span>
        </p>
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


function StartScreen({
  onStart,
}: {
  onStart: (d: Difficulty, disc: Discipline) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="pb-4">
      <AppHeader
        onBackClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        secondaryLink={{ href: "/statistik", label: "Statistik", icon: "ti-chart-bar" }}
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm text-muted">
            <i className="ti ti-files text-sm text-accent" />
            <span className="font-extrabold text-foreground">140+</span>
            &nbsp;Fälle
          </span>
        }
      />
      <div className="grid gap-4 md:grid-cols-[1fr_320px] md:items-start">
        <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-[#eaf0fc] px-4 py-1.5 text-sm font-bold text-accent">
          Für Medizinstudierende · Deutschland
        </span>
        <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
          Patientenfälle lösen.
          <br />
          Nicht nur auswendig lernen.
        </h1>
        <p className="mt-2 max-w-md text-lg leading-relaxed text-muted">
          Echte klinische Situationen — Anamnese, Untersuchung, Labor. Du
          entscheidest was du brauchst. Weniger Untersuchungen, mehr Punkte.
        </p>
        <button
          onClick={() => setShowPicker(true)}
          className="group relative mt-3 overflow-hidden rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
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
      <div>
        <RotatingPatientPreview />
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
          <a href="/impressum" className="hover:underline">Impressum</a>
          <a href="/impressum#datenschutz" className="hover:underline">Datenschutz</a>
          <KontaktPopover />
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
  variant,
}: {
  label: string;
  value: string | number;
  variant?: "score";
}) {
  if (variant === "score") {
    return (
      <span className="flex items-baseline gap-[6px] whitespace-nowrap rounded-lg border-[1.5px] border-card-border/20 bg-card px-[16px] py-[7px]">
        <span className="text-[11px] font-bold text-muted">{label}</span>
        <span className="tabular-nums text-[19px] font-extrabold text-accent">{value}</span>
      </span>
    );
  }
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
  unavailable,
  tooltip,
  onClick,
  showCost = true,
}: {
  label: string;
  done: boolean;
  locked?: boolean;
  unavailable?: boolean;
  tooltip?: string;
  onClick: () => void;
  showCost?: boolean;
}) {
  const [tipVisible, setTipVisible] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => tooltip && setTipVisible(true)}
      onMouseLeave={() => setTipVisible(false)}
    >
      <button
        onClick={onClick}
        disabled={done || locked || unavailable}
        className={`inline-flex items-center gap-[6px] rounded-[18px] border-[1.5px] px-[14px] py-[7px] text-[13px] font-semibold transition-colors ${
          done
            ? "border-card-border/20 bg-[#f4f3ee] text-muted"
            : unavailable
            ? "cursor-not-allowed border-card-border/15 bg-foreground/[0.02] text-muted/40"
            : locked
            ? "cursor-not-allowed border-card-border/15 bg-foreground/[0.02] text-muted/50"
            : "border-card-border/20 bg-card hover:border-accent"
        }`}
      >
        {done && <span>×</span>}
        {label}
        {done && showCost && (
          <span className="text-[11px] font-bold text-[#dc2626]">−10P</span>
        )}
      </button>
      {tipVisible && tooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border-[1.5px] border-card-border/20 bg-card px-2.5 py-1.5 text-xs text-foreground/80 shadow-sm">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function CollapseToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5"
      aria-label={expanded ? "Einklappen" : "Ausklappen"}
    >
      <i className={`text-[15px] ${expanded ? "ti ti-chevron-up" : "ti ti-chevron-down"}`} />
    </button>
  );
}

function MaximizeButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        border: "1.5px solid color-mix(in srgb, var(--card-border) 15%, transparent)",
        borderRadius: 8,
        background: "var(--card)",
        cursor: "pointer",
      }}
    >
      <i className="ti ti-arrows-maximize" style={{ fontSize: 16 }} />
    </button>
  );
}

function FindingOverlay({
  open,
  onClose,
  title,
  children,
  maxWidth = 640,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      setVisible(false);
      const delay = reducedMotionRef.current ? 0 : 150;
      const id = setTimeout(() => setMounted(false), delay);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const reduced = reducedMotionRef.current;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,15,15,0.45)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} vollständig`}
        style={{
          background: "var(--card)",
          border: "1.5px solid color-mix(in srgb, var(--card-border) 15%, transparent)",
          borderRadius: 14,
          padding: 28,
          maxWidth,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          opacity: reduced ? 1 : visible ? 1 : 0,
          transform: reduced ? "none" : visible ? "scale(1)" : "scale(0.97)",
          transition: reduced
            ? "none"
            : visible
            ? "opacity 200ms ease-out, transform 200ms ease-out"
            : "opacity 150ms ease-in, transform 150ms ease-in",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--muted)",
            }}
          >
            {title}
          </p>
          <button
            onClick={onClose}
            aria-label="Overlay schließen"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              border: "1.5px solid color-mix(in srgb, var(--card-border) 15%, transparent)",
              borderRadius: 8,
              background: "var(--card)",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FindingCard({ title, icon, text, expanded, onToggle }: { title: string; icon: string; text: string; expanded: boolean; onToggle: () => void }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <i className={`ti ${icon} text-accent text-[13px]`} />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
              {title}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <MaximizeButton
              onClick={() => setOverlayOpen(true)}
              ariaLabel={`${title} vollständig anzeigen`}
            />
            <CollapseToggle expanded={expanded} onToggle={onToggle} />
          </div>
        </div>
        {expanded && (
          <>
            <div className="border-t border-card-border/10" />
            <p className="max-w-[68ch] px-5 py-4 leading-relaxed">{text}</p>
          </>
        )}
      </div>
      <FindingOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} title={title}>
        <p style={{ fontSize: 16, lineHeight: 1.7 }}>{text}</p>
      </FindingOverlay>
    </>
  );
}

function ImagingCard({ imaging, expanded, onToggle }: { imaging: string; expanded: boolean; onToggle: () => void }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  if (!imaging) return null;
  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ti ti-scan text-accent text-[13px]" />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
              Bildgebung
            </p>
          </div>
          <div className="flex items-center gap-1">
            <MaximizeButton
              onClick={() => setOverlayOpen(true)}
              ariaLabel="Bildgebung vollständig anzeigen"
            />
            <CollapseToggle expanded={expanded} onToggle={onToggle} />
          </div>
        </div>
        {expanded && (
          <>
            <div className="border-t border-card-border/10" />
            <p className="max-w-[68ch] px-5 py-4 leading-relaxed">{imaging}</p>
          </>
        )}
      </div>
      <FindingOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} title="Bildgebung">
        <p style={{ fontSize: 16, lineHeight: 1.7 }}>{imaging}</p>
      </FindingOverlay>
    </>
  );
}

function LaborOverlay({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: LabCategory[];
}) {
  return (
    <FindingOverlay open={open} onClose={onClose} title="Labor" maxWidth={660}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {categories.map((cat) => (
          <div key={cat.category}>
            <p className="mb-2 text-sm font-semibold">{cat.category}</p>
            <table className="clinical-data w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr
                  className="border-b border-card-border/15 text-left uppercase text-muted"
                  style={{ fontSize: 10 }}
                >
                  <th className="pb-1 pr-3">Parameter</th>
                  <th className="pb-1 pr-3">Wert</th>
                  <th className="pb-1 pr-3">Einheit</th>
                  <th className="pb-1">Referenz</th>
                </tr>
              </thead>
              <tbody>
                {(cat.values ?? []).map((v) => {
                  const flagged = v.flag === "high" || v.flag === "low";
                  return (
                    <tr
                      key={v.name}
                      className={`border-b border-card-border/10 last:border-0 ${flagged ? "bg-[#dc2626]/[0.04]" : ""}`}
                    >
                      <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 12 }}>{v.name}</td>
                      <td
                        className={`font-semibold ${
                          v.flag === "high"
                            ? "text-[#dc2626]"
                            : v.flag === "low"
                            ? "text-[#2563eb]"
                            : ""
                        }`}
                        style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 12 }}
                      >
                        {v.value}
                        {v.flag === "high" && <span className="ml-1 font-extrabold">↑</span>}
                        {v.flag === "low" && <span className="ml-1 font-extrabold">↓</span>}
                      </td>
                      <td className="text-muted" style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 12 }}>{v.unit}</td>
                      <td
                        className={flagged ? "font-medium text-foreground/70" : "text-muted"}
                        style={{ paddingTop: 5, paddingBottom: 5, fontSize: 11 }}
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
    </FindingOverlay>
  );
}

function LabCard({ labs, expanded, onToggle }: { labs: LabCategory[]; expanded: boolean; onToggle: () => void }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ti ti-microscope text-accent text-[13px]" />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
              Labor
            </p>
          </div>
          <div className="flex items-center gap-1">
            <MaximizeButton
              onClick={() => setOverlayOpen(true)}
              ariaLabel="Labor vollständig anzeigen"
            />
            <CollapseToggle expanded={expanded} onToggle={onToggle} />
          </div>
        </div>
        {expanded && (
          <>
            <div className="border-t border-card-border/10" />
            <div className="px-5 py-4">
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
                {(cat.values ?? []).map((v) => {
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
          </>
        )}
      </div>
      <LaborOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        categories={labs}
      />
    </>
  );
}

function useCountUp(target: number, active: boolean, duration = 1300) {
  const [value, setValue] = useState(0);
  const [settled, setSettled] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      setValue(0);
      setSettled(false);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setValue(target);
      setSettled(true);
      return;
    }

    let start: number | null = null;
    function step(ts: number) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 5);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(target);
        setSettled(true);
      }
    }
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, target, duration]);

  return { value, settled };
}

function ResultIsland({
  lastResultCorrect,
  lastScoreEarned,
  selectedDiagnosis,
  caseData,
  onNext,
  revealedCount,
  maxHeight,
  islandRef,
}: {
  lastResultCorrect: boolean;
  lastScoreEarned: number;
  selectedDiagnosis: string | null;
  caseData: Case;
  onNext: () => void;
  revealedCount: number;
  maxHeight?: string;
  islandRef?: RefObject<HTMLDivElement | null>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  // Only one differential note shown at a time, in a shared area below the
  // grid (same treatment as the correct diagnosis's "Vollständige
  // Begründung") — clicking a wrong option selects it, clicking again (or a
  // different option) switches/deselects, instead of each box expanding
  // inline to a different height.
  const [selectedNoteOption, setSelectedNoteOption] = useState<string | null>(null);

  function toggleNote(option: string) {
    setSelectedNoteOption((prev) => (prev === option ? null : option));
  }

  const isCorrect = lastResultCorrect;
  const { value: animatedScore, settled } = useCountUp(lastScoreEarned, isCorrect);
  const accentColor = isCorrect ? "#15803d" : "#c0362c";
  const bgColor = isCorrect ? "#eef7ed" : "#fbeeed";
  const borderColor = isCorrect ? "rgba(21,128,61,0.4)" : "rgba(192,54,44,0.4)";

  async function handleShare() {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const blob = await generateShareCard({
        score: lastScoreEarned,
        maxScore: 100,
        patientName: caseData.patientName,
        patientAge: caseData.age,
        diagnosis: caseData.correctDiagnosis,
        revealedCount,
        totalCategories: 4,
        isCorrect: lastResultCorrect,
      });
      const file = new File([blob], "medcase-ergebnis.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mein Medcase-Ergebnis" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "medcase-ergebnis.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // silent
    } finally {
      setIsSharing(false);
    }
  }

  function handleToggleDetails() {
    setExpanded((v) => !v);
  }

  return (
    <div
      ref={islandRef}
      className="absolute bottom-0 left-0 right-0 rounded-xl border-[1.5px] flex flex-col"
      style={{ borderColor, backgroundColor: bgColor }}
    >
      {/* Always-visible header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 px-4 py-3 sm:gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accentColor }}
          >
            <i className={`ti ${isCorrect ? "ti-check" : "ti-x"} text-sm`} />
          </div>
          <p className="shrink-0 text-sm font-extrabold" style={{ color: accentColor }}>
            {isCorrect ? "Richtig erkannt" : "Leider falsch"}
          </p>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold${settled ? " score-settle" : ""}`}
            style={{
              backgroundColor: isCorrect ? "rgba(21,128,61,0.12)" : "rgba(192,54,44,0.12)",
              color: accentColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {isCorrect ? `+${animatedScore}` : "0"} Punkte
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!expanded && (
              <button
                onClick={onNext}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Nächster Patient →
              </button>
            )}
            <button
              onClick={handleToggleDetails}
              className="flex items-center gap-1 rounded-full border-[1.5px] border-current px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-70"
              style={{ color: "#5f5e5a" }}
              aria-expanded={expanded}
            >
              <span>Details</span>
              <i className={`text-[11px] ${expanded ? "ti ti-chevron-up" : "ti ti-chevron-down"}`} />
            </button>
          </div>
        </div>

        {(caseData.keyTakeaway || caseData.caseContext) && (
          <div className="px-4 pb-3">
            <div className="mb-3 h-px bg-foreground/10" />
            {caseData.keyTakeaway && (
              <>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                  {isCorrect ? "Warum es richtig ist" : "Worauf es ankam"}
                </p>
                <p className="mt-1 text-xs font-bold leading-relaxed text-foreground sm:text-sm">
                  {caseData.keyTakeaway}
                </p>
              </>
            )}
            {caseData.caseContext &&
              (caseData.caseContext.category === "cannot-miss" ? (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#d97706]/40 bg-[#fef3e2] px-2.5 py-1 text-[11px] font-semibold text-[#92400e]">
                  <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-[#d97706] text-white">
                    <i className="ti ti-alert-triangle text-[10px]" />
                  </span>
                  {caseData.caseContext.note}
                </span>
              ) : (
                <div className="mt-2 flex items-start gap-2 rounded-lg border-2 border-[#fb923c]/50 bg-[#fb923c]/[0.07] px-3 py-2">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#fb923c]/15 text-[#fb923c]">
                    <i className="ti ti-info-circle text-[11px]" />
                  </span>
                  <p className="text-[11.5px] font-semibold leading-snug text-foreground/85">
                    {caseData.caseContext.note}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Expanded details — fills remaining space below the header, scrolls if content overflows */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="mb-3 h-px bg-foreground/10" />

          {/* Result line */}
          <p className="mb-4 text-sm font-medium text-foreground/70">
            {isCorrect ? (
              <>
                Du hast{" "}
                <span className="font-mono font-bold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>+{animatedScore}</span>{" "}
                Punkte erzielt.
              </>
            ) : (
              <>
                Du hast{" "}
                <span className="font-bold text-foreground">{selectedDiagnosis}</span>{" "}
                gewählt — richtig war{" "}
                <span className="font-bold text-foreground">{caseData.correctDiagnosis}</span>.
              </>
            )}
          </p>

          {/* Diagnosis options color-coded, uniform height. Wrong options with a
              differential note are clickable — selecting one shows its
              explanation in the shared box below, same treatment as the
              correct diagnosis's "Vollständige Begründung". */}
          <div className="mb-2 grid grid-cols-2 gap-2">
            {caseData.diagnosisOptions.map((opt) => {
              const isCorrectAnswer = opt === caseData.correctDiagnosis;
              const isWrongPick = opt === selectedDiagnosis && opt !== caseData.correctDiagnosis;
              const note = !isCorrectAnswer
                ? caseData.differentialNotes?.find((n) => n.option === opt)
                : undefined;
              const isSelected = selectedNoteOption === opt;
              // Correct answer is always clickable too — resets the shared
              // explanation box back to "Vollständige Begründung", so all
              // four options behave consistently (click any tile to see its
              // reasoning) instead of only the wrong ones responding.
              const isClickable = Boolean(note) || isCorrectAnswer;
              const Wrapper = isClickable ? "button" : "div";
              return (
                <Wrapper
                  key={opt}
                  {...(isClickable
                    ? {
                        onClick: () =>
                          isCorrectAnswer ? setSelectedNoteOption(null) : toggleNote(opt),
                        type: "button" as const,
                        "aria-pressed": isCorrectAnswer ? selectedNoteOption === null : isSelected,
                      }
                    : {})}
                  className={`flex items-center justify-between gap-2 rounded-lg border-[1.5px] px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors ${
                    isClickable ? "cursor-pointer" : ""
                  } ${
                    isCorrectAnswer
                      ? "border-[#15803d]/40 bg-[#f1f9ef] text-[#14532d]"
                      : isWrongPick || isSelected
                      ? "border-[#c0362c]/40 bg-[#fdf1f0] text-[#7f1d1d]"
                      : "border-card-border/15 bg-card text-foreground/80"
                  }`}
                >
                  <span>{opt}</span>
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
                  {note && !isCorrectAnswer && !isWrongPick && (
                    <i
                      className={`ti ti-chevron-down shrink-0 text-[11px] opacity-50 transition-transform ${
                        isSelected ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </Wrapper>
              );
            })}
          </div>

          {/* Single explanation box — content swaps between "Vollständige
              Begründung" (default) and the selected differential's "Warum
              nicht X" note, instead of stacking a second box on top. Keeps
              the island's height constant regardless of interaction. */}
          {(() => {
            const selectedNote = caseData.differentialNotes?.find(
              (n) => n.option === selectedNoteOption
            );
            const label = selectedNote
              ? `Warum nicht ${selectedNote.option}?`
              : "Vollständige Begründung";
            const text = selectedNote ? selectedNote.whyNot : caseData.explanation;
            return (
              <div
                className={`mb-4 rounded-xl p-3 sm:p-4 ${
                  selectedNote ? "bg-[#fdf1f0]" : "bg-white/60"
                }`}
              >
                <p
                  className={`text-xs leading-relaxed sm:text-[13.5px] ${
                    selectedNote ? "text-[#7f1d1d]" : "text-foreground/75"
                  }`}
                >
                  <span
                    className={`mb-1 block text-[10px] font-extrabold uppercase tracking-wide ${
                      selectedNote ? "text-[#c0362c]" : "text-foreground/60"
                    }`}
                  >
                    {label}
                  </span>
                  {text}
                </p>
              </div>
            );
          })()}

          {/* Primary CTA */}
          <button
            onClick={onNext}
            className="w-full rounded-xl bg-accent py-3 font-bold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Nächster Patient →
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-card-border/20 bg-white/40 py-3 text-sm font-semibold transition-colors hover:border-accent disabled:opacity-60"
          >
            <i className="ti ti-share-2" />
            {isSharing ? "Wird erstellt …" : "↑ Ergebnis teilen"}
          </button>
        </div>
      )}
    </div>
  );
}

function DiagnosisIsland({
  caseData,
  options,
  selectedDiagnosis,
  onSubmit,
  possiblePoints,
  diagnosisIslandRef,
}: {
  caseData: Case;
  options: string[];
  selectedDiagnosis: string | null;
  onSubmit: (option: string) => void;
  possiblePoints: number;
  diagnosisIslandRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={diagnosisIslandRef} className="w-full rounded-2xl border-[1.5px] border-card-border/15 bg-card px-4 py-[14px] shadow-[0_16px_40px_-8px_rgba(15,15,15,0.18)]">
      <div className="mb-3 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
          <i className="ti ti-stethoscope text-accent text-[11px]" />
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
            className="rounded-xl border-[1.5px] border-card-border/20 bg-foreground/[0.015] px-3 py-[9px] text-center text-sm font-semibold leading-snug transition-colors hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

type ReportState = "idle" | "open" | "loading" | "success" | "error";

function ReportCaseCard({
  caseId,
  difficulty,
  embedded,
  anchorRef,
}: {
  caseId: string;
  difficulty: Difficulty;
  embedded?: boolean;
  anchorRef?: RefObject<HTMLDivElement | null>;
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

  const inner = (
    <>
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
              Fall wirkt medizinisch unplausibel oder du hast eine Frage dazu?
              Melde ihn kurz, wir prüfen ihn dann.
            </div>
          )}
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
            <i className="ti ti-flag text-accent text-[11px]" />
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
      {/* Zero-height anchor measured by GameScreen — always at the static header bottom,
          never shifts when the report form expands below it. */}
      <div ref={anchorRef} aria-hidden="true" />

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
    </>
  );

  if (embedded) {
    return (
      <div className="mt-3 border-t border-card-border/15 pt-3">
        {inner}
      </div>
    );
  }

  return <div className="card p-4">{inner}</div>;
}

function MobileSidebar({
  open,
  onClose,
  onGoHome,
  difficultyLabel,
  disciplineLabel,
  caseId,
  difficulty,
  dailyUsed,
  dailyLimit,
}: {
  open: boolean;
  onClose: () => void;
  onGoHome: () => void;
  difficultyLabel: string;
  disciplineLabel: string;
  caseId: string;
  difficulty: Difficulty;
  dailyUsed: number;
  dailyLimit: number;
}) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !sidebarRef.current) return;
    const el = sidebarRef.current;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
    focusable[0]?.focus();
    function trapTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", trapTab);
    return () => document.removeEventListener("keydown", trapTab);
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 sm:hidden ${!open ? "pointer-events-none" : ""}`}>
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ backgroundColor: "rgba(15,15,15,0.5)" }}
        onClick={onClose}
      />
      <div
        ref={sidebarRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-xl outline-none transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ borderRight: "1.5px solid #d8d6cd" }}
      >
        <div className="flex items-center justify-between border-b border-card-border/15 px-5 py-4">
          <Logo size={28} />
          <button
            onClick={onClose}
            aria-label="Menü schließen"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5"
          >
            <i className="ti ti-x text-base" />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <button
            onClick={() => { onClose(); onGoHome(); }}
            className="flex items-center gap-2 rounded-xl border-[1.5px] border-card-border/20 bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent"
          >
            <i className="ti ti-home text-sm" />
            Home
          </button>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-foreground">{difficultyLabel}</span>
            <span className="text-muted/50">→</span>
            <span className="font-semibold text-accent">{disciplineLabel}</span>
          </div>
          <div className="rounded-xl border-[1.5px] border-card-border/20 bg-card p-4">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
            <i className="ti ti-calendar text-accent text-[11px]" />
            Fortschritt heute
          </p>
            <p className="mt-2 text-2xl font-extrabold">
              {dailyUsed}
              <span className="text-base font-semibold text-muted"> / {dailyLimit} Fällen</span>
            </p>
            <div className="mt-2.5 h-1.5 rounded-full bg-foreground/10">
              <div
                className="h-1.5 rounded-full bg-accent transition-all"
                style={{ width: `${Math.min((dailyUsed / dailyLimit) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">Free Tier · läuft täglich neu an</p>
          </div>
          <ReportCaseCard caseId={caseId} difficulty={difficulty} />
        </div>
      </div>
    </div>
  );
}

function StatusPanel({
  dailyUsed,
  dailyLimit,
  possiblePoints,
  revealed,
  revealedAtSubmit,
  phase,
  caseId,
  difficulty,
  anchorRef,
}: {
  dailyUsed: number;
  dailyLimit: number;
  possiblePoints: number;
  revealed: Revealed;
  revealedAtSubmit: Revealed;
  phase: Phase;
  caseId: string;
  difficulty: Difficulty;
  anchorRef?: RefObject<HTMLDivElement | null>;
}) {
  const checklist: { key: keyof Revealed; label: string }[] = [
    { key: "history", label: "Anamnese" },
    { key: "examination", label: "Untersuchung" },
    { key: "imaging", label: "Bildgebung" },
    { key: "labs", label: "Labor" },
  ];

  return (
    <>
      {/* Card: Fortschritt heute */}
      <div className="card p-[18px]">
        <p className="mb-[10px] flex items-center justify-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
          <i className="ti ti-calendar text-accent text-[11px]" />
          Fortschritt heute
        </p>
        <p className="text-center text-[30px] font-extrabold leading-none">
          {dailyUsed}
          <small className="text-[15px] font-semibold text-muted"> / {dailyLimit} Fällen</small>
        </p>
        <div
          className="mt-[10px] h-[6px] overflow-hidden rounded-[3px]"
          style={{ background: "#f1efe9" }}
        >
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.min((dailyUsed / dailyLimit) * 100, 100)}%` }}
          />
        </div>
        <p className="mt-[8px] text-center text-[11.5px] text-muted">
          Free Tier · läuft täglich neu an
        </p>
      </div>

      {/* Card: Punktestand · dieser Fall (merged) */}
      <div className="card p-[18px]">
        <p className="mb-3 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
          <i className="ti ti-chart-bar text-accent text-[11px]" />
          Punktestand · dieser Fall
        </p>

        {/* Basis row */}
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted">Basis</span>
          <span className="font-mono font-bold text-foreground">{BASE_SCORE}</span>
        </div>

        {/* Per-finding rows */}
        <div className="mt-2 flex flex-col gap-2">
          {checklist.map((item) => {
            const done = revealed[item.key];
            const costCharged = phase === "result" ? revealedAtSubmit[item.key] : done;
            return (
              <div key={item.key} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className="h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px]"
                  style={
                    done
                      ? { background: "#dc2626", borderColor: "#dc2626" }
                      : { borderColor: "color-mix(in srgb, var(--card-border) 25%, transparent)" }
                  }
                />
                <span className={`flex-1 ${done ? "text-foreground" : "text-muted"}`}>
                  {item.label}
                </span>
                <span className={`font-mono text-[11.5px] font-bold ${costCharged ? "text-[#dc2626]" : "text-muted/50"}`}>
                  {costCharged ? "−10" : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="my-3 border-t border-card-border/10" />

        {/* Möglich sum row */}
        <div className="flex items-baseline justify-between">
          <span className="text-[11.5px] font-semibold text-muted">Möglich</span>
          <span className="font-mono text-[26px] font-extrabold leading-none text-accent">
            {possiblePoints}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted">Minimum bei richtiger Diagnose: 70</p>
      </div>

      {/* Card: Fall melden */}
      <ReportCaseCard caseId={caseId} difficulty={difficulty} anchorRef={anchorRef} />
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
  revealedAtSubmit,
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
  revealedAtSubmit: Revealed;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [findingsHelpOpen, setFindingsHelpOpen] = useState(false);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const helpTooltipPos = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
  const [cardExpanded, setCardExpanded] = useState({ history: true, examination: true, imaging: true, labs: true });

  useEffect(() => {
    setCardExpanded({ history: true, examination: true, imaging: true, labs: true });
  }, [caseData.id]);

  const patientCardRef = useRef<HTMLDivElement>(null);
  const befundeRef = useRef<HTMLDivElement>(null);
  const diagnosisIslandRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [contentScrolled, setContentScrolled] = useState(false);

  const reportAnchorRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const [diagnosisTop, setDiagnosisTop] = useState<number | null>(null);
  const islandMinHeightRef = useRef<number>(0);

  useLayoutEffect(() => {
    let rafId: number;

    function computeOffsets() {
      const col = leftColumnRef.current;
      if (!col) return;
      const colRect = col.getBoundingClientRect();
      if (colRect.height === 0) {
        rafId = requestAnimationFrame(computeOffsets);
        return;
      }
      if (window.innerWidth < 768) {
        setDiagnosisTop(null);
        return;
      }

      const anchor = reportAnchorRef.current;
      if (!anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      // Guard: anchor not yet laid out (first frame after mount, sidebar still
      // display:none, etc.) — zero rect means layout isn't settled, retry next frame.
      if (anchorRect.width === 0 && anchorRect.height === 0) {
        rafId = requestAnimationFrame(computeOffsets);
        return;
      }

      const lineY = anchorRect.bottom - colRect.top;
      setDiagnosisTop(lineY);

      // Pad the scroll container so the last content line can be scrolled above the island.
      // Needed padding = distance from island-top to column-bottom (not just island height).
      if (contentScrollRef.current) {
        const needed = colRect.height - lineY + 16;
        contentScrollRef.current.style.paddingBottom = `${Math.max(needed, 16)}px`;
      }
    }

    // Wait one frame so layout (including sticky sidebar) is fully settled
    // before measuring. Dependency is caseData.id only (not phase) so the
    // 4-card-sidebar measurement stays valid through the playing→result transition.
    rafId = requestAnimationFrame(computeOffsets);
    window.addEventListener("resize", computeOffsets);
    window.visualViewport?.addEventListener("resize", computeOffsets);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", computeOffsets);
      window.visualViewport?.removeEventListener("resize", computeOffsets);
    };
  }, [caseData.id]);

  useEffect(() => {
    if (!findingsHelpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFindingsHelpOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [findingsHelpOpen]);

  useEffect(() => {
    // Re-runs on phase change too: DiagnosisIsland and ResultIsland are two
    // different DOM nodes sharing this ref (only one mounted at a time), so
    // switching phase swaps which node is observed. Without this, the
    // observer stayed attached to the (now-unmounted) DiagnosisIsland after
    // submitting, freezing the scroll padding at its height — if the result
    // island (with explanation, diagnosis grid, notes) rendered taller, its
    // bottom content got clipped and was unreachable by scrolling.
    const island = diagnosisIslandRef.current;
    const content = contentScrollRef.current;
    const col = leftColumnRef.current;
    if (!island || !content || !col) return;
    const ro = new ResizeObserver(() => {
      if (!island.isConnected) return;
      const colRect = col.getBoundingClientRect();
      const islandRect = island.getBoundingClientRect();
      islandMinHeightRef.current = Math.round(islandRect.height);
      const islandTopInCol = islandRect.top - colRect.top;
      const needed = colRect.height - islandTopInCol + 16;
      content.style.paddingBottom = `${Math.max(needed, 16)}px`;
    });
    ro.observe(island);
    return () => ro.disconnect();
  }, [caseData.id, phase]);

  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    function handleScroll() {
      setContentScrolled(el!.scrollTop > 2);
    }
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setContentScrolled(false);
    const el = contentScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [caseData.id]);


  return (
    <div>
      <MobileSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onGoHome={onGoHome}
        difficultyLabel={difficultyLabel}
        disciplineLabel={disciplineLabel}
        caseId={caseData.id}
        difficulty={difficulty}
        dailyUsed={dailyUsed}
        dailyLimit={dailyLimit}
      />

      {/* Mobile header */}
      <header className="sticky top-0 z-30 mb-6 -mt-5 pb-2 pt-4 sm:hidden">
        <div
          className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card px-4 py-3"
          style={{ borderColor: "#d8d6cd" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Menü öffnen"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/5"
            >
              <i className="ti ti-menu-2 text-lg" />
            </button>
            <button onClick={onGoHome} className="flex items-center transition-opacity hover:opacity-80">
              <Logo size={28} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <StatPill label="Pkt." value={score} />
            <StatPill label="Gel." value={`${solved}/${played}`} />
          </div>
        </div>
        <div
          className="mt-1.5 flex items-center justify-between rounded-xl border-[1.5px] border-card-border/20 bg-card px-3 py-1.5"
          style={{ visibility: isResult ? "hidden" : undefined }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Mögliche Punkte</span>
          <span className="clinical-data text-sm font-extrabold text-accent">{possiblePoints} / {BASE_SCORE}</span>
        </div>
      </header>

      {/* Desktop header */}
      <header className="sticky top-0 z-30 mb-6 -mt-5 hidden pb-2 pt-4 sm:block">
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
            <StatPill label="PUNKTE" value={score} variant="score" />
            <StatPill label="GELÖST" value={`${solved}/${played}`} />
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div ref={leftColumnRef} data-left-column="" className="relative flex h-[calc(100dvh-9rem)] flex-col sm:h-[calc(100dvh-7rem)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-0 z-[5] h-4"
            style={{
              background: "linear-gradient(to bottom, var(--background), transparent)",
              opacity: contentScrolled ? 1 : 0,
              transition: "opacity 200ms ease-out",
            }}
          />
          <div ref={contentScrollRef} data-content-scroll="" className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto">
          <div ref={patientCardRef} className="card flex gap-4 p-[18px]">
            <div
              className="avatar-circle h-14 w-14 shrink-0 text-lg"
              style={{ backgroundColor: color }}
            >
              {initials(caseData.patientName)}
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {caseData.patientName},{" "}
                {caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`}
              </h2>
              <p className="text-sm text-muted">
                {caseData.gender === "male" ? "Männlich" : "Weiblich"}
              </p>
              <blockquote className="mt-3 border-l-[1.5px] border-accent pl-3 italic">
                „{caseData.chiefComplaint}{'"'}
              </blockquote>
            </div>
          </div>

          <div ref={befundeRef}>
            {findingsHelpOpen && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFindingsHelpOpen(false)}
              />
            )}
            {findingsHelpOpen && (
              <div
                className="fixed z-50 w-[260px] rounded-[9px] border-[1.5px] border-foreground/20 bg-white p-3 shadow-lg text-foreground/80"
                style={{ top: helpTooltipPos.current.top, left: helpTooltipPos.current.left, fontSize: "12.5px", lineHeight: 1.5 }}
              >
                Hier kannst du zusätzliche Befunde anfordern, um die Diagnose zu stellen. Jeder Befund kostet Punkte — weniger Befunde bedeuten mehr Punkte.
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  ref={helpBtnRef}
                  onClick={() => {
                    if (!findingsHelpOpen && helpBtnRef.current) {
                      const r = helpBtnRef.current.getBoundingClientRect();
                      helpTooltipPos.current = { top: r.bottom + 6, left: r.left };
                    }
                    setFindingsHelpOpen((v) => !v);
                  }}
                  className="flex items-center justify-center text-accent"
                  aria-label="Hinweis zu Befunden anfordern"
                >
                  <i className="ti ti-help-circle" />
                </button>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.065em] text-muted">
                  Befunde anfordern
                </span>
              </div>
              <span className="text-xs text-muted">
                {isResult ? (
                  "Befunde jetzt kostenlos einsehbar."
                ) : (
                  <>
                    Jeder Befund kostet{" "}
                    <span className="font-semibold text-accent">−10 Punkte</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <RevealButton
                label="Anamnese"
                done={revealed.history}
                showCost={!isResult || revealedAtSubmit.history}
                onClick={() =>
                  setRevealed((r) => ({ ...r, history: true }))
                }
              />
              <RevealButton
                label="Untersuchung"
                done={revealed.examination}
                showCost={!isResult || revealedAtSubmit.examination}
                onClick={() =>
                  setRevealed((r) => ({ ...r, examination: true }))
                }
              />
              <RevealButton
                label="Bildgebung"
                done={revealed.imaging}
                unavailable={!hasImaging(caseData)}
                showCost={!isResult || revealedAtSubmit.imaging}
                tooltip={!hasImaging(caseData) && !isResult ? "Keine Bildgebung für diesen Fall verfügbar" : undefined}
                onClick={() => {
                  if (!hasImaging(caseData)) return;
                  setRevealed((r) => ({ ...r, imaging: true }));
                }}
              />
              <RevealButton
                label="Labor"
                done={revealed.labs}
                showCost={!isResult || revealedAtSubmit.labs}
                onClick={() => setRevealed((r) => ({ ...r, labs: true }))}
              />
            </div>
          </div>

          {revealed.history && (
            <FindingCard
              title="Anamnese"
              icon="ti-notes"
              text={caseData.history}
              expanded={cardExpanded.history}
              onToggle={() => setCardExpanded((e) => ({ ...e, history: !e.history }))}
            />
          )}
          {revealed.examination && (
            <FindingCard
              title="Körperliche Untersuchung"
              icon="ti-stethoscope"
              text={caseData.examination}
              expanded={cardExpanded.examination}
              onToggle={() => setCardExpanded((e) => ({ ...e, examination: !e.examination }))}
            />
          )}
          {revealed.imaging && (
            <ImagingCard
              imaging={caseData.imaging}
              expanded={cardExpanded.imaging}
              onToggle={() => setCardExpanded((e) => ({ ...e, imaging: !e.imaging }))}
            />
          )}
          {revealed.labs && (
            <LabCard
              labs={caseData.labs}
              expanded={cardExpanded.labs}
              onToggle={() => setCardExpanded((e) => ({ ...e, labs: !e.labs }))}
            />
          )}

          </div>
          <div
            className="relative z-10 md:absolute md:left-0 md:right-0"
            data-island-wrapper=""
            style={{
              top: diagnosisTop != null ? `${diagnosisTop}px` : undefined,
              minHeight: isResult && islandMinHeightRef.current > 0 ? islandMinHeightRef.current : undefined,
            }}
          >
            {phase !== "result" ? (
              <DiagnosisIsland
                caseData={caseData}
                options={caseData.diagnosisOptions}
                selectedDiagnosis={selectedDiagnosis}
                onSubmit={onSubmitDiagnosis}
                possiblePoints={possiblePoints}
                diagnosisIslandRef={diagnosisIslandRef}
              />
            ) : (
              <ResultIsland
                islandRef={diagnosisIslandRef}
                lastResultCorrect={lastResultCorrect}
                lastScoreEarned={lastScoreEarned}
                selectedDiagnosis={selectedDiagnosis}
                caseData={caseData}
                onNext={onNext}
                revealedCount={revealCount}
              />
            )}
          </div>
        </div>

        <aside className="hidden flex-col gap-4 md:sticky md:top-24 md:flex md:self-start">
          <StatusPanel
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
            possiblePoints={possiblePoints}
            revealed={revealed}
            revealedAtSubmit={revealedAtSubmit}
            phase={phase}
            caseId={caseData.id}
            difficulty={difficulty}
            anchorRef={reportAnchorRef}
          />
        </aside>

        <div className="hidden flex-col gap-4 sm:flex md:hidden">
          <StatusPanel
            dailyUsed={dailyUsed}
            dailyLimit={dailyLimit}
            possiblePoints={possiblePoints}
            revealed={revealed}
            revealedAtSubmit={revealedAtSubmit}
            phase={phase}
            caseId={caseData.id}
            difficulty={difficulty}
          />
        </div>
      </div>

      {phase === "playing" && (
        <OnboardingTour
          step1Ref={patientCardRef}
          step2Ref={befundeRef}
          step3Ref={diagnosisIslandRef}
        />
      )}

    </div>
  );
}
