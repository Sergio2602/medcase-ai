"use client";

import { useEffect, useState } from "react";

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

// Landing-page feature highlights.
const FEATURES: { icon: string; label: string }[] = [
  { icon: "stethoscope", label: "Untersuchen" },
  { icon: "brain", label: "Diagnostizieren" },
  { icon: "trophy", label: "Punkte sammeln" },
  { icon: "refresh", label: "Immer neue Fälle" },
];

// Tutorial overlay — shown once per visitor (localStorage flag) before the
// first generated case.
const TUTORIAL_STORAGE_KEY = "medcase_tutorial_seen";

const TUTORIAL_STEPS: { icon: string; title: string; text: string }[] = [
  {
    icon: "message-2",
    title: "Hinweise sammeln",
    text: "Erhebe die Anamnese, untersuche den Patienten und fordere Labor an – Schritt für Schritt.",
  },
  {
    icon: "coin",
    title: "Punkte clever einsetzen",
    text: "Jeder aufgedeckte Hinweis kostet 10 Punkte. Je weniger du brauchst, desto höher dein Score.",
  },
  {
    icon: "brain",
    title: "Diagnose stellen",
    text: "Leg dich auf eine Verdachtsdiagnose fest und erfahre sofort, ob du richtig lagst – mit Erklärung.",
  },
];

// Cycled through on the loading screen, one every 2 seconds.
const LOADING_MESSAGES = [
  "Patient betritt die Praxis...",
  "Anamnese wird vorbereitet...",
  "Befunde werden zusammengestellt...",
  "KI analysiert den Fall...",
  "Fall wird finalisiert...",
];

const FEEDBACK_INTERVAL = 2;

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
    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-white/10 sm:h-32 sm:w-32">
      <Icon name="user" className={`text-6xl sm:text-7xl ${tone}`} />
      <span className="sr-only">Patient</span>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [medCase, setMedCase] = useState<MedCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tutorial overlay — shown once per visitor before their first case.
  // Default `true` (assume seen) avoids a flash before localStorage is read.
  const [tutorialSeen, setTutorialSeen] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  // Feedback modal — surfaced after every couple of completed cases.
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    setTutorialSeen(
      window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1"
    );
  }, []);

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

  // Surface the feedback modal after every couple of completed cases. Watching
  // `played` keeps the trigger out of the scoring logic in submitDiagnosis.
  useEffect(() => {
    if (played > 0 && played % FEEDBACK_INTERVAL === 0) {
      setShowFeedback(true);
    }
  }, [played]);

  // Launch the first case from the landing page. First-time visitors see the
  // tutorial overlay first; its dismiss button resumes here via finishTutorial.
  function startCase() {
    if (!pendingDifficulty) return;
    if (!tutorialSeen) {
      setShowTutorial(true);
      return;
    }
    setDifficulty(pendingDifficulty);
    newPatient(pendingDifficulty);
  }

  function finishTutorial() {
    setShowTutorial(false);
    setTutorialSeen(true);
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    if (pendingDifficulty) {
      setDifficulty(pendingDifficulty);
      newPatient(pendingDifficulty);
    }
  }

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
      <header className="border-b border-white/5 bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Icon name="heartbeat" className="text-2xl text-logo" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              MedCase
              <span className="text-logo">.AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {difficultyMeta &&
              (phase === "playing" ||
                phase === "result" ||
                phase === "loading") && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-white/20">
                  <Icon name="school" className="text-sm text-brand" />
                  <span>{difficultyMeta.short}</span>
                </span>
              )}
            <div className="flex gap-4 text-right text-xs">
              <div>
                <div className="font-mono text-lg font-bold text-brand">
                  {totalScore}
                </div>
                <div className="text-slate-500">PUNKTE</div>
              </div>
              <div>
                <div className="font-mono text-lg font-bold text-foreground">
                  {solved}/{played}
                </div>
                <div className="text-slate-500">GELÖST</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-5 sm:py-14">
        {/* LANDING — hero, feature pills, difficulty selection, CTA */}
        {phase === "start" && (
          <div className="flex flex-1 flex-col">
            {/* Hero */}
            <div className="animate-fade-up text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand ring-1 ring-brand/30">
                <Icon name="sparkles" className="text-sm" />
                KI-generierte Fälle
              </span>
              <h2 className="mx-auto mt-5 max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                Trainiere klinisches Denken mit echten KI-Fällen
              </h2>
              <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-slate-400 sm:text-base">
                Befrage, untersuche, diagnostiziere — jeder Fall wird live von KI
                generiert.
              </p>
            </div>

            {/* Feature pills */}
            <div className="mx-auto mt-7 flex max-w-lg flex-wrap justify-center gap-2.5">
              {FEATURES.map((feature) => (
                <span
                  key={feature.label}
                  className="flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-xs font-medium text-foreground ring-1 ring-white/10"
                >
                  <Icon name={feature.icon} className="text-base text-brand" />
                  {feature.label}
                </span>
              ))}
            </div>

            {/* Difficulty selection */}
            <p className="mb-3 mt-10 text-center text-sm font-semibold text-foreground">
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
                    className={`group flex flex-col rounded-2xl border p-5 text-left transition duration-200 focus:outline-none focus:ring-2 focus:ring-brand ${
                      active
                        ? "border-brand bg-brand/10 shadow-lg shadow-brand/10"
                        : "border-white/10 bg-card hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg hover:shadow-black/20"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition ${
                        active
                          ? "bg-brand/20 text-brand"
                          : "bg-white/5 text-slate-400 group-hover:text-brand"
                      }`}
                    >
                      <Icon name={level.icon} />
                    </span>
                    <span className="mt-4 text-lg font-bold text-foreground">
                      {level.title}
                    </span>
                    <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Für wen: {level.audience}
                    </span>
                    <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-400">
                      {level.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2">
                          <Icon
                            name="chevron-right"
                            className={`mt-0.5 text-sm ${
                              active ? "text-brand" : "text-slate-600"
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
              <p className="mt-4 text-center text-sm text-rose-400" role="alert">
                {error}
              </p>
            )}

            {pendingDifficulty && (
              <div className="mt-6 flex justify-center sm:mt-8">
                <button
                  type="button"
                  onClick={startCase}
                  className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-foreground shadow-lg shadow-primary/30 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background active:opacity-90"
                >
                  Ersten Patienten aufrufen
                  <Icon name="arrow-right" className="text-lg" />
                </button>
              </div>
            )}

            {/* Sergio's note */}
            <figure className="mx-auto mt-12 max-w-md border-l-2 border-brand/40 pl-4 text-left">
              <blockquote className="text-sm italic leading-relaxed text-slate-400">
                &ldquo;Ich bin Sergio, Medizinstudent im 7. Semester. Ich hab
                dieses Tool alleine gebaut — weil ich selbst so was gebraucht
                hätte.&rdquo;
              </blockquote>
            </figure>
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && <LoadingScreen />}

        {/* PLAYING + RESULT share the patient layout */}
        {(phase === "playing" || phase === "result") && medCase && (
          <div className="flex flex-1 flex-col gap-6">
            {/* Patient + speech bubble — stacks vertically on mobile */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <PatientAvatar expression={expression} />
              </div>
              <div className="w-full text-center sm:flex-1 sm:text-left">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {medCase.patientName}, {medCase.age} Jahre,{" "}
                  {medCase.gender === "male" ? "m" : "w"}
                </div>
                <div className="relative rounded-2xl rounded-t-sm bg-brand/15 p-4 text-sm leading-relaxed text-foreground ring-1 ring-brand/30 sm:rounded-t-2xl sm:rounded-tl-sm">
                  {/* tail: points up on mobile (avatar above), left on desktop (avatar beside) */}
                  <span
                    className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-brand/15 sm:top-4 sm:translate-x-0 sm:-left-1.5"
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
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-semibold text-foreground shadow-lg shadow-primary/30 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
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
                  <p className="text-sm font-semibold text-foreground">
                    Deine Verdachtsdiagnose?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDiagnosisPicker(false)}
                    className="-mr-1 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-foreground"
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
                    className="min-h-[56px] rounded-xl bg-card px-4 py-4 text-left text-sm font-medium text-foreground ring-1 ring-white/10 transition hover:bg-brand/10 hover:ring-brand/50 focus:outline-none focus:ring-2 focus:ring-brand active:bg-brand/20"
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
                      : "bg-rose-500/10 ring-rose-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex items-center gap-2 text-lg font-bold ${
                        isCorrect ? "text-brand" : "text-rose-400"
                      }`}
                    >
                      <Icon
                        name={isCorrect ? "circle-check" : "circle-x"}
                        className="text-xl"
                      />
                      {isCorrect ? "Richtig!" : "Leider falsch"}
                    </span>
                    <span className="font-mono text-2xl font-bold text-foreground">
                      +{caseScore}
                    </span>
                  </div>
                  {!isCorrect && (
                    <p className="mt-2 text-sm text-slate-500">
                      Du hattest{" "}
                      <span className="font-semibold text-rose-400">
                        {selected}
                      </span>{" "}
                      getippt.
                    </p>
                  )}
                  <p className="mt-2 text-sm text-foreground">
                    Die richtige Diagnose lautet{" "}
                    <span className="font-semibold text-brand">
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-foreground shadow-lg shadow-primary/30 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background active:opacity-90"
                >
                  Nächster Patient
                  <Icon name="arrow-right" className="text-lg" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {showTutorial && <TutorialOverlay onDismiss={finishTutorial} />}
      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} />
      )}
    </div>
  );
}

// Full-screen loading state shown while a case is generated. Cycles through
// reassuring German status lines and gently pulses the icon.
function LoadingScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="animate-spring flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-card p-10 text-center ring-1 ring-white/10">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
          <Icon
            name="stethoscope"
            className="animate-loading-pulse text-4xl text-brand"
          />
        </div>
        <p
          key={step}
          className="animate-overlay text-sm font-medium text-foreground"
          aria-live="polite"
        >
          {LOADING_MESSAGES[step]}
        </p>
        <div className="flex gap-1.5">
          {LOADING_MESSAGES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                i === step ? "bg-brand" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// One-time tutorial — three steps walking a first-time visitor through the
// game. The final step's button resumes case generation via onDismiss.
function TutorialOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-heading"
      className="animate-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
    >
      <div className="animate-spring w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-2xl ring-1 ring-brand/30 sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-3xl text-brand ring-1 ring-brand/30">
          <Icon name={current.icon} />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Schritt {step + 1} von {TUTORIAL_STEPS.length}
        </p>
        <h2
          id="tutorial-heading"
          className="mt-2 text-2xl font-bold text-foreground"
        >
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {current.text}
        </p>

        {/* Progress dots */}
        <div className="mt-6 flex justify-center gap-1.5">
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-brand" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => (isLast ? onDismiss() : setStep((s) => s + 1))}
          className="mt-7 w-full rounded-xl bg-primary px-8 py-4 font-semibold text-foreground transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-card"
        >
          {isLast ? "Los geht's" : "Weiter"}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 text-xs font-medium text-slate-500 transition hover:text-foreground"
          >
            Überspringen
          </button>
        )}
      </div>
    </div>
  );
}

// Lightweight feedback prompt shown after every couple of cases. Collects a
// star rating and optional note locally, then closes.
function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [note, setNote] = useState("");

  function submit() {
    // Feedback is collected client-side for now; wire up to a backend later.
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-heading"
      className="animate-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
    >
      <div className="animate-spring w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-2xl ring-1 ring-brand/30 sm:p-8">
        <h2
          id="feedback-heading"
          className="text-2xl font-bold text-foreground"
        >
          Wie läuft&apos;s?
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Dein Feedback hilft mir, MedCase.AI besser zu machen.
        </p>

        {/* Star rating */}
        <div
          className="mt-5 flex justify-center gap-1.5"
          role="radiogroup"
          aria-label="Bewertung"
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const filled = (hovered || rating) >= value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} von 5`}
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                className="rounded-md p-1 transition focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <Icon
                  name={filled ? "star-filled" : "star"}
                  className={`text-3xl transition-colors ${
                    filled ? "text-brand" : "text-white/20"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Was können wir verbessern? (optional)"
          className="mt-5 w-full resize-none rounded-xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-white/10 transition placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand"
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
          >
            Überspringen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={rating === 0}
            className="flex-1 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-foreground shadow-lg shadow-primary/30 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            Absenden
          </button>
        </div>
      </div>
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
    secondary: "text-brand",
  };
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-white/10">
      <div
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}
      >
        {label}
      </div>
      <p className="text-sm leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

// Structured laboratory results rendered as a grouped table with reference
// ranges and ↑/↓ flags for out-of-range values.
function LabResults({ labs }: { labs: LabCategory[] }) {
  const flagStyles: Record<LabFlag, string> = {
    high: "text-rose-400",
    low: "text-sky-400",
    normal: "text-foreground",
  };
  const arrows: Record<LabFlag, string> = {
    high: "↑",
    low: "↓",
    normal: "",
  };

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
        <Icon name="flask" className="text-sm" />
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
                className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand/80"
              >
                {group.category}
              </td>
            </tr>
            {group.values.map((v) => (
              <tr
                key={v.name}
                className="border-t border-white/10 align-baseline"
              >
                <td className="py-1.5 pr-2 text-slate-500">{v.name}</td>
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
    <div className="rounded-xl bg-card p-4 ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
        <Icon name="scan" className="text-sm" />
        <span>Bildgebung</span>
      </div>
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-lg text-brand ring-1 ring-brand/20">
          <Icon name="scan" />
        </div>
        <p className="text-sm leading-relaxed text-slate-500">{text}</p>
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
          ? "cursor-not-allowed bg-white/5 text-slate-500 ring-white/10"
          : "bg-card text-foreground ring-white/10 hover:bg-brand/10 hover:ring-brand/40 active:bg-brand/20"
      }`}
    >
      {done ? (
        <>
          <Icon name="check" className="text-base text-slate-500" />
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
