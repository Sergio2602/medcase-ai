"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Logo } from "./components/Logo";
import { OnboardingTour } from "./components/OnboardingTour";
import { KontaktPopover } from "./components/KontaktPopover";
import { CenteredNav } from "./components/CenteredNav";
import { FadeInUp } from "./components/FadeInUp";
import { generateShareCard } from "@/lib/generateShareCard";
import { recordCaseResult, readCaseResults } from "@/lib/stats";
import { track } from "@/lib/analytics";

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
// Zusätzlicher Versatz, mit dem die Diagnose-/Result-Insel unterhalb ihrer
// eigentlichen Ankerlinie platziert wird — schafft mittig mehr Raum für
// aufgedeckte Befunde, bevor die Insel beginnt.
const ISLAND_TOP_GAP = 28;

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

// Eigener, spürbar langsamer Scroll statt des nativen (recht kurzen)
// `scrollIntoView({behavior:"smooth"})` — für den "Mehr erfahren"-Cue auf
// der Startseite, der bewusst ruhig/gleitend wirken soll.
function slowScrollTo(id: string, duration = 900) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startY = window.scrollY;
  const targetY = startY + el.getBoundingClientRect().top;
  if (reduced) {
    window.scrollTo({ top: targetY, behavior: "instant" as ScrollBehavior });
    return;
  }
  const start = performance.now();
  function tick(now: number) {
    const progress = Math.min((now - start) / duration, 1);
    // Ease-out statt ease-in-out: startet sofort spürbar, statt erst
    // "laggy" langsam anzulaufen — wird gegen Ende trotzdem sanft ruhiger.
    const eased = 1 - Math.pow(1 - progress, 3);
    // behavior: "instant" verhindert, dass die globale CSS
    // scroll-behavior:smooth-Regel zusätzlich zu unserer eigenen
    // rAF-Animation eine zweite (konkurrierende) Glättung anwendet.
    window.scrollTo({ top: startY + (targetY - startY) * eased, behavior: "instant" as ScrollBehavior });
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
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

  // Safari/Chrome merken sich beim Reload die letzte Scroll-Position der Seite
  // (history.scrollRestoration = "auto" per Default) — dadurch landet man nach
  // einem F5 wieder dort, wo man vorher gescrollt war, statt oben. Wir wollen
  // aber, dass ein Reload immer ganz oben startet, daher hier hart deaktivieren.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }, []);

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
      track("fall_gestartet", {
        difficulty: selected,
        discipline: selectedDiscipline ?? discipline,
      });
    } catch {
      track("fall_generierung_fehlgeschlagen", { difficulty: selected });
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
    const durationSeconds = startedAt
      ? Math.round((Date.now() - startedAt) / 1000)
      : 0;
    recordCaseResult({
      caseId: activeCase.id,
      discipline,
      difficulty: activeCase.difficulty,
      correct,
      score: earned,
      durationSeconds,
      timestamp: Date.now(),
    });
    track("fall_abgeschlossen", {
      correct,
      score: earned,
      befunde_angefordert: revealCount(revealed),
      difficulty: activeCase.difficulty,
      discipline,
      duration_seconds: durationSeconds,
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
      <div className="mx-auto max-w-[1560px]">
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

// Jeder Fall hat mehrere Kategorien (Anamnese/Untersuchung/Labor) mit echten
// Beispiel-Befunden statt nur einem Label — die Preview "tippt" diese
// Punkte nacheinander, bevor sie zur nächsten Kategorie/zum nächsten Fall
// wechselt. Simuliert das echte Spielgefühl statt eines statischen Screenshots.
const PATIENT_PREVIEWS = [
  {
    caseId: "FALL-0127",
    initials: "KM",
    color: "#90caf9",
    name: "Klaus M.",
    meta: "58 J. · männlich",
    quote: "Starke Brustschmerzen seit heute Morgen …",
    diagnosis: "NSTEMI",
    options: ["NSTEMI", "Stabile Angina pectoris", "Akute Perikarditis", "Aortendissektion Typ A"],
    insight: "Retrosternaler Schmerz + Troponin-Erhöhung ohne ST-Hebung = klassisches NSTEMI-Bild.",
    steps: [
      {
        category: "Anamnese",
        icon: "ti-message-circle",
        points: [
          "Schmerzbeginn vor 45 Minuten, retrosternal",
          "Ausstrahlung in den linken Arm",
          "Bekannter Hypertonus, Raucher (20 py)",
        ],
      },
      {
        category: "Labor",
        icon: "ti-flask",
        points: [
          "Troponin I: 0,8 ng/ml (↑)",
          "CK-MB: erhöht",
          "D-Dimer: unauffällig",
        ],
      },
    ],
  },
  {
    caseId: "FALL-0084",
    initials: "SF",
    color: "#a5d6a7",
    name: "Sabine F.",
    meta: "34 J. · weiblich",
    quote: "Seit drei Tagen Fieber und Husten, jetzt auch Atemnot …",
    diagnosis: "Ambulant erworbene Pneumonie",
    options: ["Ambulant erworbene Pneumonie", "Akute Bronchitis", "Akute Lungenembolie", "Exazerbierte COPD"],
    insight: "Fieber, produktiver Husten, erhöhtes CRP und Hypoxie erfüllen die klinischen Pneumonie-Kriterien.",
    steps: [
      {
        category: "Anamnese",
        icon: "ti-message-circle",
        points: [
          "Fieber bis 39,2 °C seit 3 Tagen",
          "Produktiver Husten, gelblicher Auswurf",
          "Zunehmende Atemnot seit heute",
        ],
      },
      {
        category: "Labor",
        icon: "ti-flask",
        points: [
          "CRP: 145 mg/l (↑↑)",
          "Leukozyten: 14.200/µl",
          "SpO₂: 91 % unter Raumluft",
        ],
      },
    ],
  },
  {
    caseId: "FALL-0211",
    initials: "TR",
    color: "#ffd54f",
    name: "Thomas R.",
    meta: "45 J. · männlich",
    quote: "Plötzlich einseitige Schwäche im Arm, Sprache verwaschen …",
    diagnosis: "Ischämischer Mediainfarkt",
    options: ["Ischämischer Mediainfarkt", "Transitorische ischämische Attacke", "Migräne mit Aura", "Hypoglykämie"],
    insight: "Akute halbseitige Schwäche + Sprachstörung + hoher NIHSS = typisches Mediastromgebiet-Muster.",
    steps: [
      {
        category: "Anamnese",
        icon: "ti-message-circle",
        points: [
          "Plötzliche linksseitige Schwäche",
          "Sprachstörung seit ca. 20 Minuten",
          "Keine bekannten Vorerkrankungen",
        ],
      },
      {
        category: "Untersuchung",
        icon: "ti-stethoscope",
        points: [
          "Kraftgrad Arm links 2/5",
          "NIHSS: 8 Punkte",
          "Faziale Asymmetrie links",
        ],
      },
    ],
  },
];

// Farbcodierung je Befund-Kategorie — macht auf einen Blick klar, welche Art
// von Befund gerade in der mittleren Spalte erhoben wird.
const CATEGORY_STYLES: Record<string, { text: string; bg: string }> = {
  Anamnese: { text: "#285dd2", bg: "#ecf0f9" },
  Untersuchung: { text: "#7c3aed", bg: "#f3ecfd" },
  Labor: { text: "#0d9488", bg: "#e3f5f3" },
};

// Zählt animiert vom aktuell angezeigten zum neuen Wert hoch/runter, statt
// abrupt umzuspringen — die einzige Animation, die auf der Diagnose-Seite
// der Karte übrig bleiben soll.
function TickingNumber({
  value,
  color,
  prefix = "",
}: {
  value: number;
  color: string;
  prefix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    const duration = 320;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color }}>
      {prefix}
      {display}
    </span>
  );
}

function RotatingPatientPreview() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [pointCount, setPointCount] = useState(0);
  // "revealing" = Befunde werden Schritt für Schritt getippt, "diagnosis" =
  // die 4 Diagnose-Buttons erscheinen, "result" = die richtige Antwort
  // blitzt kurz grün auf — spiegelt den echten Spielablauf im Mini-Format.
  const [uiPhase, setUiPhase] = useState<"revealing" | "diagnosis" | "result">("revealing");
  const [visible, setVisible] = useState(true);
  const autoRef = useRef(true);

  const currentCase = PATIENT_PREVIEWS[caseIndex];
  const currentStep = currentCase.steps[stepIndex];

  // Eine einzige zeitgesteuerte Kette statt mehrerer Intervalle: solange
  // noch nicht alle Punkte der aktuellen Kategorie "getippt" sind, wird
  // alle ~550ms ein weiterer Punkt eingeblendet. Sind alle sichtbar, wird
  // nach einer Lesepause zur nächsten Kategorie (oder zum nächsten Fall)
  // gewechselt — simuliert das echte Aufdecken von Befunden im Spiel.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (uiPhase === "revealing") {
      if (reduced) {
        setPointCount(currentStep.points.length);
        return;
      }
      if (pointCount < currentStep.points.length) {
        const t = setTimeout(() => setPointCount((c) => c + 1), 320);
        return () => clearTimeout(t);
      }
      if (!autoRef.current) return;
      const isLastStep = stepIndex === currentCase.steps.length - 1;
      const t = setTimeout(() => {
        if (isLastStep) {
          setUiPhase("diagnosis");
        } else {
          setStepIndex((i) => i + 1);
          setPointCount(0);
        }
      }, 650);
      return () => clearTimeout(t);
    }

    if (uiPhase === "diagnosis") {
      if (!autoRef.current) return;
      const t = setTimeout(() => setUiPhase("result"), reduced ? 300 : 450);
      return () => clearTimeout(t);
    }

    // uiPhase === "result"
    if (!autoRef.current) return;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setCaseIndex((i) => (i + 1) % PATIENT_PREVIEWS.length);
        setStepIndex(0);
        setPointCount(0);
        setUiPhase("revealing");
        setVisible(true);
      }, 250);
    }, reduced ? 300 : 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount, stepIndex, caseIndex, uiPhase]);

  // Sobald der Nutzer selbst durchklickt (Pfeil oder Dot), übernimmt er die
  // Kontrolle — die Auto-Rotation pausiert dauerhaft, statt mitten in der
  // Interaktion wieder dazwischenzuspringen.
  function goTo(i: number) {
    autoRef.current = false;
    setVisible(false);
    setTimeout(() => {
      setCaseIndex(i);
      setStepIndex(0);
      setPointCount(0);
      setUiPhase("revealing");
      setVisible(true);
    }, 200);
  }
  function next() {
    goTo((caseIndex + 1) % PATIENT_PREVIEWS.length);
  }
  function prev() {
    goTo((caseIndex - 1 + PATIENT_PREVIEWS.length) % PATIENT_PREVIEWS.length);
  }

  const possiblePoints = 100 - (stepIndex + 1) * 10;
  const stillTyping = uiPhase === "revealing" && pointCount < currentStep.points.length;
  const totalFindings = currentCase.steps.reduce((sum, s) => sum + s.points.length, 0);

  return (
    <div className="relative">
      {/* Pfeile an den äußeren Kanten der Karte, statt darunter versteckt */}
      <button
        type="button"
        onClick={prev}
        aria-label="Vorheriger Fall"
        className="absolute left-0 top-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-card-border/15 bg-card text-muted transition-colors hover:border-accent/30 hover:text-accent"
      >
        <i className="ti ti-chevron-left text-lg" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Nächster Fall"
        className="absolute right-0 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border-[1.5px] border-card-border/15 bg-card text-muted transition-colors hover:border-accent/30 hover:text-accent"
      >
        <i className="ti ti-chevron-right text-lg" />
      </button>

      <div className="card p-6 sm:p-8">
        {/* Card header — always visible */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-[#16a34a]"
              style={{ animation: "pulse-soft 2s ease-in-out infinite" }}
            />
            <span className="text-xs font-bold uppercase tracking-[0.065em] text-muted">
              Laufender Fall
            </span>
          </div>
          <span className="font-mono text-xs text-muted/60">{currentCase.caseId}</span>
        </div>

        {/* Wieder dreigeteilt (Patient / Befunde / Punkte+Diagnose), aber mit
            fixer Höhe je Spalte — die Karte darf beim Aufdecken nicht mehr in
            der Höhe springen. Farbcodierung je Kategorie macht klar, was
            gerade erhoben wird. */}
        <div
          className="grid gap-6 transition-opacity duration-300 sm:grid-cols-[0.9fr_1fr_0.95fr]"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {/* Spalte 1: Patient */}
          <div className="flex h-[208px] flex-col justify-center">
            <div className="mb-4 flex items-center gap-3.5">
              <div
                className="avatar-circle h-12 w-12 text-base"
                style={{ backgroundColor: currentCase.color }}
              >
                {currentCase.initials}
              </div>
              <div>
                <p className="text-base font-bold">{currentCase.name}</p>
                <p className="text-sm text-muted">{currentCase.meta}</p>
              </div>
            </div>
            <p className="border-l-[1.5px] border-card-border/20 pl-3 text-base italic text-foreground/80">
              „{currentCase.quote}{'"'}
            </p>
          </div>

          {/* Spalte 2: Befunde — farblich je Kategorie, feste Höhe egal
              wie viele Punkte gerade sichtbar sind. Kategorie-Wechsel wird
              per key-Remount neu eingeblendet (line-pop). */}
          <div
            key={`${caseIndex}-${stepIndex}`}
            className="flex h-[208px] flex-col border-t border-card-border/10 pt-5 sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0"
          >
            <span
              className="line-pop mb-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.065em]"
              style={{ color: CATEGORY_STYLES[currentStep.category]?.text, backgroundColor: CATEGORY_STYLES[currentStep.category]?.bg }}
            >
              <i className={`ti ${currentStep.icon} text-xs`} />
              {currentStep.category} wird erhoben
            </span>
            <div className="flex flex-1 flex-col gap-2.5">
              {currentStep.points.slice(0, pointCount).map((point) => (
                <div
                  key={point}
                  className="line-pop flex items-center gap-2 text-[14px] font-semibold"
                  style={{ color: CATEGORY_STYLES[currentStep.category]?.text }}
                >
                  <i className="ti ti-check text-xs shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
              {stillTyping && (
                <span
                  className="ml-[19px] inline-block h-3.5 w-[2px]"
                  style={{
                    backgroundColor: CATEGORY_STYLES[currentStep.category]?.text,
                    animation: "pulse-soft 0.9s ease-in-out infinite",
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
            <span className="text-[11px] text-muted">{totalFindings} Befunde in diesem Fall</span>
          </div>

          {/* Spalte 3: Punktestand + Diagnose — immer sichtbar, Diagnose
              aktiviert sich erst am Ende ("Extrainfos" statt leerer Fläche).
              Die Punktezahl zählt animiert hoch/runter bei jeder Änderung.
              Die Diagnose-Optionen sind von Anfang an normal les-/wählbar
              (kein grau-deaktivierter Zustand) — nur die richtige Antwort
              bekommt im Result einen Scale-Bounce mit grünem Glow. */}
          <div className="flex h-[208px] flex-col border-t border-card-border/10 pt-5 sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.065em] text-muted">
                {uiPhase === "result" ? "Erreicht" : "Noch möglich"}
              </span>
              <TickingNumber
                value={possiblePoints}
                prefix={uiPhase === "result" ? "+" : ""}
                color={uiPhase === "result" ? "#15803d" : "#285dd2"}
              />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 border-t border-card-border/10 pt-3.5">
              {currentCase.options.map((opt) => {
                const isCorrect = opt === currentCase.diagnosis;
                const showResult = uiPhase === "result";
                return (
                  <span
                    key={opt}
                    className={`flex items-center justify-center rounded-lg border-[1.5px] px-1.5 py-[7px] text-center text-[10px] font-semibold leading-snug transition-colors ${
                      showResult && isCorrect
                        ? "correct-pop border-[#16a34a] bg-[#e7f6ec] text-[#15803d]"
                        : showResult
                        ? "border-card-border/10 text-muted/40"
                        : "border-card-border/8 text-foreground/80"
                    }`}
                  >
                    {showResult && isCorrect && <i className="ti ti-check mr-1 text-[9px] shrink-0" />}
                    {opt}
                  </span>
                );
              })}
            </div>

            {/* Kurze Begründung — zeigt, dass es dazu Informationen gibt,
                sobald die Diagnose steht. Hellblau statt Amber (Info, keine
                Warnung), mit Line-Pop-Einblendung. */}
            {uiPhase === "result" && (
              <div
                key={`insight-${caseIndex}`}
                className="line-pop mt-2 flex items-start gap-1.5 rounded-md border-[1.5px] border-accent/20 bg-[#ecf0f9] px-2 py-1.5"
                style={{ animationDelay: "180ms" }}
              >
                <i className="ti ti-info-circle mt-[1px] shrink-0 text-[11px] text-accent" />
                <p className="text-[10px] leading-snug text-accent">{currentCase.insight}</p>
              </div>
            )}
          </div>
        </div>

        {/* Durchklickbare Fall-Auswahl (Dots) */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {PATIENT_PREVIEWS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Fall ${i + 1} anzeigen`}
              className="transition-all duration-300"
              style={{
                backgroundColor: i === caseIndex ? "#285dd2" : "#a8a69c",
                width: i === caseIndex ? 18 : 6,
                height: 6,
                borderRadius: i === caseIndex ? 3 : 9999,
              }}
            />
          ))}
        </div>
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
  { id: "allgemeinmedizin", label: "Allgemeinmedizin", locked: false },
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
                Aktuell Innere und Allgemeinmedizin spielbar. Weitere Fächer sind in Vorbereitung — kein festes Datum.
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

// Zählt beim ersten Sichtbarwerden von 0 auf den Zielwert hoch (ease-out,
// ~900ms). WICHTIG: Initial-State ist der Zielwert, damit SSR/Crawler/
// Link-Previews und Nutzer ohne JS die echte Zahl sehen (nicht "0") —
// die Animation ist reines Client-Enhancement beim Herunterscrollen.
function AnimatedNumber({
  target,
  suffix = "",
  duration = 900,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(target);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const start = performance.now();
          function tick(now: number) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
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
        <p
          className={`mt-1 text-sm leading-relaxed text-muted ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          Hi, ich bin Sergio, Medizinstudent im 7. Semester. Kurz vor meiner
          ersten Famulatur wollte ich mich auf die häufigsten klinischen
          Fälle vorbereiten – und hab gemerkt, was im Studium fehlt:
          Anamnesen liest man nur in Textform, statt sie selbst zu erheben.
          Und wenn im Unterricht Laborwerte gezeigt werden, hat man die
          typischen Befundkombinationen selten im Kopf. Medcase trainiert
          genau das, unabhängig von Anki-Karten: Du forderst die Befunde
          selbst an und lernst durch eigenes Denken, welche Kombination zu
          welcher Diagnose gehört – als eigene Vorbereitung oder Ergänzung
          im Klinikalltag. Über Feedback freue ich mich jederzeit.
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

function MiniStep({
  n,
  icon,
  title,
  text,
}: {
  n: number;
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-2.5 rounded-lg border-[1.5px] border-card-border/10 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecf0f9] text-accent">
        <i className={`ti ${icon} text-[13px]`} />
      </div>
      <div>
        <p className="mb-0.5 text-[12.5px] font-bold text-foreground">
          {n}. {title}
        </p>
        <p className="text-[12px] leading-snug text-muted">{text}</p>
      </div>
    </div>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-3.5">
      <p className="text-xl font-extrabold text-[#15803d]">
        <AnimatedNumber target={value} />
      </p>
      <p className="text-[11.5px] font-semibold text-[#15803d]">{label}</p>
    </div>
  );
}

// Evidenz-Block: belegt mit Primärquellen, dass das Defizit, das Medcase
// trainiert, in der Ausbildungsforschung dokumentiert ist. Nur verifizierte
// Aussagen (direkt an der GMS-Originalquelle geprüft) — konsistent mit dem
// Quellen-USP der Seite. Dient doppelt: Social-Proof-Ersatz für Besucher
// heute, Argumentationsgrundlage für Skills-Lab-/Dozenten-Gespräche später.
function EvidenceCard() {
  return (
    <div className="card mt-3 p-5">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <i className="ti ti-school text-sm text-accent" />
        Warum dieses Training im Studium fehlt
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border-[1.5px] border-accent/20 bg-[#ecf0f9] p-4">
          <p className="text-2xl font-extrabold text-accent">
            Nur <AnimatedNumber target={50} suffix=" %" />
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            der Medizinstudierenden im klinischen Abschnitt haben im Curriculum
            je von Clinical Reasoning gehört — obwohl sie es für die spätere
            Praxis als sehr wichtig einschätzen.
          </p>
        </div>
        <div className="rounded-lg border-[1.5px] border-accent/20 bg-[#ecf0f9] p-4">
          <p className="text-2xl font-extrabold text-accent">
            <i className="ti ti-dice-3 align-middle text-xl" /> Zufall
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            Nur wenige Fakultäten haben dedizierte Lehrformate dafür — „die
            Lehre von Clinical Reasoning bleibt mehr oder weniger dem Zufall
            überlassen&ldquo;.
          </p>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Dabei gilt klinisches Denken laut NKLM als ärztliche Kernkompetenz für
        Patientensicherheit und den gezielten Einsatz von Diagnostik. Genau
        diese Lücke trainiert Medcase: Befunde bewusst anfordern, statt alles
        vorgelegt zu bekommen.
      </p>
      <p className="mt-2 text-[11px] text-muted">
        Quelle:{" "}
        <a
          href="https://www.egms.de/static/de/journals/zma/2020-37/zma001341.shtml"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent hover:underline"
        >
          Weidenbusch et al., GMS J Med Educ 2020 (LMU München)
        </a>
      </p>
    </div>
  );
}

// Vertrauens-Block: nimmt die "ist das KI überhaupt seriös?"-Sorge vorweg,
// bevor der Gründer-Text (persönlich, aber kein Beleg) folgt. Beide Hälften
// (Warum-KI + So-entsteht-ein-Fall) leben in EINER Karte, damit sie optisch
// zusammengehören statt als zwei getrennte "Inseln" zu wirken. Der "Mehr"-Chip
// überlappt die interne Trennlinie als Overlay und triggert einen sanften
// Scroll (html { scroll-behavior: smooth } in globals.css) statt eines Sprungs.
function TrustAndProcessCard() {
  return (
    <div id="methodik" className="card mt-3 scroll-mt-24 overflow-visible p-0">
      <div className="p-5 pb-7">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <i className="ti ti-shield-check text-sm text-accent" />
          Warum KI-gestützte Fälle?
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Wir kombinieren KI-Generierung mit echter Quellenrecherche — jeder Fall wird gegen
          AWMF-Leitlinien, IMPP-Gegenstandskataloge und offizielle Versorgungsdaten geprüft,
          nicht frei erfunden.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent/25 bg-[#ecf0f9] px-3 py-1 text-xs font-bold text-accent">
            <i className="ti ti-files text-[11px]" />
            <AnimatedNumber target={70} suffix="+ Fälle" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent/25 bg-[#ecf0f9] px-3 py-1 text-xs font-bold text-accent">
            <i className="ti ti-checkbox text-[11px]" />
            <AnimatedNumber target={100} suffix="% quellenbasiert" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent/25 bg-[#ecf0f9] px-3 py-1 text-xs font-bold text-accent">
            <i className="ti ti-certificate text-[11px]" />
            AWMF · IMPP · Destatis
          </span>
          <Link
            href="/ueber-uns"
            className="ml-auto text-xs font-semibold text-accent hover:underline"
          >
            Mehr zur Methodik →
          </Link>
        </div>
      </div>

      {/* Nahtübergang: reine Trennlinie, kein Overlay-Chip mehr nötig — genug Content folgt */}
      <div className="border-t border-card-border/10">
        <div id="wie-entsteht" className="scroll-mt-24 p-5 pt-6">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <i className="ti ti-route text-sm text-accent" />
            So entsteht ein Fall
          </p>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted">
            Kein Fall wird &bdquo;einfach so&ldquo; von einer KI ausgegeben — jeder durchläuft
            denselben festen, sechsstufigen Prozess.
          </p>
          <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                n: 1,
                icon: "ti-list-search",
                title: "Diagnose auswählen",
                text: "Nach IMPP-Häufigkeit, realer Prävalenz (RKI) und Cannot-miss-Kriterium.",
              },
              {
                n: 2,
                icon: "ti-books",
                title: "Recherche",
                text: "Nur Primärquellen: AWMF, ESC, RKI, Onkopedia, IMPP, PubMed.",
              },
              {
                n: 3,
                icon: "ti-pencil",
                title: "Fall schreiben",
                text: "Anamnese, Untersuchung, Labor/Bildgebung, 4 Antwortoptionen.",
              },
              {
                n: 4,
                icon: "ti-checkup-list",
                title: "Konsistenz-Check",
                text: "Passen Laborwerte, Demografie und Bildgebung physiologisch zusammen?",
              },
              {
                n: 5,
                icon: "ti-shield-check",
                title: "Strukturvalidierung",
                text: "Automatisiertes Skript prüft Pflichtfelder vor Veröffentlichung.",
              },
              {
                n: 6,
                icon: "ti-quote",
                title: "Quellen dokumentieren",
                text: "Jede Quelle wird vermerkt — auch wenn die Quellenlage dünn ist.",
              },
            ].map((step, i) => (
              <FadeInUp key={step.n} delay={i * 70}>
                <MiniStep n={step.n} icon={step.icon} title={step.title} text={step.text} />
              </FadeInUp>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { value: 15, label: "Vorklinik-Fälle" },
              { value: 40, label: "Klinik-Fälle" },
              { value: 15, label: "Examen/PJ-Fälle" },
            ].map((stat, i) => (
              <FadeInUp key={stat.label} delay={i * 90}>
                <StatBox value={stat.value} label={stat.label} />
              </FadeInUp>
            ))}
          </div>
          <Link
            href="/ueber-uns#qualitaet"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            Vollständige Methodik &amp; Qualitätssicherung ansehen →
          </Link>
        </div>
      </div>
    </div>
  );
}

// Vereinfachte Version der RangeBar von /ueber-uns#impp-haeufigkeit — gleiche
// Zahlen, nur kompakter für die Homepage.
function MiniRangeBar({
  label,
  min,
  max,
  max100 = 30,
}: {
  label: string;
  min: number;
  max: number;
  max100?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[168px] shrink-0 text-[13px] font-semibold text-foreground/85">{label}</span>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-card-border/10">
        <div
          className="absolute h-full rounded-full bg-accent/70"
          style={{ left: `${(min / max100) * 100}%`, width: `${((max - min) / max100) * 100}%` }}
        />
      </div>
      <span className="w-[56px] shrink-0 text-right text-[13px] font-bold text-accent">
        {min}–{max}%
      </span>
    </div>
  );
}

const CANNOT_MISS_PREVIEW = [
  "NSTEMI",
  "Akute Lungenembolie",
  "Aortendissektion Typ A",
  "Status epilepticus",
  "Urosepsis / septischer Schock",
  "Anaphylaktischer Schock",
];

// Zieht die IMPP-Häufigkeit + Cannot-miss-Daten von /ueber-uns auf die
// Homepage — gleiche Zahlen, keine erfundenen Werte, nur eine kompakte
// Auswahl mit Link zur vollständigen Seite.
function FallauswahlPreview() {
  const impBars = [
    { label: "Nervensystem & Psyche", min: 20, max: 30 },
    { label: "Notfallmaßnahmen (Achse 2)", min: 5, max: 20 },
    { label: "Kardiovaskuläres System", min: 10, max: 20 },
    { label: "Respiratorisches System", min: 5, max: 15 },
  ];

  return (
    <div className="card mt-3 p-6">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <i className="ti ti-target-arrow text-sm text-accent" />
        Wonach wir Fälle auswählen
      </p>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted">
        Nicht zufällig: nach offiziellem IMPP-Prüfungs-Blueprint (M2-Examen) und einer eigenen
        Cannot-miss-Achse für seltene, aber zeitkritische Diagnosen.
      </p>

      <div className="mb-5 flex flex-col gap-2.5">
        {impBars.map((bar, i) => (
          <FadeInUp key={bar.label} delay={i * 70}>
            <MiniRangeBar {...bar} />
          </FadeInUp>
        ))}
      </div>
      <Link
        href="/ueber-uns#impp-haeufigkeit"
        className="mb-5 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
      >
        Alle 10 Fachbereiche + Quelle ansehen →
      </Link>

      <div className="border-t border-card-border/10 pt-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <i className="ti ti-alert-triangle text-sm text-accent" />
          Cannot-miss-Fälle
        </p>
        <p className="mb-3 text-sm leading-relaxed text-muted">
          <AnimatedNumber target={38} /> von <AnimatedNumber target={70} /> Fällen (rund{" "}
          <AnimatedNumber target={54} suffix="%" />) sind bewusst als cannot-miss markiert — zeitkritisch,
          aber leicht zu übersehen.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CANNOT_MISS_PREVIEW.map((d, i) => (
            <FadeInUp key={d} delay={i * 50}>
              <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-accent/25 bg-[#ecf0f9] px-2.5 py-1 text-[11.5px] font-semibold text-accent">
                <i className="ti ti-alert-triangle text-[9px]" />
                {d}
              </span>
            </FadeInUp>
          ))}
          <span className="inline-flex items-center rounded-full border-[1.5px] border-card-border/15 px-2.5 py-1 text-[11.5px] font-semibold text-muted">
            +32 weitere
          </span>
        </div>
        <Link
          href="/ueber-uns#cannot-miss"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          Alle Cannot-miss-Fälle ansehen →
        </Link>
      </div>
    </div>
  );
}

// Ebenfalls von /ueber-uns#qualitaet übernommen — gleicher Wortlaut/Status,
// damit Homepage und Über-uns nie widersprüchliche Aussagen machen.
function QualitaetPreviewCard() {
  return (
    <div className="card mt-3 p-6">
      <p className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <i className="ti ti-shield-check text-sm text-accent" />
        Qualitätssicherung
      </p>
      <div className="flex flex-col gap-3">
        <FadeInUp>
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e7f6ec] text-[#15803d]">
              <i className="ti ti-check text-[13px]" />
            </span>
            <p className="text-sm leading-relaxed text-muted">
              <strong className="text-foreground">&bdquo;Fall melden&ldquo;-Funktion ist live:</strong> Jeder Fall kann
              direkt im Ergebnis-Screen gemeldet werden — ein echter Feedback-Kanal, kein Versprechen.
            </p>
          </div>
        </FadeInUp>
        <FadeInUp delay={90}>
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fef3e2] text-[#92400e]">
              <i className="ti ti-clock text-[13px]" />
            </span>
            <p className="text-sm leading-relaxed text-muted">
              <strong className="text-foreground">Fachärztliches Review ist geplant, aber noch nicht erfolgt.</strong>{" "}
              Quellenangaben ersetzen kein fachliches Urteil.
            </p>
          </div>
        </FadeInUp>
      </div>
      <Link
        href="/ueber-uns#qualitaet"
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
      >
        Vollständige Qualitätssicherung ansehen →
      </Link>
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
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col pb-4">
      {/* Dezente Hintergrund-Deko hinter dem Hero — gegen die "leere" Wirkung
          auf breiten Screens. Kein overflow-hidden auf dem Root-Element,
          damit die sticky Nav weiter funktioniert. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[920px]" aria-hidden="true">
        {/* Sanft driftender Blauton-Verlauf statt statischer Flecken — deutet
            "frisch, KI-generiert" an, ohne aufdringlich zu wirken. Läuft jetzt
            bis über die Fallkarte hinaus weiter, statt abrupt nach dem Hero
            zu enden. */}
        <div className="hero-blob-a absolute left-[6%] top-6 h-72 w-72 rounded-full bg-accent/[0.09] blur-3xl" />
        <div className="hero-blob-b absolute right-[8%] top-32 h-80 w-80 rounded-full bg-[#38bdf8]/[0.08] blur-3xl" />
        <div className="hero-blob-c absolute left-[22%] top-[640px] h-72 w-72 rounded-full bg-accent/[0.06] blur-3xl" />
      </div>
      <CenteredNav active="home" />
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-[#ecf0f9] px-4 py-1.5 text-sm font-bold text-accent">
          Für Medizinstudierende · Deutschland
        </span>
        <h1 className="mt-2 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">
          Klinisch neu denken.
        </h1>
        <p className="mt-1.5 max-w-md text-lg leading-relaxed text-muted">
          Realistische Patientenfälle für Vorklinik, Klinik und PJ — du
          entscheidest, welche Befunde du anforderst.
        </p>
      </div>

      <div className="mx-auto mt-5 w-full max-w-6xl">
        <RotatingPatientPreview />
      </div>

      <div className="mx-auto mt-4 flex flex-col items-center gap-2">
        <button
          onClick={() => setShowPicker(true)}
          className="group relative overflow-hidden rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
        >
          Ersten Fall ausprobieren{" "}
          <span className="inline-block transition-transform duration-200 ease-out group-hover:translate-x-2 group-active:translate-x-2">
            →
          </span>
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-accent to-transparent"
            aria-hidden="true"
          />
          {/* Periodisch durchlaufender Glanz-Streifen — soll Lust aufs Klicken machen */}
          <span
            className="cta-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            aria-hidden="true"
          />
        </button>
        <p className="text-sm text-muted">
          Kostenlos · Kein Account nötig · Heute 5 freie Fälle
        </p>

        {/* Sekundärer CTA — kleiner als der primäre Button */}
        <button
          type="button"
          onClick={() => slowScrollTo("methodik")}
          className="group mt-2 flex items-center gap-1.5 rounded-lg border-[1.5px] border-accent/30 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
        >
          Erfahre mehr über unser Konzept
          <i className="ti ti-chevron-down text-base transition-transform duration-200 group-hover:translate-y-0.5" />
        </button>
      </div>

      {showPicker && (
        <DifficultyModal
          onSelect={onStart}
          onClose={() => setShowPicker(false)}
        />
      )}
      <div className="pt-12">
        <FadeInUp>
          <EvidenceCard />
        </FadeInUp>
        <FadeInUp>
          <TrustAndProcessCard />
        </FadeInUp>
        <FadeInUp>
          <FallauswahlPreview />
        </FadeInUp>
        <FadeInUp>
          <QualitaetPreviewCard />
        </FadeInUp>
        <FadeInUp delay={120}>
          <WelcomeNote />
        </FadeInUp>
        {/* Abschluss-CTA: Wer bis hier gescrollt hat, ist überzeugt — und
            fand bisher keinen Spiel-Einstieg mehr. Gleicher Picker wie oben. */}
        <FadeInUp>
          <div className="card mt-3 flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-xl font-extrabold tracking-tight md:text-2xl">
              Dein erster Patient wartet.
            </p>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Anamnese, Untersuchung und Labor selbst anfordern — und mit so
              wenigen Befunden wie möglich zur richtigen Diagnose kommen.
            </p>
            <button
              onClick={() => setShowPicker(true)}
              className="group relative mt-1 overflow-hidden rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
            >
              Ersten Fall starten{" "}
              <span className="inline-block transition-transform duration-200 ease-out group-hover:translate-x-2 group-active:translate-x-2">
                →
              </span>
            </button>
            <p className="text-xs text-muted">Kostenlos · Kein Account nötig</p>
          </div>
        </FadeInUp>
        <footer
          className="mt-3 flex items-center justify-between border-t border-card-border/15 pt-3"
          style={{ fontSize: 11, color: "#5f5e5a" }}
        >
          <span>© 2026 Medcase</span>
          <div className="flex items-center gap-4">
            <Link href="/news" className="hover:underline">News</Link>
            <Link href="/impressum" className="hover:underline">Impressum</Link>
            <Link href="/impressum#datenschutz" className="hover:underline">Datenschutz</Link>
            <KontaktPopover />
          </div>
        </footer>
      </div>
    </div>
  );
}

const LOADING_STAGES = [
  { icon: "ti-door-enter", text: "Patient betritt die Klinik …" },
  { icon: "ti-stethoscope", text: "Klinische Daten werden zusammengestellt …" },
  { icon: "ti-file-check", text: "Fall wird vorbereitet …" },
];

function LoadingScreen() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  const current = LOADING_STAGES[stage];

  return (
    <div className="relative flex min-h-[62vh] flex-col items-center justify-center gap-8 overflow-hidden text-center">
      <div
        className="hero-blob-a pointer-events-none absolute -left-16 top-6 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(40,93,210,0.14), transparent 70%)" }}
      />
      <div
        className="hero-blob-b pointer-events-none absolute -right-12 bottom-10 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10), transparent 70%)" }}
      />

      <Logo size={48} />

      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="loading-ring absolute inset-0 rounded-full border-[3px] border-accent/15 border-t-accent" />
        <span className="loading-badge flex h-20 w-20 items-center justify-center rounded-full bg-[#ecf0f9]">
          <i className={`ti ${current.icon} text-4xl text-accent`} />
        </span>
      </div>

      <div key={stage} className="loading-stage-in flex flex-col items-center gap-3">
        <p className="text-lg font-semibold text-foreground">{current.text}</p>
        <div className="flex items-center gap-1.5">
          {LOADING_STAGES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stage ? "w-6 bg-accent" : "w-1.5 bg-accent/20"
              }`}
            />
          ))}
        </div>
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
      <span className="flex items-baseline gap-[6px] whitespace-nowrap rounded-full border-[1.5px] border-card-border/10 bg-foreground/[0.03] px-[16px] py-[7px]">
        <span className="text-[11px] font-semibold text-muted">{label}</span>
        <span className="tabular-nums text-[19px] font-extrabold text-accent">{value}</span>
      </span>
    );
  }
  return (
    <span className="rounded-full border-[1.5px] border-card-border/10 bg-foreground/[0.03] px-3 py-1.5 text-sm font-semibold">
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
  // Defaults to the user's own (wrong) pick when the answer was incorrect —
  // more intuitive than opening on the generic synthesis explanation, since
  // "why was MY answer wrong" is what someone wants to read first. Falls
  // back to null (→ "Vollständige Begründung") when correct, since there's
  // no wrong pick to explain.
  const [selectedNoteOption, setSelectedNoteOption] = useState<string | null>(() =>
    !lastResultCorrect && selectedDiagnosis && selectedDiagnosis !== caseData.correctDiagnosis
      ? selectedDiagnosis
      : null
  );

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
    track("share_geklickt", { correct: lastResultCorrect, score: lastScoreEarned });
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
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#8b5cf6]/40 bg-[#f3eefc] px-2.5 py-1 text-[11px] font-semibold text-[#6d28d9]">
                  <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-white">
                    <i className="ti ti-alert-triangle text-[10px]" />
                  </span>
                  {caseData.caseContext.note}
                </span>
              ) : (
                <div className="mt-2 flex items-start gap-2 rounded-lg border-2 border-accent/30 bg-[#ecf0f9] px-3 py-2">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
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
      track("fall_gemeldet", { difficulty });
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

      // Extra Abstand nach unten versetzt: gibt der Mitte mehr Platz für
      // aufgedeckte Befunde, bevor die Diagnoseinsel beginnt.
      const lineY = anchorRect.bottom - colRect.top + ISLAND_TOP_GAP;
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
        <div className="flex items-center justify-between gap-3 rounded-full border-[1.5px] border-card-border/10 bg-card/90 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Menü öffnen"
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-foreground/5"
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
          className="mt-1.5 flex items-center justify-between rounded-full border-[1.5px] border-card-border/10 bg-card/90 px-4 py-1.5 backdrop-blur-md"
          style={{ visibility: isResult ? "hidden" : undefined }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mögliche Punkte</span>
          <span className="clinical-data text-sm font-extrabold text-accent">{possiblePoints} / {BASE_SCORE}</span>
        </div>
      </header>

      {/* Desktop header — volle Breite, linksbündig (Logo + Pfad links,
          Punktestand rechts), statt kompakter zentrierter Pill. */}
      <header className="sticky top-0 z-30 mb-4 -mt-5 hidden pb-2 pt-4 sm:block">
        <div className="flex w-full items-center gap-2.5 rounded-full border-[1.5px] border-card-border/10 bg-card/90 px-2.5 py-2 backdrop-blur-md">
          <button
            onClick={onGoHome}
            className="flex shrink-0 items-center overflow-hidden pl-1 transition-opacity hover:opacity-80"
          >
            <Logo size={28} />
          </button>
          <div className="h-5 w-px shrink-0 bg-card-border/15" />

          <button
            onClick={onGoHome}
            className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-card-border/10 bg-foreground/[0.02] px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-accent/30 hover:text-accent"
          >
            <i className="ti ti-arrow-left text-[13px]" />
            Zurück
          </button>

          {/* Pfad — rein informativ, keine eigene Klickfunktion mehr; das
              Zurückgehen übernimmt der separate Button daneben. */}
          <div className="flex min-w-0 items-center gap-1.5 rounded-full border-[1.5px] border-card-border/10 bg-foreground/[0.02] py-1.5 px-3 text-sm">
            <span className="shrink-0 font-medium text-muted">Start</span>
            <i className="ti ti-chevron-right shrink-0 text-[12px] text-muted/30" />
            <span className="shrink-0 font-medium text-muted">{difficultyLabel}</span>
            <i className="ti ti-chevron-right shrink-0 text-[12px] text-muted/30" />
            <span className="truncate font-semibold text-accent">
              {disciplineLabel}
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
            <div className="h-5 w-px shrink-0 bg-card-border/15" />
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
          <div ref={contentScrollRef} data-content-scroll="" className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
          <div ref={patientCardRef} className="card flex gap-3 p-3.5">
            <div
              className="avatar-circle h-11 w-11 shrink-0 text-sm"
              style={{ backgroundColor: color }}
            >
              {initials(caseData.patientName)}
            </div>
            <div>
              <h2 className="text-[15px] font-bold leading-tight">
                {caseData.patientName},{" "}
                {caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`}
                <span className="ml-1.5 font-normal text-muted">
                  {caseData.gender === "male" ? "· Männlich" : "· Weiblich"}
                </span>
              </h2>
              <blockquote className="mt-1.5 border-l-[1.5px] border-accent pl-3 italic">
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
