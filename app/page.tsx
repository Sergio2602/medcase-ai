"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Logo } from "./components/Logo";
import { KontaktPopover } from "./components/KontaktPopover";
import { CenteredNav } from "./components/CenteredNav";
import { FadeInUp } from "./components/FadeInUp";
import { generateShareCard } from "@/lib/generateShareCard";
import { recordCaseResult, readCaseResults } from "@/lib/stats";
import { track } from "@/lib/analytics";
import { getReviewMode, endReviewMode, type ReviewSession } from "@/lib/reviewMode";
import { ReviewModeBar } from "./components/ReviewModeBar";
import { SessionFeedbackModal } from "./components/SessionFeedbackModal";
import { PostCaseFeedback } from "./components/PostCaseFeedback";
import { LaunchIntentPrompt } from "./components/LaunchIntentPrompt";
import { HomeWaitlistCard } from "./components/WaitlistSignup";

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
  { id: "klinik", label: "Klinik" },
  { id: "examen", label: "PJ" },
];
export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [difficulty, setDifficulty] = useState<Difficulty>("klinik");
  const [discipline, setDiscipline] = useState<Discipline>("zufaellig");
  // Review-Modus (Experten, von /review gestartet) — steuert das Experten-
  // Review am Ergebnis-Screen + die Feedback-Leiste.
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [showSessionFeedback, setShowSessionFeedback] = useState(false);
  // Post-Case-Overlay: "doctor" (Review-Modus) oder "student" (Micro-Survey).
  const [postFeedback, setPostFeedback] = useState<null | "doctor" | "student">(null);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [revealed, setRevealed] = useState<Revealed>({
    history: true, // Anamnese ist gratis (immer vorgelegt)
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
  // Tages-Zähler bleibt (Engagement-Messung + dezente UI), aber KEIN hartes Limit
  // mehr im Validierungslauf: wir wollen die echte Nutzungshöhe sehen, nicht kappen.
  const [dailyUsed, setDailyUsed] = useState(0);
  // Nicht-blockierender Launch-Intent-Ask (einmal, nach sichtbarem Engagement).
  const [showIntent, setShowIntent] = useState(false);
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

  // Review-Modus beim Laden erkennen (von /review gesetzt).
  useEffect(() => {
    setReviewSession(getReviewMode());
  }, []);

  // Tages-Zähler + E-Mail-Unlock laden (Zähler setzt sich täglich zurück).
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem("medcase:daily");
      if (raw) {
        const p = JSON.parse(raw) as { date?: string; count?: number };
        if (p.date === today) setDailyUsed(p.count ?? 0);
        else localStorage.setItem("medcase:daily", JSON.stringify({ date: today, count: 0 }));
      }
    } catch {}
  }, []);

  async function startCase(selected: Difficulty, selectedDiscipline?: Discipline) {
    // Kein hartes Tageslimit mehr: freies Weiterspielen, damit wir die echte
    // Engagement-Höhe messen (Fälle sind statisches JSON, kosten ~nichts).
    setDifficulty(selected);
    if (selectedDiscipline) setDiscipline(selectedDiscipline);
    setPhase("loading");
    setRevealed({
      history: true, // Anamnese gratis
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
      const minDelay = new Promise((resolve) => setTimeout(resolve, 800));
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
      setDailyUsed((d) => {
        const next = d + 1;
        try {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("medcase:daily", JSON.stringify({ date: today, count: next }));
        } catch {}
        return next;
      });
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

  // Anamnese ist gratis — nur Untersuchung/Bildgebung/Labor kosten Punkte.
  function paidRevealCount(r: Revealed) {
    return [r.examination, r.imaging, r.labs].filter(Boolean).length;
  }

  function submitDiagnosis(option: string) {
    if (!activeCase || selectedDiagnosis) return;
    setRevealedAtSubmit(revealed);
    setSelectedDiagnosis(option);
    const correct = option === activeCase.correctDiagnosis;
    const earned = correct
      ? Math.max(
          BASE_SCORE - paidRevealCount(revealed) * INVESTIGATION_COST,
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
      befunde_angefordert: paidRevealCount(revealed),
      difficulty: activeCase.difficulty,
      discipline,
      duration_seconds: durationSeconds,
    });
    setPhase("result");

    // Post-Case-Feedback als Overlay (nicht mehr eingebettet):
    // Review-Modus → Arzt-Urteil direkt nach jedem Fall. Die Studenten-Survey
    // kommt NICHT hier, sondern erst beim "Nächster Patient"-Klick (siehe
    // nextCase) — so kann das Ergebnis erst in Ruhe gelesen werden.
    if (reviewSession) {
      setPostFeedback("doctor");
    }
    // Launch-Nudge und Studenten-Survey laufen meilensteinbasiert über nextCase
    // (siehe dort), nicht hier.
  }

  function nextCase() {
    // Meilenstein-Logik beim "Nächster Patient"-Klick. Fall-Zähler ist kumulativ
    // und persistent (localStorage, disziplin-übergreifend), damit die Schwellen
    // sitzungsübergreifend stimmen. Exakte Gleichheit = automatisch je 3× gedeckelt.
    //  - Launch-Nudge (nicht-blockierend): 15 / 35 / 55, nie wenn schon eingetragen.
    //  - Studenten-Survey (blockierendes Modal): 25 / 50 / 75.
    if (!reviewSession) {
      try {
        const n = Number(localStorage.getItem("medcase:casesDone") ?? "0") + 1;
        localStorage.setItem("medcase:casesDone", String(n));
        if (n === 25 || n === 50 || n === 75) {
          setPostFeedback("student");
          return; // nächster Fall startet erst nach dem Schließen der Survey
        }
        if (
          (n === 15 || n === 35 || n === 55) &&
          !localStorage.getItem("medcase:waitlistJoined")
        ) {
          setShowIntent(true); // nicht-blockierend: weiterspielen wird nicht gestoppt
        }
      } catch {}
    }
    setPostFeedback(null);
    startCase(difficulty);
  }

  function goHome() {
    setPhase("start");
  }

  return (
    <div className={`min-h-screen px-4 pt-5 md:px-10 ${phase === "playing" || phase === "result" ? "" : "pb-8"}`}>
      <div className="mx-auto max-w-[1560px]">
        {reviewSession && (
          <ReviewModeBar
            session={reviewSession}
            onFeedback={() => setShowSessionFeedback(true)}
            onEnd={() => {
              endReviewMode();
              setReviewSession(null);
            }}
          />
        )}
        {reviewSession && showSessionFeedback && (
          <SessionFeedbackModal
            session={reviewSession}
            onClose={() => setShowSessionFeedback(false)}
          />
        )}
        {postFeedback && activeCase && (
          <PostCaseFeedback
            kind={postFeedback}
            caseData={activeCase}
            session={reviewSession}
            onClose={() => {
              const wasStudent = postFeedback === "student";
              setPostFeedback(null);
              // Studenten-Survey wird nach dem "Nächster Patient"-Klick gezeigt;
              // beim Schließen soll der nächste Fall starten.
              if (wasStudent) startCase(difficulty);
            }}
          />
        )}
        {showIntent && (
          <LaunchIntentPrompt
            placement={phase === "start" ? "corner" : "top"}
            onClose={() => setShowIntent(false)}
          />
        )}
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
          />
        )}
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

// Niveau-Karte für das Auswahl-Modal. Spalten-tauglich (h-full, vertikaler
// Aufbau), damit drei Karten nebeneinander gleich hoch stehen. Ausgewählt =
// weiche Akzent-Tönung + Rahmen + Häkchen (nicht vollflächig blau — ein
// vorausgewählter Default soll nicht wie die einzige Option wirken).
function BereichCard({
  id,
  icon,
  title,
  description,
  selected,
  preselected,
  onSelect,
}: {
  id: Difficulty;
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  preselected: boolean;
  onSelect: (id: Difficulty) => void;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={`relative flex h-full min-h-[124px] w-full flex-col rounded-xl border-[1.5px] px-4 py-4 text-left transition-colors ${
        selected
          ? "border-accent bg-accent/[0.07]"
          : "border-card-border/20 hover:border-accent"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <i className={`${icon} text-2xl ${selected ? "text-accent" : "text-muted"}`} />
        {preselected ? (
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
            Vorausgewählt
          </span>
        ) : selected ? (
          <i className="ti ti-check text-lg text-accent" />
        ) : null}
      </div>
      <span className={`font-bold ${selected ? "text-accent" : ""}`}>{title}</span>
      <p className={`mt-0.5 text-[12.5px] leading-snug ${selected ? "text-accent/80" : "text-muted"}`}>
        {description}
      </p>
    </button>
  );
}

// Zuletzt gewählte Kombination (Niveau + Fach) lokal merken, damit ein
// Wiederkehrer nicht jedes Mal neu wählen muss. Rein clientseitig, kein
// Account. Validiert beim Laden (gesperrte/unbekannte Werte → Default).
const LAST_CHOICE_KEY = "medcase:lastChoice";

function loadLastChoice(): { difficulty: Difficulty; discipline: Discipline } {
  const fallback = { difficulty: "klinik" as Difficulty, discipline: "zufaellig" as Discipline };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LAST_CHOICE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { difficulty?: string; discipline?: string };
    const difficulty = (["vorklinik", "klinik", "examen"] as Difficulty[]).includes(
      p.difficulty as Difficulty
    )
      ? (p.difficulty as Difficulty)
      : fallback.difficulty;
    const discOk = DISCIPLINES.some((d) => d.id === p.discipline && !d.locked);
    const discipline = discOk ? (p.discipline as Discipline) : fallback.discipline;
    return { difficulty, discipline };
  } catch {
    return fallback;
  }
}

function saveLastChoice(difficulty: Difficulty, discipline: Discipline) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CHOICE_KEY, JSON.stringify({ difficulty, discipline }));
  } catch {
    // localStorage nicht verfügbar (Privatmodus o.ä.) — kein Fehler nach außen.
  }
}

function DifficultyModal({
  onSelect,
  onClose,
}: {
  onSelect: (d: Difficulty, disc: Discipline) => void;
  onClose: () => void;
}) {
  // Vorauswahl aus dem letzten Besuch (sonst Klinik/Zufällig).
  const [highlighted, setHighlighted] = useState<Difficulty>(() => loadLastChoice().difficulty);
  const [discipline, setDiscipline] = useState<Discipline>(() => loadLastChoice().discipline);
  // Fach-Auswahl standardmäßig eingeklappt — Erstkontakt = eine Entscheidung.
  const [showDisciplines, setShowDisciplines] = useState(false);
  // "Vorausgewählt"-Hinweis nur bis zur ersten bewussten Interaktion zeigen.
  const [touched, setTouched] = useState(false);

  function pickDifficulty(id: Difficulty) {
    setHighlighted(id);
    setTouched(true);
  }

  const disciplineLabel = DISCIPLINES.find((d) => d.id === discipline)?.label ?? "Zufällig";

  function start() {
    saveLastChoice(highlighted, discipline);
    onSelect(highlighted, discipline);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[20px] border-[1.5px] bg-card sm:max-w-2xl sm:rounded-xl"
        style={{ borderColor: "#d8d6cd" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="shrink-0 px-6 pb-4 pt-6">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
            {"LOS GEHT'S"}
          </span>
          <h2 className="mb-1 text-xl font-extrabold">Niveau wählen</h2>
          <p className="text-sm text-muted">
            Wähle die Schwierigkeit für deinen ersten Fall.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {/* Drei Niveaus nebeneinander (Vergleich auf einen Blick), auf
              Mobile gestapelt. */}
          <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-3">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((id) => (
              <BereichCard
                key={id}
                id={id}
                icon={`ti ${DIFFICULTY_ICONS[id]}`}
                title={DIFFICULTY_INFO[id].label}
                description={DIFFICULTY_INFO[id].description}
                selected={highlighted === id}
                preselected={highlighted === id && !touched}
                onSelect={pickDifficulty}
              />
            ))}
          </div>

          {/* Fach nur bei Klinik: standardmäßig eingeklappte Zeile (Default
              "Zufällig"), auf Wunsch aufklappbar — volle Breite unter den
              Karten, damit die Spalten gleich hoch bleiben. */}
          {highlighted === "klinik" && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowDisciplines((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border-[1.5px] border-card-border/20 px-4 py-2.5 text-left transition-colors hover:border-accent"
              >
                <span className="text-sm text-muted">
                  Klinik-Fach:{" "}
                  <span className="font-semibold text-foreground">{disciplineLabel}</span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                  eingrenzen
                  <i
                    className={`ti ti-chevron-down transition-transform ${
                      showDisciplines ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {showDisciplines && (
                <div className="mt-2">
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
          )}
        </div>

        {/* Sticky footer — Button immer aktiv (es ist stets ein Niveau
            gewählt); dezente Animation beim Hover/Klick. */}
        <div
          className="shrink-0 px-6 pb-6 pt-3"
          style={{ borderTop: "1.5px solid #d8d6cd" }}
        >
          <button
            onClick={start}
            className="group w-full rounded-xl bg-accent py-3.5 font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
          >
            Fall starten{" "}
            <span className="inline-block transition-transform duration-200 ease-out group-hover:translate-x-1.5">
              →
            </span>
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
          typischen Befundkombinationen selten im Kopf. Casolvo trainiert
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

// Evidenz-Block: belegt mit Primärquellen, dass das Defizit, das Casolvo
// trainiert, in der Ausbildungsforschung dokumentiert ist. Nur verifizierte
// Aussagen (direkt an der GMS-Originalquelle geprüft) — konsistent mit dem
// Quellen-USP der Seite. Dient doppelt: Social-Proof-Ersatz für Besucher
// heute, Argumentationsgrundlage für Skills-Lab-/Dozenten-Gespräche später.
function EvidenceCard() {
  return (
    <div id="konzept" className="card mt-3 scroll-mt-24 p-5">
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
        diese Lücke trainiert Casolvo: Befunde bewusst anfordern, statt alles
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

// „heute" / „gestern" / „vor N Tagen" — bewusst kein Streak, nur Kontext.
function relativeDays(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "zuletzt heute";
  if (days === 1) return "zuletzt gestern";
  return `zuletzt vor ${days} Tagen`;
}

function StartScreen({
  onStart,
}: {
  onStart: (d: Difficulty, disc: Discipline) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  // Der Hinweis läuft jetzt über einen nicht-blockierenden Banner (Layout),
  // deshalb öffnet der CTA direkt die Auswahl — kein Interrupt beim Start.
  function openPicker() {
    setShowPicker(true);
  }

  // Niveau direkt im Hero wählbar — kein Zwischen-Dialog vor dem ersten Fall.
  // Vorauswahl aus dem letzten Besuch wird erst nach dem Mount gelesen
  // (localStorage), damit Server- und Client-Markup identisch bleiben.
  const [level, setLevel] = useState<Difficulty>("klinik");
  const [disc, setDisc] = useState<Discipline>("zufaellig");
  // Wiederkehrer: nur lokaler Zustand (gelöste Fälle aus lib/stats), keine ID,
  // nichts wird gesendet. Erstbesucher sehen exakt denselben Hero — es ändern
  // sich nur Kopfzeile, Button-Verb und eine Kontextzeile im Start-Panel.
  const [returning, setReturning] = useState<{ played: number; solved: number; lastAt: number } | null>(null);
  useEffect(() => {
    const last = loadLastChoice();
    setLevel(last.difficulty);
    setDisc(last.discipline);
    const results = readCaseResults();
    if (results.length > 0) {
      setReturning({
        played: results.length,
        solved: results.filter((r) => r.correct).length,
        lastAt: Math.max(...results.map((r) => r.timestamp)),
      });
    }
  }, []);

  function startNow() {
    const chosen: Discipline = level === "klinik" ? disc : "zufaellig";
    saveLastChoice(level, chosen);
    onStart(level, chosen);
  }

  return (
    <div className="relative flex flex-col pb-4">
      <CenteredNav active="home" />

      {/* Hero füllt die erste Bildschirmhöhe (dvh: mobile Browserleisten
          eingerechnet); zwei gleich schwere Objekte — Start-Panel links,
          Produktbild rechts — auf einer gemeinsamen Grundlinie. */}
      <div className="flex min-h-[calc(100dvh-140px)] flex-col">
        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-6 md:grid-cols-[0.95fr_1.05fr] md:gap-12 md:py-8">
          <div>
            <h1
              className="text-[38px] font-extrabold leading-[1.04] tracking-tight md:text-[46px]"
              style={{ color: "#1b3a5c" }}
            >
              Klinische Fälle üben.
            </h1>
            <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-muted">
              <span className="font-semibold text-foreground">Nicht kreuzen, sondern entscheiden:</span>{" "}
              Du forderst nur die Befunde an, die du wirklich brauchst — jeder
              kostet Punkte — und stellst dann die Diagnose.
            </p>

            {/* Start-Panel: Niveau → Fach (nur Klinik) → Start. Feste Zeilenhöhe
                für die Fach-Zeile, damit der Wechsel des Niveaus nichts springen lässt. */}
            <div className="card mt-6 overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-card-border/10 px-5 py-3">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  {returning ? "Weiter üben" : "Fall starten"}
                </span>
                <span className="text-[11.5px] text-muted">
                  {returning
                    ? `${returning.solved} von ${returning.played} ${returning.played === 1 ? "Fall" : "Fällen"} gelöst · ${relativeDays(returning.lastAt)}`
                    : "Kostenlos · ohne Account"}
                </span>
              </div>

              <div className="px-5 pb-5 pt-4">
                <div
                  className="flex w-full rounded-xl border-[1.5px] border-card-border/15 bg-background p-1"
                  role="radiogroup"
                  aria-label="Niveau wählen"
                >
                  {(["vorklinik", "klinik", "examen"] as Difficulty[]).map((id) => {
                    const on = level === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setLevel(id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 py-2 text-[13.5px] font-bold transition-colors ${
                          on ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                        }`}
                      >
                        <i className={`ti ${DIFFICULTY_ICONS[id]} text-[15px]`} />
                        {DIFFICULTY_INFO[id].label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 flex items-baseline justify-between gap-3 text-[12.5px] text-muted" aria-live="polite">
                  <span>{DIFFICULTY_INFO[level].description}</span>
                  <span className="shrink-0 text-[11px] text-muted/80">wird auf diesem Gerät gemerkt</span>
                </p>

                {/* Fach-Zeile: bei Klinik wählbar, sonst fächerübergreifend — gleiche Höhe */}
                <div className="mt-4 flex min-h-[34px] flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Fach
                  </span>
                  {level === "klinik" ? (
                    DISCIPLINES.filter((d) => !d.locked).map((d) => {
                      const on = disc === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setDisc(d.id)}
                          className={`rounded-full border-[1.5px] px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                            on
                              ? "border-accent bg-accent/[0.08] text-accent"
                              : "border-card-border/15 bg-card text-muted hover:border-accent/40 hover:text-foreground"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-[12.5px] text-muted">Fächerübergreifend</span>
                  )}
                </div>

                <button
                  onClick={startNow}
                  className="mt-4 w-full rounded-[12px] bg-accent px-6 py-3.5 text-[16px] font-bold text-accent-foreground shadow-[0_12px_24px_-12px_rgba(23,94,143,0.6)] transition-transform duration-[80ms] active:scale-[0.98]"
                >
                  {returning ? (
                    <>
                      Nächster Fall →{" "}
                      <span className="font-semibold opacity-80">
                        {DIFFICULTY_INFO[level].label}
                        {level === "klinik" && disc !== "zufaellig"
                          ? ` · ${DISCIPLINES.find((d) => d.id === disc)?.label ?? ""}`
                          : ""}
                      </span>
                    </>
                  ) : (
                    "Jetzt ausprobieren →"
                  )}
                </button>
              </div>

              {/* So läuft ein Fall — dieselben drei Schritte, dieselben Farben wie in der App */}
              <div className="border-t border-card-border/10 bg-background/60 px-5 py-3.5">
                <div className="grid gap-2 text-[13px]">
                  <div className="flex items-center gap-2.5"><StepDot tone="s1" small>1</StepDot><span className="font-semibold">Anamnese lesen</span><span className="clinical-data ml-auto text-xs font-bold text-[var(--step-1)]">inkl.</span></div>
                  <div className="flex items-center gap-2.5"><StepDot tone="s2" small>2</StepDot><span className="font-semibold">Befunde anfordern</span><span className="text-muted">— nur, was du brauchst</span><span className="clinical-data ml-auto text-xs font-bold text-[var(--step-2)]">je −10</span></div>
                  <div className="flex items-center gap-2.5"><StepDot tone="s3" small>3</StepDot><span className="font-semibold">Diagnose stellen</span><span className="text-muted">— mit Begründung</span></div>
                </div>
              </div>
            </div>
          </div>

          <HeroDemo />
        </div>

        {/* Ruhiger Hinweis auf die Methodik — text-muted (5,6:1) statt /70 (AA-Fail) */}
        <button
          type="button"
          onClick={() => document.getElementById("konzept")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="group mx-auto mb-2 flex flex-col items-center gap-0.5 text-xs font-semibold text-muted transition-colors hover:text-accent"
        >
          Mehr über unsere Methodik
          <i className="ti ti-chevron-down text-lg" />
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
        <FadeInUp>
          <HomeWaitlistCard />
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
              onClick={openPicker}
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
          <span>© 2026 Casolvo</span>
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
      const file = new File([blob], "casolvo-ergebnis.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mein Casolvo-Ergebnis" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "casolvo-ergebnis.png";
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
      className="relative rounded-[14px] border-[1.5px] flex flex-col"
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
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#c0362c]/40 bg-[#fdecea] px-2.5 py-1 text-[11px] font-semibold text-[#a5231a]">
                  <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-[#c0362c] text-white">
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

          {/* Feedback läuft jetzt über ein Overlay NACH dem Fall (PostCaseFeedback),
              nicht mehr eingebettet — verdeckte sonst die aufklappende Karte. */}

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

// ---------------------------------------------------------------------------
// Hero-Demo: der Fall spielt sich beim Laden einmal selbst ab (Patient →
// Anamnese → Befunde anfordern → aufgedeckt → Diagnose) und bleibt dann als
// Endbild stehen. ↻ spielt erneut. Bei prefers-reduced-motion sofort Endbild.
// ---------------------------------------------------------------------------
// Hero-Beispiel: ein abgeschlossener Fall als Akte, statisch. Drei Zeilen
// genügen, um die Mechanik zu zeigen: Anamnese ist inklusive, ein Befund
// wurde angefordert und kostet, einer bewusst nicht — und die Diagnose stimmt
// trotzdem. Bewusst ohne Animation: das Bild soll in Sekunden lesbar sein,
// nicht erst nach einem Ablauf.
function HeroDemo() {
  return (
    <div
      className="card flex min-h-[360px] flex-col px-6 py-5 shadow-[0_30px_60px_-40px_rgba(23,94,143,0.5)] sm:px-7"
      aria-label="Beispiel: ein gelöster Fall mit zwei angeforderten Befunden"
    >
      {/* Patient + Ergebnispunkte */}
      <div className="flex items-start gap-3">
        <div className="avatar-circle h-11 w-11 shrink-0 text-sm" style={{ backgroundColor: "#ffab73" }}>T</div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">
            Thomas, 38 Jahre <span className="font-normal text-muted">· männlich</span>
          </p>
          <p className="mt-0.5 text-[13px] italic leading-snug text-muted">
            „Ich huste seit einer Woche wie ein Kettenraucher – dabei rauche ich gar nicht.“
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">Punkte</p>
          <p className="clinical-data text-[22px] font-extrabold leading-none text-accent">90</p>
        </div>
      </div>

      {/* Drei Entscheidungen — inklusive / angefordert / bewusst ausgelassen */}
      <ol className="relative mt-6 flex flex-1 flex-col gap-5 border-l-[1.5px] border-card-border/15 pl-5">
        <TimelineRow tone="s1" title="Anamnese" right="inkl." rightTone="s1">
          Seit 7 Tagen Husten, initial Fieber bis 38,2 °C, seither afebril. Weißlicher Auswurf, keine Dyspnoe. Nichtraucher.
        </TimelineRow>
        <TimelineRow tone="s2" title="Labor angefordert" right="−10" rightTone="s2">
          <span className="clinical-data">
            CRP <b className="text-[#b91c1c]">0,8 ↑</b> <span className="text-muted">(&lt; 0,5 mg/dl)</span> · Leukozyten 7,2 · PCT &lt; 0,1
          </span>
        </TimelineRow>
        <TimelineRow tone="skip" title="Bildgebung nicht angefordert" right="gespart" rightTone="muted">
          Kein Hinweis auf Pneumonie — ein Röntgen-Thorax hätte hier nichts geändert.
        </TimelineRow>
      </ol>

      {/* Ergebnis */}
      <div className="mt-6 flex items-center justify-between border-t-[1.5px] border-card-border/10 pt-3.5 text-[13px]">
        <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--correct)" }}>
          <i className="ti ti-check" />
          Richtig — mit einem Befund
        </span>
        <span className="clinical-data text-[15px] font-extrabold" style={{ color: "var(--correct)" }}>
          90 / 100
        </span>
      </div>
    </div>
  );
}

function TimelineRow({
  tone,
  title,
  right,
  rightTone,
  children,
}: {
  tone: "s1" | "s2" | "s3" | "skip";
  title: string;
  right?: string;
  rightTone?: "s1" | "s2" | "muted";
  children: React.ReactNode;
}) {
  const dot =
    tone === "skip"
      ? "border-[1.5px] border-dashed border-card-border/30 bg-card"
      : tone === "s1"
      ? "bg-[var(--step-1)]"
      : tone === "s2"
      ? "bg-[var(--step-2)]"
      : "bg-[var(--step-3)]";
  const rightColor =
    rightTone === "s1" ? "text-[var(--step-1)]" : rightTone === "s2" ? "text-[var(--step-2)]" : "text-muted";
  return (
    <li className="relative">
      <span className={`absolute -left-[26px] top-[5px] h-3 w-3 rounded-full ${dot}`} aria-hidden="true" />
      <div className="flex items-baseline gap-3">
        <p className={`text-[13.5px] font-bold ${tone === "skip" ? "text-muted" : "text-foreground"}`}>{title}</p>
        {right && <span className={`clinical-data ml-auto text-xs font-bold ${rightColor}`}>{right}</span>}
      </div>
      <div className={`mt-1 text-[12.5px] leading-snug ${tone === "skip" ? "text-muted/80" : "text-foreground/80"}`}>{children}</div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Schritt-Marker: eine Farbe pro Schritt, überall identisch.
// s1 Anamnese = Blau (inklusive) · s2 Befunde = Amber (kostet) · s3 Diagnose = Grün
// ---------------------------------------------------------------------------
function StepDot({
  tone,
  small,
  idle,
  children,
}: {
  tone: "s1" | "s2" | "s3";
  small?: boolean;
  idle?: boolean;
  children: React.ReactNode;
}) {
  const size = small ? "h-4 w-4 text-[9px]" : "h-[22px] w-[22px] text-[11px]";
  const bg = idle
    ? "border-[1.5px] border-card-border/25 text-muted"
    : tone === "s1"
    ? "bg-[var(--step-1)] text-white"
    : tone === "s2"
    ? "bg-[var(--step-2)] text-white"
    : "bg-[var(--step-3)] text-white";
  return (
    <span className={`clinical-data inline-flex shrink-0 items-center justify-center rounded-full font-bold ${size} ${bg}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Spielscreen „Akte“: Header = Statusleiste (Kontext · Schritte · Punkte),
// links Patient + Anforderungsliste/Punkterechnung (eine Karte), rechts die
// Befunde in fester klinischer Reihenfolge, unten die Diagnose. Normaler
// Seitenscroll, keine innere Scrollfläche, keine schwebende Insel.
// ---------------------------------------------------------------------------
type FindingKey = "examination" | "imaging" | "labs";

function LabTable({ labs }: { labs: LabCategory[] }) {
  return (
    <div className="flex flex-col gap-4">
      {labs.map((cat) => (
        <div key={cat.category}>
          <p className="mb-1.5 text-[13px] font-bold">{cat.category}</p>
          <table className="clinical-data w-full text-[13px]">
            <thead>
              <tr className="border-b border-card-border/15 text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                <th className="pb-1 pr-4 font-bold">Parameter</th>
                <th className="pb-1 pr-4 font-bold">Wert</th>
                <th className="pb-1 pr-4 font-bold">Einheit</th>
                <th className="pb-1 font-bold">Referenz</th>
              </tr>
            </thead>
            <tbody>
              {(cat.values ?? []).map((v) => (
                <tr key={v.name} className="border-b border-card-border/[0.07] last:border-0">
                  <td className="py-1.5 pr-4 font-sans font-medium">{v.name}</td>
                  <td
                    className={`whitespace-nowrap py-1.5 pr-4 font-semibold ${
                      v.flag === "high" ? "text-[#b91c1c]" : v.flag === "low" ? "text-[#1d4ed8]" : ""
                    }`}
                  >
                    {v.value}
                    {v.flag === "high" && <span className="ml-1 font-extrabold">↑</span>}
                    {v.flag === "low" && <span className="ml-1 font-extrabold">↓</span>}
                  </td>
                  <td className="py-1.5 pr-4 text-muted">{v.unit}</td>
                  <td className="py-1.5 text-muted">{v.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function AkteSection({
  tone,
  number,
  title,
  state,
  cost,
  onRequest,
  children,
}: {
  tone: "s1" | "s2";
  number: string;
  title: string;
  state: "open" | "locked" | "unavailable";
  cost: "inkl" | "charged" | "free";
  onRequest?: () => void;
  children?: React.ReactNode;
}) {
  const open = state === "open";
  const clickable = state === "locked" && !!onRequest;
  const paid = cost !== "free";

  // Kopfzeile: identischer Aufbau in allen Zustaenden. Im anforderbaren
  // Zustand ist die GANZE Zeile das Klickziel (Fitts) — der Preis rechts ist
  // nur noch Text, kein separater Button mehr.
  const head = (
    <>
      {clickable ? (
        <span
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] transition-colors ${
            paid
              ? "border-[var(--step-2)] text-[var(--step-2)] group-hover:bg-[var(--step-2)] group-hover:text-white"
              : "border-card-border/30 text-muted group-hover:border-accent group-hover:text-accent"
          }`}
          aria-hidden="true"
        >
          <i className="ti ti-plus" />
        </span>
      ) : (
        <StepDot tone={tone} idle={!open}>
          {number}
        </StepDot>
      )}
      <span className={clickable ? "transition-colors group-hover:text-foreground" : undefined}>
        {title}
        {clickable && <span className="font-semibold text-muted"> anfordern</span>}
      </span>
      <span className="ml-auto flex items-center">
        {open && cost === "inkl" && <span className="clinical-data text-xs font-bold text-[var(--step-1)]">inkl.</span>}
        {open && cost === "charged" && <span className="clinical-data text-xs font-bold text-[var(--step-2)]">−10</span>}
        {open && cost === "free" && <span className="text-xs font-medium text-muted">nachträglich eingesehen</span>}
        {state === "unavailable" && (
          <span className="text-xs font-medium text-muted/70">für diesen Fall nicht verfügbar</span>
        )}
        {clickable && (
          <span
            className={`clinical-data text-xs font-bold ${
              paid ? "text-[var(--step-2)]" : "text-muted"
            }`}
          >
            {paid ? "−10" : "kostenlos"}
          </span>
        )}
      </span>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onRequest}
        className={`group flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-4 py-[11px] text-left text-[13.5px] font-bold text-muted transition-colors ${
          paid
            ? "border-card-border/25 hover:border-[var(--step-2)] hover:bg-[var(--step-2-tint)]"
            : "border-card-border/25 hover:border-accent hover:bg-accent/[0.05]"
        }`}
      >
        {head}
      </button>
    );
  }

  return (
    <section
      className={`overflow-hidden rounded-[14px] border-[1.5px] ${
        open ? "border-card-border/12 bg-card" : "border-dashed border-card-border/20 bg-transparent"
      } ${state === "unavailable" ? "opacity-55" : ""}`}
    >
      <div
        className={`flex items-center gap-2.5 px-4 py-[11px] text-[13.5px] font-bold ${
          open ? "border-b-[1.5px] border-card-border/10" : "text-muted"
        }`}
      >
        {head}
      </div>
      {open && (
        <div className="whitespace-pre-line px-4 py-4 text-[14px] leading-relaxed text-foreground/90 md:pl-12">
          {children}
        </div>
      )}
    </section>
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
}) {
  const difficultyLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const disciplineLabel = DISCIPLINES.find((d) => d.id === discipline)?.label ?? "Zufällig";
  const color = avatarColorForCase(caseData.id);
  const isResult = phase === "result";
  const revealCount = Object.values(revealed).filter(Boolean).length;
  const paidCount = [revealed.examination, revealed.imaging, revealed.labs].filter(Boolean).length;
  const possiblePoints = Math.max(BASE_SCORE - paidCount * INVESTIGATION_COST, MIN_SCORE);
  const imagingAvailable = hasImaging(caseData);

  const [pending, setPending] = useState<string | null>(null);
  // Vorstellung: Der Patient stellt sich zuerst nur mit seiner Beschwerde vor.
  // Erst danach öffnet sich die Akte — so beginnt jeder Fall wie am Bett mit
  // dem Leitsymptom statt mit zwei Textblöcken gleichzeitig.
  const [intro, setIntro] = useState(true);
  // Diagnose-Insel: auf schmalen Screens eingeklappt (sonst frisst sie die
  // halbe Höhe), auf dem Desktop offen.
  const [diagOpen, setDiagOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPending(null);
    setMenuOpen(false);
    setIntro(true);
    setDiagOpen(window.innerWidth >= 768);
    window.scrollTo({ top: 0 });
  }, [caseData.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function reveal(key: FindingKey) {
    setRevealed((r) => ({ ...r, [key]: true }));
  }

  // Kosten-Logik für eine Befundzeile: vor dem Abgeben kostet jeder Befund,
  // danach ist Einsehen kostenlos — berechnet wurde nur, was bei Abgabe offen war.
  function costOf(key: FindingKey): "charged" | "free" {
    if (isResult) return revealedAtSubmit[key] ? "charged" : "free";
    return "charged";
  }
  function stateOf(key: FindingKey): "open" | "locked" | "unavailable" {
    if (key === "imaging" && !imagingAvailable) return "unavailable";
    return revealed[key] ? "open" : "locked";
  }

  const step2Done = isResult || paidCount > 0;
  const step3Now = !isResult && pending !== null;

  const rows: { key: FindingKey; label: string }[] = [
    { key: "examination", label: "Untersuchung" },
    { key: "imaging", label: "Bildgebung" },
    { key: "labs", label: "Labor" },
  ];

  return (
    <div>
      {/* Header = Statusleiste */}
      <header className="sticky top-0 z-30 -mx-4 -mt-5 border-b-[1.5px] border-card-border/10 bg-card/95 px-4 backdrop-blur-md md:-mx-10 md:px-10">
        <div className="mx-auto grid h-14 max-w-[1560px] grid-cols-[auto_1fr_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3">
            <button onClick={onGoHome} className="flex items-center transition-opacity hover:opacity-80" aria-label="Zur Startseite">
              <Logo size={28} />
            </button>
            <span className="hidden text-xs text-muted md:inline">
              <span className="font-semibold text-foreground">{difficultyLabel}</span> · {disciplineLabel}
            </span>
          </div>

          <div className="flex items-center justify-center">
            <HeaderStep tone="s1" label="Anamnese" state={intro ? "now" : "done"} />
            <span className={`mx-1.5 h-px w-4 md:mx-3 md:w-10 ${intro ? "bg-card-border/15" : "bg-[var(--step-1)]"}`} />
            <HeaderStep tone="s2" label="Befunde" state={intro ? "idle" : step2Done ? "done" : "now"} />
            <span className={`mx-1.5 h-px w-4 md:mx-3 md:w-10 ${isResult ? "bg-[var(--step-3)]" : "bg-card-border/15"}`} />
            <HeaderStep tone="s3" label="Diagnose" state={isResult ? "done" : step3Now ? "now" : "idle"} />
          </div>

          <div className="flex items-center justify-end gap-3 md:gap-4">
            {/* Punktestand des laufenden Falls steht in der Seitenleiste —
                hier oben nur die Tagesbilanz, dafür deutlich sichtbar. */}
            <div className="flex items-stretch gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-[var(--correct-tint)] px-3 py-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">Richtig</span>
                <span className="clinical-data text-[17px] font-extrabold leading-none" style={{ color: "var(--correct)" }}>
                  {solved}
                  <span className="text-[13px] font-bold text-muted">/{played}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-accent/[0.09] px-3 py-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">Punkte</span>
                <span className="clinical-data text-[17px] font-extrabold leading-none text-accent">{score}</span>
              </div>
            </div>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[1.5px] border-card-border/15 text-muted transition-colors hover:border-accent hover:text-accent"
                aria-label="Menü"
                aria-expanded={menuOpen}
              >
                <i className="ti ti-dots text-base" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 z-40 w-56 overflow-hidden rounded-xl border-[1.5px] border-card-border/15 bg-card py-1.5 shadow-[0_16px_40px_-16px_rgba(15,15,15,0.3)]">
                  <button onClick={onGoHome} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold text-foreground hover:bg-accent/[0.06]">
                    <i className="ti ti-home text-muted" /> Startseite
                  </button>
                  <Link href="/statistik" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-accent/[0.06]">
                    <i className="ti ti-chart-bar text-muted" /> Statistik
                  </Link>
                  <Link href="/ueber-uns" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-accent/[0.06]">
                    <i className="ti ti-info-circle text-muted" /> Über uns
                  </Link>
                  <Link href="/qa" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-accent/[0.06]">
                    <i className="ti ti-help-circle text-muted" /> Q&amp;A
                  </Link>
                  <p className="border-t border-card-border/10 px-3.5 pb-1 pt-2 text-[11px] leading-snug text-muted/70">
                    Fiktiver Übungsfall – kein ärztlicher Rat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {intro && (
        <div
          key={`intro-${caseData.id}`}
          className="case-head-enter mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-[620px] flex-col justify-center py-8"
        >
          <div className="card overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-card-border/10 px-5 py-3">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                Aufnahme
              </span>
              <span className="text-[11.5px] text-muted">{difficultyLabel}</span>
            </div>

            <div className="px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
              <div className="flex items-center gap-3.5">
                <div className="avatar-circle h-12 w-12 shrink-0 text-base" style={{ backgroundColor: color }}>
                  {initials(caseData.patientName)}
                </div>
                <div>
                  <p className="text-[17px] font-bold leading-tight">
                    {caseData.patientName},{" "}
                    {caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`}
                  </p>
                  <p className="text-[13.5px] text-muted">
                    {caseData.gender === "male" ? "männlich" : "weiblich"}
                  </p>
                </div>
              </div>

              <p className="mt-6 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                Vorstellungsgrund
              </p>
              <blockquote className="mt-2 border-l-2 border-[var(--step-1)] pl-4 text-[19px] font-medium italic leading-[1.5] text-foreground sm:text-[21px]">
                „{caseData.chiefComplaint}“
              </blockquote>
            </div>

            <div className="border-t border-card-border/10 bg-[var(--step-1-tint)]/40 px-5 py-4 sm:px-7">
              <button
                onClick={() => setIntro(false)}
                className="w-full rounded-[12px] bg-accent px-7 py-3.5 text-[15px] font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
              >
                Anamnese erheben →
              </button>
              <p className="mt-2.5 text-center text-xs text-muted">
                Kostenlos — danach entscheidest du, welche Befunde du anforderst.
                Jeder kostet <span className="clinical-data font-bold text-[var(--step-2)]">−10</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {!intro && (
      <div className="grid gap-4 pb-8 pt-5 md:grid-cols-[300px_1fr] md:gap-5 md:pb-5">
        {/* Eine Karte: Patient · Befunde · Punkte · Melden — kein Leerraum dazwischen */}
        <aside className="md:sticky md:top-[72px] md:self-start">
          <div key={`pat-${caseData.id}`} className="card">
            <div className="flex items-center gap-3 px-4 pt-4">
              <div className="avatar-circle h-10 w-10 shrink-0 text-sm" style={{ backgroundColor: color }}>
                {initials(caseData.patientName)}
              </div>
              <h2 className="text-[15px] font-bold leading-tight">
                {caseData.patientName}, {caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`}
                <span className="block text-sm font-normal text-muted">
                  {caseData.gender === "male" ? "männlich" : "weiblich"}
                </span>
              </h2>
            </div>
            <blockquote className="mx-4 mt-3 border-l-[1.5px] border-[var(--step-1)] pl-2.5 text-[13.5px] italic leading-snug text-foreground/85">
              „{caseData.chiefComplaint}“
            </blockquote>

            <div className="mt-4 border-t border-card-border/10 px-4 pb-4 pt-3">
              {/* Anamnese ist keine Aktion — nur eine Zeile, kein Button */}
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  Befunde
                </span>
                <span className="text-[11.5px] text-muted">
                  Anamnese <span className="clinical-data font-bold text-[var(--step-1)]">inkl.</span>
                </span>
              </div>
              {rows.map((row) => {
                const st = stateOf(row.key);
                const cost = costOf(row.key);
                const charged = st === "open" && cost === "charged";
                return (
                  <div
                    key={row.key}
                    className={`flex items-center gap-2.5 border-b border-card-border/[0.07] py-2 text-[13.5px] font-semibold last:border-0 ${
                      st === "unavailable" ? "text-muted/60" : ""
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                        charged ? "bg-[var(--step-2)]" : st === "open" ? "bg-card-border/30" : "border-[1.5px] border-card-border/25"
                      }`}
                    >
                      {st === "open" && <i className="ti ti-check" />}
                    </span>
                    {row.label}
                    <span className="ml-auto flex items-center">
                      {st === "unavailable" && <span className="text-xs font-medium text-muted/60">nicht verfügbar</span>}
                      {charged && <span className="clinical-data text-xs font-bold text-[var(--step-2)]">−10</span>}
                      {st === "open" && !charged && <span className="text-xs font-medium text-muted">angefordert</span>}
                      {st === "locked" && (
                        // Reine Statusanzeige - angefordert wird in der Akte,
                        // damit es nicht zwei Buttons fuer dieselbe Aktion gibt.
                        <span className="text-xs font-medium text-muted/70">noch nicht angefordert</span>
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="mt-2 flex items-baseline justify-between border-t-[1.5px] border-card-border/10 pt-3">
                <span className="text-[11.5px] text-muted">{isResult ? "Erhalten" : "Punkte möglich"}</span>
                <span
                  className="clinical-data text-[26px] font-extrabold leading-none"
                  style={{ color: isResult ? (lastResultCorrect ? "var(--correct)" : "var(--wrong)") : "var(--accent)" }}
                >
                  {isResult ? lastScoreEarned : possiblePoints}
                </span>
              </div>
              <ReportCaseCard caseId={caseData.id} difficulty={difficulty} embedded />
            </div>
          </div>
        </aside>

        {/* Akte */}
        <main
          key={`akte-${caseData.id}`}
          className="flex flex-col gap-3 md:min-h-[calc(100dvh-6rem)]"
        >
          <AkteSection tone="s1" number="1" title="Anamnese" state="open" cost="inkl">
            {caseData.history}
          </AkteSection>
          <AkteSection
            tone="s2"
            number="2"
            title="Körperliche Untersuchung"
            state={stateOf("examination")}
            cost={costOf("examination")}
            onRequest={() => reveal("examination")}
          >
            {caseData.examination}
          </AkteSection>
          <AkteSection
            tone="s2"
            number="2"
            title="Bildgebung"
            state={stateOf("imaging")}
            cost={costOf("imaging")}
            onRequest={() => reveal("imaging")}
          >
            {caseData.imaging}
          </AkteSection>
          <AkteSection
            tone="s2"
            number="2"
            title="Labor"
            state={stateOf("labs")}
            cost={costOf("labs")}
            onRequest={() => reveal("labs")}
          >
            <LabTable labs={caseData.labs} />
          </AkteSection>

          {!isResult && (
            <section className="sticky bottom-5 z-20 mt-auto rounded-[14px] border-[1.5px] border-card-border/15 bg-card p-3.5 shadow-[0_-10px_30px_-16px_rgba(15,15,15,0.3)] md:p-4">
              <button
                type="button"
                onClick={() => {
                  // Einklappen nur auf schmalen Screens — auf dem Desktop bleibt
                  // die Insel offen, dort kostet sie kaum Höhe.
                  if (window.innerWidth < 768) setDiagOpen((v) => !v);
                }}
                aria-expanded={diagOpen}
                className="flex w-full items-center gap-2.5 text-left text-[13.5px] font-bold md:cursor-default"
              >
                <i className="ti ti-clipboard-text text-[17px] text-accent" aria-hidden="true" />
                Diagnose stellen
                <span className="ml-auto flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="hidden sm:inline">Noch</span>
                  <b className="clinical-data text-[15px] text-accent">{possiblePoints}</b>
                  <span className="hidden sm:inline">Punkte möglich</span>
                  <i className={`ti ${diagOpen ? "ti-chevron-down" : "ti-chevron-up"} text-base text-muted/70 md:hidden`} />
                </span>
              </button>
              {diagOpen && (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {caseData.diagnosisOptions.map((opt, i) => {
                      const sel = pending === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setPending(sel ? null : opt)}
                          disabled={!!selectedDiagnosis}
                          aria-pressed={sel}
                          className={`flex items-center gap-2.5 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold leading-snug transition-colors ${
                            sel
                              ? "border-accent bg-accent/[0.07]"
                              : "border-card-border/20 bg-card hover:border-accent/60"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                              sel ? "bg-accent text-accent-foreground" : "bg-foreground/[0.06] text-muted"
                            }`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="flex-1">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 md:justify-end md:gap-4">
                    <span className="text-xs text-muted">Falsch = 0 Punkte</span>
                    <button
                      onClick={() => pending && onSubmitDiagnosis(pending)}
                      disabled={!pending || !!selectedDiagnosis}
                      className="rounded-[10px] bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Antwort abgeben
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {isResult && (
            <div
              ref={resultRef}
              className="sticky bottom-5 z-20 mt-auto max-h-[calc(100dvh-96px)] overflow-y-auto rounded-[14px] shadow-[0_-10px_30px_-16px_rgba(15,15,15,0.3)]"
            >
              <ResultIsland
                lastResultCorrect={lastResultCorrect}
                lastScoreEarned={lastScoreEarned}
                selectedDiagnosis={selectedDiagnosis}
                caseData={caseData}
                onNext={onNext}
                revealedCount={revealCount}
              />
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}

function HeaderStep({
  tone,
  label,
  state,
}: {
  tone: "s1" | "s2" | "s3";
  label: string;
  state: "done" | "now" | "idle";
}) {
  return (
    <span className={`flex items-center gap-2 text-[12.5px] font-semibold ${state === "idle" ? "text-muted" : "text-foreground"}`}>
      <StepDot tone={tone} idle={state === "idle"}>
        {state === "done" ? <i className="ti ti-check text-[10px]" /> : tone === "s1" ? "1" : tone === "s2" ? "2" : "3"}
      </StepDot>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
