"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { KontaktPopover } from "./components/KontaktPopover";
import type { BilanzRow, Relevance } from "@/lib/scoring";
import { recordCaseResult, readCaseResults } from "@/lib/stats";
import { track } from "@/lib/analytics";
import { PostCaseFeedback } from "./components/PostCaseFeedback";
import { LaunchIntentPrompt } from "./components/LaunchIntentPrompt";
import { loadProfile, saveProfile, initialsOf, ProfileModal, type Profile } from "./components/ProfileCorner";

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
  // Untersuchung/Bildgebung/Labor/Diagnose/Begründung liegen serverseitig vor,
  // aber NICHT mehr im initialen /api/case/start-Response (Payload-Fix,
  // 21.09.2026 — siehe DECISION_LOG.md). Sie werden erst nach expliziter
  // Anforderung (/api/case/reveal) bzw. nach Diagnoseabgabe
  // (/api/case/verify) client-seitig nachgeladen und gemerged — deshalb hier
  // optional statt Pflichtfeld.
  examination?: string;
  labs?: LabCategory[];
  imaging?: string;
  correctDiagnosis?: string;
  diagnosisOptions: string[];
  keyTakeaway?: string;
  explanation?: string;
  // Serverseitig berechnet: ob für diesen Fall überhaupt Bildgebung existiert.
  // Ersetzt den alten client-seitigen hasImaging()-Check, der die echten
  // Bildgebungsdaten vorausgesetzt hätte — die liegen jetzt aber erst nach
  // Anforderung vor.
  imagingAvailable: boolean;
  // Update 01.10.2026 — v3: 4 zusätzliche Befund-Kategorien + Oberarzt-Joker
  // (siehe docs/CASE_SCHEMA_V3.md). Bei Altfällen bleiben diese Felder/Flags
  // schlicht unbesetzt bzw. false — keine Verhaltensänderung für sie.
  auskultation?: string;
  ekg?: string;
  eeg?: string;
  konsil?: string;
  oberarzt?: string;
  auskultationAvailable?: boolean;
  ekgAvailable?: boolean;
  eegAvailable?: boolean;
  konsilAvailable?: boolean;
  oberarztAvailable?: boolean;
  // v3: Schwierigkeits-Einordnung (Häufigkeit × Erkennbarkeit) + eigenes
  // Cannot-miss-Flag — laut Sichtbarkeits-Tabelle (CASE_SCHEMA_V3.md) beide
  // von Anfang an sichtbar, kein Diagnose-Leak.
  niveau?: "einfach" | "erfahren" | "experte";
  cannotMiss?: boolean;
  // Optional — only present on newly-curated, source-checked cases. Absent on
  // the older bank, which must keep rendering exactly as before (no UI change
  // when this is undefined).
  differentialNotes?: DifferentialNote[];
  // Optional — strukturierte Anamnese (Abschnitte statt Fließtext). Fehlt sie,
  // wird `history` unverändert als Fließtext gezeigt.
  anamnese?: { label: string; text: string }[];
  // Optional — Beruf des Patienten (Patientenkopf der Akte). Fehlt er: „—“.
  occupation?: string;
  // Optional — weitere Felder des Patientenkopfes (erstmal leer → „—“).
  family?: string;
  preExisting?: string;
  // Update 06.10.2026: v3-Fälle liefern Allergien/Alkohol&Drogen als eigene
  // Felder statt in preExisting verklappt (siehe lib/case-bank.ts). Bei
  // Altfällen/ohne Tag: undefined → Feld wird in der UI einfach ausgeblendet.
  allergies?: string;
  substanceHistory?: string;
  medications?: string;
  // Optional — 1-sentence, sourced context on why this diagnosis is in the
  // bank (common in real hospitals, or rare-but-cannot-miss). Display only,
  // no scoring effect. Only rendered post-reveal (never during play, to avoid
  // leaking the answer category before the user commits).
  caseContext?: CaseContext;
  // Spielwiese 09.10.2026: erst nach Abgabe vom Server (lib/scoring.ts).
  bilanz?: BilanzRow[];
  jokerDelta?: number;
};

type CaseContext = {
  // "selten" ergänzt für v3-Fälle (siehe CASE_SCHEMA_V3.md) — "cannot-miss"
  // bleibt als Legacy-Wert für die alten 70 Fälle gültig.
  category: "haeufig" | "selten" | "cannot-miss";
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
  auskultation: boolean;
  ekg: boolean;
  eeg: boolean;
  konsil: boolean;
  oberarzt: boolean;
};

const BASE_SCORE = 100;
const INVESTIGATION_COST = 10;
// Nachträglich angeforderte Befunde (nach der ersten Bestellung) kosten das Doppelte —
// Lerneffekt: vorab überlegen, welche Befunde man wirklich braucht.
const LATE_INVESTIGATION_COST = 20;
// Update 01.10.2026 — v3: Oberarzt-Joker, fixer Preis laut CASE_SCHEMA_V3.md
// ("Kosten-Modell"), nie nachträglich verteuert (kein Lerneffekt-Mechanismus
// dafür vorgesehen — es ist ein bewusst teurer Joker, kein Befund).
const OBERARZT_COST = 30;
// Flacher Floor: mit jetzt 7 Befund-Kategorien + Joker kann die theoretische
// Gesamtkosten-Summe BASE_SCORE deutlich übersteigen — ein fixer, niedriger
// Boden (statt der alten, nur auf 3 Kategorien ausgelegten Formel) stellt
// sicher, dass eine richtige Diagnose nie 0 Punkte bringt. Reine
// Balance-Annahme, jederzeit änderbar (siehe DECISION_LOG.md 01.10.2026).
const MIN_SCORE = 20;

function investigationCost(
  r: {
    examination: boolean;
    auskultation: boolean;
    imaging: boolean;
    labs: boolean;
    ekg: boolean;
    eeg: boolean;
    konsil: boolean;
    oberarzt: boolean;
  },
  late: FindingKey[]
): number {
  const keys = ["examination", "auskultation", "labs", "ekg", "eeg", "imaging", "konsil"] as const;
  const findingsCost = keys.reduce(
    (sum, k) =>
      r[k] ? sum + (late.includes(k) ? LATE_INVESTIGATION_COST : INVESTIGATION_COST) : sum,
    0
  );
  return findingsCost + (r.oberarzt ? OBERARZT_COST : 0);
}

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
  { id: "klinik", label: "Klinik" },
  { id: "examen", label: "PJ" },
];
export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [difficulty, setDifficulty] = useState<Difficulty>("klinik");
  const [discipline, setDiscipline] = useState<Discipline>("zufaellig");
  // Post-Case-Overlay: Studenten-Micro-Survey (meilensteinbasiert).
  const [postFeedback, setPostFeedback] = useState<null | "student">(null);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [revealed, setRevealed] = useState<Revealed>({
    history: true, // Anamnese ist gratis (immer vorgelegt)
    examination: false,
    imaging: false,
    labs: false,
    auskultation: false,
    ekg: false,
    eeg: false,
    konsil: false,
    oberarzt: false,
  });
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(
    null
  );
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [played, setPlayed] = useState(0);
  const [lastResultCorrect, setLastResultCorrect] = useState(false);
  const [lastScoreEarned, setLastScoreEarned] = useState(0);
  const [lateFindings, setLateFindings] = useState<FindingKey[]>([]);
  const [revealedAtSubmit, setRevealedAtSubmit] = useState<Revealed>({
    history: false,
    examination: false,
    imaging: false,
    labs: false,
    auskultation: false,
    ekg: false,
    eeg: false,
    konsil: false,
    oberarzt: false,
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
      auskultation: false,
      ekg: false,
      eeg: false,
      konsil: false,
      oberarzt: false,
    });
    setRevealedAtSubmit({
      history: false,
      examination: false,
      imaging: false,
      labs: false,
      auskultation: false,
      ekg: false,
      eeg: false,
      konsil: false,
      oberarzt: false,
    });
    setLateFindings([]);
    setSelectedDiagnosis(null);
    try {
      const minDelay = new Promise((resolve) => setTimeout(resolve, 1300));
      // QA-Hilfe: ?case=<id> in der URL erzwingt einen bestimmten Fall (z.B.
      // beim Testen eines neuen v3-Falls, statt auf die Zufallsauswahl zu warten).
      // Ohne den Parameter verhält sich alles wie bisher.
      const debugCaseId =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("case") : null;
      const res = await fetch("/api/case/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty: "klinik",
          discipline: selectedDiscipline ?? discipline,
          ...(debugCaseId ? { caseId: debugCaseId } : {}),
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      }
      await minDelay;
      const loadedCase = data as Case;
      setActiveCase(loadedCase);
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

  // Fordert eine oder mehrere Befund-Kategorien serverseitig an (Payload-Fix:
  // die Inhalte liegen bis hier nie im Client, nur die Anfrage nach caseId +
  // Kategorie). Merged die Antwort in activeCase und markiert erst danach als
  // revealed — nie revealed ohne vorliegende Daten.
  async function revealCategories(keys: FindingKey[]) {
    if (!activeCase || keys.length === 0) return;
    try {
      const res = await fetch("/api/case/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCase.id,
          difficulty: activeCase.difficulty,
          categories: keys,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      setActiveCase((c) => (c ? { ...c, ...data } : c));
      setRevealed((r) => {
        const next = { ...r };
        keys.forEach((k) => {
          next[k] = true;
        });
        return next;
      });
    } catch {
      track("befund_abruf_fehlgeschlagen", { difficulty: activeCase.difficulty });
    }
  }

  // Anamnese ist gratis — nur Untersuchung/Bildgebung/Labor kosten Punkte.
  function paidRevealCount(r: Revealed) {
    // Oberarzt-Joker bewusst ausgenommen — das ist kein "Befund" im
    // ursprünglichen Sinn dieser Zählung, sondern ein separater Joker.
    return [r.examination, r.auskultation, r.imaging, r.labs, r.ekg, r.eeg, r.konsil].filter(
      Boolean
    ).length;
  }

  async function submitDiagnosis(option: string) {
    if (!activeCase || selectedDiagnosis) return;
    setSelectedDiagnosis(option);
    let result: {
      correct: boolean;
      correctDiagnosis: string;
      explanation: string;
      keyTakeaway?: string;
      differentialNotes?: DifferentialNote[];
      caseContext?: CaseContext;
      score?: number;
      bilanz?: BilanzRow[];
      jokerDelta?: number;
    };
    try {
      const res = await fetch("/api/case/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCase.id,
          difficulty: activeCase.difficulty,
          guess: option,
          requested: (Object.keys(revealed) as (keyof Revealed)[]).filter(
            (k) => k !== "history" && revealed[k]
          ),
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      result = data;
    } catch {
      // Prüfung fehlgeschlagen — Auswahl zurücknehmen, damit erneut abgegeben werden kann.
      setSelectedDiagnosis(null);
      track("diagnose_pruefung_fehlgeschlagen", { difficulty: activeCase.difficulty });
      return;
    }
    setRevealedAtSubmit(revealed);
    setActiveCase((c) =>
      c
        ? {
            ...c,
            correctDiagnosis: result.correctDiagnosis,
            explanation: result.explanation,
            keyTakeaway: result.keyTakeaway ?? c.keyTakeaway,
            differentialNotes: result.differentialNotes,
            caseContext: result.caseContext,
            bilanz: result.bilanz,
            jokerDelta: result.jokerDelta,
          }
        : c
    );
    const correct = result.correct;
    const earned = typeof result.score === "number"
      ? result.score
      : correct
      ? Math.max(BASE_SCORE - investigationCost(revealed, lateFindings), MIN_SCORE)
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
      befunde_nachtraeglich: lateFindings.filter((k) => revealed[k]).length,
      difficulty: activeCase.difficulty,
      discipline,
      duration_seconds: durationSeconds,
    });
    setPhase("result");

    // Launch-Nudge und Studenten-Survey laufen meilensteinbasiert über nextCase
    // (siehe dort), nicht hier.
  }

  function nextCase() {
    // Meilenstein-Logik beim "Nächster Patient"-Klick. Fall-Zähler ist kumulativ
    // und persistent (localStorage, disziplin-übergreifend), damit die Schwellen
    // sitzungsübergreifend stimmen. Exakte Gleichheit = automatisch je 3× gedeckelt.
    //  - Launch-Nudge (nicht-blockierend): 15 / 35 / 55, nie wenn schon eingetragen.
    //  - Studenten-Survey (blockierendes Modal): 25 / 50 / 75.
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
    setPostFeedback(null);
    startCase(difficulty);
  }

  function goHome() {
    setPhase("start");
  }

  return (
    <div className={`min-h-screen px-4 md:px-10 ${phase === "playing" || phase === "result" ? "" : "pt-5 pb-8"}`}>
      <div className="mx-auto max-w-[1560px]">
        {postFeedback && activeCase && (
          <PostCaseFeedback
            kind={postFeedback}
            caseData={{ ...activeCase, correctDiagnosis: activeCase.correctDiagnosis ?? "" }}
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
            onRevealCategories={revealCategories}
            revealedAtSubmit={revealedAtSubmit}
            lateFindings={lateFindings}
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

// Zählt beim ersten Sichtbarwerden von 0 auf den Zielwert hoch (ease-out,
// ~900ms). WICHTIG: Initial-State ist der Zielwert, damit SSR/Crawler/
// Link-Previews und Nutzer ohne JS die echte Zahl sehen (nicht "0") —
// die Animation ist reines Client-Enhancement beim Herunterscrollen.
// Evidenz-Block: belegt mit Primärquellen, dass das Defizit, das Casolvo
// trainiert, in der Ausbildungsforschung dokumentiert ist. Nur verifizierte
// Aussagen (direkt an der GMS-Originalquelle geprüft) — konsistent mit dem
// Quellen-USP der Seite. Dient doppelt: Social-Proof-Ersatz für Besucher
// heute, Argumentationsgrundlage für Skills-Lab-/Dozenten-Gespräche später.
// Update 08.10.2026 (Sergio: "lassen wir den Text im Header erstmal") —
// Hero-Breakout-Experiment wieder zurückgebaut, EvidenceCard ist wieder
// eine normale Karte im Methodik-Stack (wie ursprünglich).
// Vertrauens-Block: nimmt die "ist das KI überhaupt seriös?"-Sorge vorweg,
// bevor der Gründer-Text (persönlich, aber kein Beleg) folgt. Beide Hälften
// (Warum-KI + So-entsteht-ein-Fall) leben in EINER Karte, damit sie optisch
// zusammengehören statt als zwei getrennte "Inseln" zu wirken. Der "Mehr"-Chip
// überlappt die interne Trennlinie als Overlay und triggert einen sanften
// Scroll (html { scroll-behavior: smooth } in globals.css) statt eines Sprungs.
// Vereinfachte Version der RangeBar von /ueber-uns#impp-haeufigkeit — gleiche
// Zahlen, nur kompakter für die Homepage.
// Zieht die IMPP-Häufigkeit + Cannot-miss-Daten von /ueber-uns auf die
// Homepage — gleiche Zahlen, keine erfundenen Werte, nur eine kompakte
// Auswahl mit Link zur vollständigen Seite.
// Ebenfalls von /ueber-uns#qualitaet übernommen — gleicher Wortlaut/Status,
// damit Homepage und Über-uns nie widersprüchliche Aussagen machen.
// „heute" / „gestern" / „vor N Tagen" — bewusst kein Streak, nur Kontext.
// Update 08.10.2026 (Sergio: "sieht nach KI aus" — Mockup-Karte mit
// simulierter Klick-Animation wieder raus) — stattdessen eine ruhige,
// rein typografische Schritt-Liste (gleiche Fraunces-Zahlen-Optik wie der
// Rest des Rebrandings), kein Icon, kein Fake-UI-Nachbau.
// ---------------------------------------------------------------------------
// Landing (Local-Test 1, 13.10.2026): Die Startseite IST die Navigation —
// drei große Blätter im Cover-Flow: Willkommen · Fall starten · Profil &
// Statistik. Wechsel nur auf Nutzeraktion. Wiederkehrer starten auf Blatt 2.
// Darunter (Scrollen): Monitor-Animation + Pflichtangaben.
// ---------------------------------------------------------------------------

const HOME_TITLES = ["Willkommen", "Fall starten", "Profil & Statistik"];
const PROFILE_STATUS_LABEL: Record<Profile["statusKind"], string> = {
  vorklinik: "Vorklinik",
  klinik: "Klinik",
  pj: "PJ",
  approbiert: "Approbiert",
};
const VISITED_KEY = "casolvo:visited";

// Antworten bewusst auf dem aktuellen Stand (kein Tageslimit mehr, neue
// Fallbank, Bewertung nach Relevanz) — NICHT 1:1 aus der veralteten /qa-Seite.
const FAQ = [
  {
    q: "Wofür ist Casolvo?",
    a: "Um klinisches Denken zu trainieren: Anamnese lesen, selbst entscheiden, welche Befunde du brauchst, und die Diagnose stellen – vor Famulatur, PJ oder Examen.",
  },
  {
    q: "Wie benutze ich es?",
    a: "Fall starten, Anamnesebogen lesen, Befunde anordnen, Diagnose abgeben. Danach siehst du Begründung, Abgrenzung der Alternativen und deine Diagnostik-Bilanz.",
  },
  {
    q: "Ist das kostenlos?",
    a: "Ja, aktuell komplett kostenlos und ohne Account. Profil und Statistik bleiben lokal in deinem Browser.",
  },
  {
    q: "Wie entstehen die Fälle?",
    a: "KI-gestützt anhand von Primärquellen wie AWMF-Leitlinien, RKI und PubMed, unabhängig gegengeprüft und vor Veröffentlichung persönlich freigegeben.",
  },
];

const METHODIK = [
  {
    title: "Wie ein Fall entsteht",
    text: "Diagnose nach IMPP-Häufigkeit und Cannot-miss-Kriterium, Fallerstellung anhand von Primärquellen, unabhängiger Gegencheck – und eine persönliche Freigabe, bevor ein Fall live geht.",
  },
  {
    title: "Quellenbasis",
    text: "AWMF-Leitlinien, RKI, PubMed – bewusst kein Amboss oder UpToDate als Beleg. Keine Diagnose wird beim Schreiben vorab verraten.",
  },
  {
    title: "Bewertung nach Relevanz",
    text: "Jeder Befund ist als diagnosetragend, stützend, abgrenzend oder nicht zielführend eingestuft. Punkte gibt es für gute Diagnostik, nicht fürs Raten.",
  },
  {
    title: "Qualitätssicherung",
    text: "„Fall melden“ ist in jedem Fall über die Navigation erreichbar – jede Meldung wird gesichtet.",
  },
];

function accuracyColors(pct: number) {
  if (pct >= 80) return { bg: "#e8f5e9", text: "#1b5e20", bar: "#4caf50" };
  if (pct >= 50) return { bg: "#fef4e3", text: "#b45309", bar: "#f59e0b" };
  return { bg: "#eef1f5", text: "#475569", bar: "#94a3b8" };
}

function Ring({
  percent,
  color,
  size,
  stroke,
  active,
  label,
}: {
  percent: number;
  color: string;
  size: number;
  stroke: number;
  active: boolean;
  label?: React.ReactNode;
}) {
  const shown = active ? Math.max(0, Math.min(100, percent)) : 0;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(26,49,82,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(0.22, 1, 0.36, 1) 250ms" }}
        />
      </svg>
      {label && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{label}</div>}
    </div>
  );
}

function FaqKarte({ q, a }: { q: string; a: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((v) => !v)}
      aria-pressed={flipped}
      className="group relative h-[150px] w-full text-left [perspective:1200px]"
    >
      <div
        className="relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.06] p-5 transition-colors group-hover:bg-white/[0.1] [backface-visibility:hidden]">
          <p style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }} className="text-[18px] font-semibold leading-snug text-white">
            {q}
          </p>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/45 group-hover:text-white/70">
            Antwort ansehen <i className="ti ti-rotate-clockwise-2 text-[13px]" aria-hidden="true" />
          </span>
        </div>
        <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2f6fb0]">{q}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-[#1a3152]">{a}</p>
        </div>
      </div>
    </button>
  );
}

// Trackpad-Wischen (Local-Test 1, 13.10.2026, Sergio): Zwei-Finger-Wischen
// auf dem Mac erzeugt horizontale wheel-Events. Pro Wischbewegung ein Blatt.
// Nach einem Schritt werden die abklingenden Nachlauf-Events (Momentum)
// ignoriert — sobald die Deltas aber wieder ANSTEIGEN, beginnt eine neue
// Bewegung und das nächste Blatt ist sofort möglich (kein Warten, bis das
// Momentum ausgelaufen ist). preventDefault verhindert die Browser-Zurück-Geste.
function useTrackpadSwipe(
  ref: React.RefObject<HTMLDivElement | null>,
  setSlide: React.Dispatch<React.SetStateAction<number>>,
  max: number
) {
  useEffect(() => {
    let acc = 0;
    let locked = false;
    let lastAbs = 0;
    let lastStep = 0;
    let idle: number | undefined;
    function onWheel(e: WheelEvent) {
      const el = ref.current;
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const a = Math.abs(e.deltaX);
      const now = performance.now();
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        acc = 0;
        locked = false;
        lastAbs = 0;
      }, 120);
      if (locked) {
        const newGesture = now - lastStep > 180 && a > lastAbs + 2 && a > 5;
        lastAbs = a;
        if (!newGesture) return;
        locked = false;
        acc = 0;
      }
      lastAbs = a;
      acc += e.deltaX;
      if (Math.abs(acc) > 40) {
        const dir = acc > 0 ? 1 : -1;
        setSlide((v) => Math.max(0, Math.min(max, v + dir)));
        locked = true;
        lastStep = now;
        acc = 0;
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(idle);
    };
  }, [ref, setSlide, max]);
}

function StartScreen({
  onStart,
}: {
  onStart: (d: Difficulty, disc: Discipline) => void;
}) {
  const level: Difficulty = "klinik";
  const [disc, setDisc] = useState<Discipline>("zufaellig");
  const [slide, setSlide] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [results, setResults] = useState<CaseResultRow[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(1200);
  const touchX = useRef<number | null>(null);
  useTrackpadSwipe(stageRef, setSlide, 2);
  const monitorRef = useRef<HTMLDivElement>(null);
  const [monitorP, setMonitorP] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch("/api/case/counts?difficulty=klinik", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCounts(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setDisc(loadLastChoice().discipline);
    setProfile(loadProfile());
    setResults(readCaseResults());
    const sp = new URLSearchParams(window.location.search).get("s");
    try {
      if (sp && /^[0-2]$/.test(sp)) setSlide(Number(sp));
      else if (localStorage.getItem(VISITED_KEY) === "1") setSlide(1);
      localStorage.setItem(VISITED_KEY, "1");
    } catch {}
    if (window.location.hash === "#methodik") {
      setTimeout(() => document.getElementById("methodik")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    }
  }, []);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") setSlide((v) => Math.min(2, v + 1));
      if (e.key === "ArrowLeft") setSlide((v) => Math.max(0, v - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Scroll-gekoppelte Monitor-Animation (aufkippen + vergrößern)
  useEffect(() => {
    let raf = 0;
    function update() {
      raf = 0;
      const el = monitorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.75)));
      setMonitorP(p);
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  function startNow() {
    saveLastChoice(level, disc);
    onStart(level, disc);
  }

  const played = results.length;
  const correct = results.filter((r) => r.correct).length;
  const points = results.reduce((sum, r) => sum + r.score, 0);
  const accuracy = played > 0 ? Math.round((correct / played) * 100) : 0;
  const avgPoints = played > 0 ? Math.round(points / played) : 0;
  const avgSeconds = played > 0 ? Math.round(results.reduce((s2, r) => s2 + r.durationSeconds, 0) / played) : 0;
  const recent = [...results].sort((x, y) => y.timestamp - x.timestamp).slice(0, 5);
  const byDisc = DISCIPLINES.map((d) => {
    const rs = results.filter((r) => r.discipline === d.id);
    return { id: d.id, label: d.label, n: rs.length, pct: rs.length ? Math.round((rs.filter((r) => r.correct).length / rs.length) * 100) : 0 };
  }).filter((g) => g.n > 0);
  const discLabel = (id: string) => DISCIPLINES.find((d) => d.id === id)?.label ?? id;
  const fmtDauer = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} min` : `${sec} s`);

  const cardW = stageW >= 768 ? Math.min(1240, stageW * 0.86) : stageW - 16;
  const coverTransform = (d: number) => {
    if (d === 0) return "translate3d(0,0,0) rotateY(0deg)";
    const sign = d > 0 ? 1 : -1;
    const k = Math.abs(d) - 1;
    const x = sign * (cardW * 0.7 + k * cardW * 0.22);
    const z = -(cardW * 0.34 + 140 + k * 220);
    return `translate3d(${Math.round(x)}px,0,${Math.round(z)}px) rotateY(${-sign * 40}deg)`;
  };
  const fraunces = { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 } as const;

  // ---- Blatt 1: Willkommen + FAQ-Karten
  const blattWillkommen = (
    <div className="flex h-full flex-col overflow-y-auto bg-[#1a3152] px-7 py-8 text-white md:px-12 md:py-9">
      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-center justify-center text-center">
        <h2 style={fraunces} className="text-[40px] leading-[1.06] text-white md:text-[60px]">
          Willkommen bei Casolvo.
        </h2>
        <p className="mt-4 flex items-center gap-2 text-[15px] font-medium text-white/65">
          <i className="ti ti-device-laptop text-[17px]" aria-hidden="true" />
          Am besten am Mac oder Laptop
        </p>
        <button
          type="button"
          onClick={() => setSlide(1)}
          className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-[#1a3152] transition-opacity hover:opacity-95"
        >
          Los geht&apos;s
          <i className="ti ti-arrow-right text-[16px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        <div className="mt-12 grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {FAQ.map((f) => (
            <FaqKarte key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </div>
  );

  // ---- Blatt 2: Fall starten — zentriert, Kacheln mit Fallzahlen
  const statsFor = (id: string) => {
    const rs = results.filter((r) => r.discipline === id);
    return { solved: rs.length, correct: rs.filter((r) => r.correct).length };
  };
  const available = (id: string) => (counts ? counts[id] ?? 0 : null);
  const cur = statsFor(disc);
  const blattStart = (
    <div className="flex h-full flex-col overflow-y-auto px-7 py-7 md:px-12 md:py-8">
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center text-center">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-muted">Neuer Patient · Niveau Klinik</p>
        <h2 style={fraunces} className="mt-1.5 text-[32px] leading-tight text-[#1a3152] md:text-[38px]">
          Welches Fachgebiet?
        </h2>
        <div className="mt-7 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
          {DISCIPLINES.map((d) => {
            const n = available(d.id);
            const st = statsFor(d.id);
            const empty = !d.locked && n === 0;
            const off = d.locked || empty;
            const on = disc === d.id;
            return (
              <button
                key={d.id}
                type="button"
                disabled={off}
                aria-pressed={on}
                onClick={() => setDisc(d.id)}
                className={`relative flex h-[84px] flex-col items-start justify-center rounded-2xl border-[1.5px] px-5 text-left transition-all duration-300 ${
                  off
                    ? "cursor-not-allowed border-dashed border-foreground/15 text-foreground/35"
                    : on
                    ? "-translate-y-0.5 border-[#1a3152] bg-[#1a3152] text-white shadow-[0_16px_30px_-16px_rgba(26,49,82,0.8)]"
                    : "border-foreground/12 bg-white/70 text-foreground hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_14px_28px_-20px_rgba(15,23,42,0.5)]"
                }`}
              >
                <span className="text-[15.5px] font-semibold">{d.label}</span>
                {d.locked ? (
                  <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em]">in Vorbereitung</span>
                ) : empty ? (
                  <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em]">noch keine Fälle</span>
                ) : (
                  <span className={`clinical-data mt-1 text-[12px] ${on ? "text-white/70" : "text-muted"}`}>
                    {n === null ? "…" : n} Fälle · {st.solved} gelöst · {st.correct} richtig
                  </span>
                )}
                {on && <i className="ti ti-check absolute right-4 top-3.5 text-[15px] text-white/80" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-[13px] text-foreground/60">
            Aktuell gewählt: <span className="font-semibold text-[#1a3152]">{discLabel(disc)}</span>
            {" · "}
            {available(disc) === null ? "…" : available(disc)} verfügbar · {cur.solved} gelöst · {cur.correct} richtig
          </p>
          <button
            type="button"
            onClick={startNow}
            className="group inline-flex items-center gap-2.5 rounded-full bg-[#1a3152] px-10 py-4 text-[16px] font-semibold text-white shadow-[0_18px_36px_-16px_rgba(26,49,82,0.8)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Fall starten
            <span className="text-white/55">· {discLabel(disc)}</span>
            <i className="ti ti-arrow-right text-[17px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Blatt 3: Profil & Statistik — Profil sachlich, Statistik mit Ringen, zentriert
  const accC = accuracyColors(accuracy);
  const blattProfil = (
    <div className="flex h-full flex-col justify-center overflow-y-auto px-7 py-7 md:px-12 md:py-8">
      <div className="mx-auto grid w-full max-w-[1080px] items-center gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
        {/* Profil */}
        <div>
          <Rubrik>Profil</Rubrik>
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
              style={
                profile
                  ? { backgroundColor: profile.avatarColor, color: "#1a3152" }
                  : { backgroundColor: "rgba(26,49,82,0.08)", color: "rgba(26,49,82,0.45)" }
              }
            >
              {profile ? initialsOf(profile.name) : <i className="ti ti-user text-[20px]" aria-hidden="true" />}
            </div>
            <p className="min-w-0 truncate text-[17px] font-bold text-foreground">{profile ? profile.name : "Noch kein Profil"}</p>
          </div>
          <dl className="mt-4">
            <div className="flex justify-between border-b border-dotted border-foreground/20 py-2.5 text-[14px]">
              <dt className="text-muted">Ausbildungsstand</dt>
              <dd className="font-semibold text-foreground">{profile ? PROFILE_STATUS_LABEL[profile.statusKind] : "–"}</dd>
            </div>
            <div className="flex justify-between border-b border-dotted border-foreground/20 py-2.5 text-[14px]">
              <dt className="text-muted">Semester</dt>
              <dd className="font-semibold text-foreground">{profile?.semester ? `${profile.semester}.` : "–"}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="mt-4 text-[13.5px] font-semibold text-[#1a3152] hover:underline"
          >
            {profile ? "Profil bearbeiten" : "Profil anlegen"} →
          </button>
        </div>

        {/* Statistik */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-8 md:justify-start">
            <Ring
              percent={accuracy}
              color={accC.bar}
              size={160}
              stroke={12}
              active={slide === 2}
              label={
                <>
                  <span className="clinical-data text-[32px] font-bold leading-none" style={{ color: accC.text }}>
                    {played > 0 ? `${accuracy}%` : "–"}
                  </span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Trefferquote</span>
                </>
              }
            />
            <Ring
              percent={avgPoints}
              color="#2f6fb0"
              size={124}
              stroke={10}
              active={slide === 2}
              label={
                <>
                  <span className="clinical-data text-[25px] font-bold leading-none text-[#1a3152]">{played > 0 ? avgPoints : "–"}</span>
                  <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted">Ø Punkte</span>
                </>
              }
            />
            <dl className="grid grid-cols-3 gap-6 md:grid-cols-1 md:gap-3">
              {[
                ["Gelöst", String(played)],
                ["Punkte gesamt", String(points)],
                ["Ø Zeit / Fall", played > 0 ? fmtDauer(avgSeconds) : "–"],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{l}</dt>
                  <dd className="clinical-data text-[20px] font-bold text-[#1a3152]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <Rubrik>Nach Fachgebiet</Rubrik>
              {byDisc.length > 0 ? (
                <ul className="space-y-2.5">
                  {byDisc.map((g) => (
                    <li key={g.id} className="flex items-center gap-3">
                      <Ring percent={g.pct} color={accuracyColors(g.pct).bar} size={38} stroke={4} active={slide === 2} />
                      <span className="flex-1 text-[14px] font-semibold text-foreground">{g.label}</span>
                      <span className="clinical-data text-[13px] text-muted">
                        {g.pct}% · {g.n}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-muted">Noch keine Daten.</p>
              )}
            </div>
            <div>
              <Rubrik right={<Link href="/statistik" className="hover:text-foreground">Alle →</Link>}>Zuletzt gelöst</Rubrik>
              {recent.length > 0 ? (
                <ul>
                  {recent.map((r) => (
                    <li key={`${r.caseId}-${r.timestamp}`} className="flex items-center gap-3 border-b border-dotted border-foreground/20 py-2 text-[13.5px]">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: r.correct ? "#e7f6ec" : "#fdf1f0", color: r.correct ? "#15803d" : "#c0362c" }}
                      >
                        <i className={`ti ${r.correct ? "ti-check" : "ti-x"} text-[11px]`} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground/80">{discLabel(r.discipline)} · Klinik</span>
                      <span className="text-[12px] text-muted">{formatDatumKurz(r.timestamp)}</span>
                      <span className="clinical-data w-10 text-right font-bold text-[#1a3152]">+{r.score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-muted">Löse deinen ersten Fall – die Statistik füllt sich automatisch.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={startNow}
          className="group inline-flex items-center gap-2.5 rounded-full bg-[#1a3152] px-10 py-4 text-[16px] font-semibold text-white shadow-[0_18px_36px_-16px_rgba(26,49,82,0.8)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Fall starten
          <span className="text-white/55">· {discLabel(disc)}</span>
          <i className="ti ti-arrow-right text-[17px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const blaetter = [blattWillkommen, blattStart, blattProfil];

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] -mb-8 -mt-5 w-screen bg-[#ecebe6]">
      <header className="fixed inset-x-0 top-0 z-30 bg-[#1a3152] shadow-[0_8px_24px_-14px_rgba(15,23,42,0.6)]">
        <div className="mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 md:w-[min(1240px,calc((100vw-2.5rem)*0.86))] md:px-0">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Navigation öffnen"
              aria-expanded={drawerOpen}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="flex w-[18px] flex-col gap-[4px]" aria-hidden="true">
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setSlide(0);
            }}
            aria-label="Casolvo – Willkommen"
            className="col-start-2 flex items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 38, width: "auto" }} />
          </button>
          <div className="col-start-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSlide(2)}
              aria-label={profile ? "Profil & Statistik" : "Profil anlegen"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
              style={profile ? { backgroundColor: profile.avatarColor, color: "#1a3152", borderColor: "transparent" } : undefined}
            >
              {profile ? initialsOf(profile.name) : <i className="ti ti-user text-[16px]" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      {profileOpen && (
        <ProfileModal
          initial={profile}
          onClose={() => setProfileOpen(false)}
          onSave={(p) => {
            saveProfile(p);
            setProfile(p);
            setProfileOpen(false);
          }}
        />
      )}
      {/* Seitennavigation — wie im Spiel */}
      <div
        className={`fixed inset-0 z-40 bg-[#0b1626]/30 backdrop-blur-[2px] transition-opacity duration-500 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        inert={!drawerOpen}
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] max-w-[86vw] flex-col bg-[#fbfaf6] shadow-[24px_0_60px_-30px_rgba(15,23,42,0.5)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between bg-[#1a3152] px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 32, width: "auto" }} />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Navigation schließen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="ti ti-x text-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-1.5 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Startseite</p>
          <ul className="mb-7 space-y-0.5">
            {HOME_TITLES.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    setSlide(i);
                    setDrawerOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground ${slide === i ? "bg-[#1a3152]/[0.07] text-foreground" : ""}`}
                >
                  <span
                    className={`clinical-data flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-bold ${
                      slide === i ? "bg-[#1a3152] text-white" : "bg-foreground/[0.07] text-foreground/60"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {t}
                </button>
              </li>
            ))}
          </ul>
          <p className="mb-1.5 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Navigation</p>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  document.getElementById("methodik")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <i className="ti ti-certificate text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Methodik
              </button>
            </li>
            <li>
              <Link href="/statistik" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-chart-line text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Ausführliche Statistik
              </Link>
            </li>
            <li>
              <Link href="/ueber-uns" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-info-circle text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Über uns
              </Link>
            </li>
            <li>
              <Link href="/qa" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-help-circle text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Q&amp;A
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setProfileOpen(true);
                }}
                className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <i className="ti ti-user text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Profil
              </button>
            </li>
          </ul>
        </div>
        <div className="flex gap-4 border-t border-foreground/10 px-6 py-4 text-[12px] text-muted">
          <Link href="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link href="/impressum#datenschutz" className="hover:text-foreground">Datenschutz</Link>
        </div>
      </aside>

      {/* Erster Bildschirm: Karussell */}
      <div className="flex h-[100dvh] flex-col pt-16">
        <nav aria-label="Startseite" className="mx-auto mt-3 flex shrink-0 items-center rounded-full bg-foreground/[0.07] p-[3px]">
          {HOME_TITLES.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setSlide(i)}
              aria-current={slide === i ? "step" : undefined}
              className={`rounded-full px-4 py-[3px] text-[12.5px] font-semibold leading-5 transition-all duration-300 ${
                slide === i
                  ? "bg-white text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.16),0_0_0_0.5px_rgba(15,23,42,0.05)]"
                  : "text-foreground/50 hover:text-foreground/80"
              }`}
            >
              <span className={`clinical-data mr-1 ${slide === i ? "text-[#2f6fb0]" : "opacity-60"}`}>{i + 1}</span>
              <span className={slide === i ? "" : "hidden sm:inline"}>{t}</span>
            </button>
          ))}
        </nav>

        <div
          ref={stageRef}
          className="relative mt-3 min-h-0 w-full flex-1 overflow-x-clip"
          style={{ perspective: "2600px", perspectiveOrigin: "50% 45%" }}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (dx < -60) setSlide((v) => Math.min(2, v + 1));
            if (dx > 60) setSlide((v) => Math.max(0, v - 1));
            touchX.current = null;
          }}
        >
          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
            {blaetter.map((inhalt, i) => {
              const signed = i - slide;
              const d = Math.abs(signed);
              const active = d === 0;
              return (
                <div
                  key={i}
                  className="absolute bottom-2 top-0 motion-reduce:!transition-none"
                  style={{
                    left: "50%",
                    width: cardW,
                    marginLeft: -cardW / 2,
                    transform: coverTransform(signed),
                    transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                    zIndex: 10 - d,
                    backfaceVisibility: "hidden",
                  }}
                >
                  <div
                    inert={!active}
                    aria-hidden={!active}
                    className="h-full overflow-hidden rounded-[22px] border border-foreground/10 bg-[#fffefa] transition-[opacity,filter] duration-700"
                    style={{
                      opacity: active ? 1 : d === 1 ? 0.6 : 0.25,
                      filter: active ? "none" : "saturate(0.6)",
                      boxShadow: "0 50px 90px -50px rgba(15,23,42,0.55), 0 18px 36px -24px rgba(15,23,42,0.25)",
                    }}
                  >
                    {inhalt}
                  </div>
                  {!active && (
                    <button
                      type="button"
                      aria-label={`Zu ${HOME_TITLES[i]}`}
                      onClick={() => setSlide(i)}
                      className="absolute inset-0 cursor-pointer rounded-[22px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Vorheriges Blatt"
            onClick={() => setSlide((v) => Math.max(0, v - 1))}
            className={`absolute left-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-white/95 text-foreground shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] transition-opacity duration-300 md:left-4 ${
              slide === 0 ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Nächstes Blatt"
            onClick={() => setSlide((v) => Math.min(2, v + 1))}
            className={`absolute right-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-white/95 text-foreground shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] transition-opacity duration-300 md:right-4 ${
              slide === 2 ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <i className="ti ti-chevron-right text-xl" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => document.getElementById("methodik")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="mx-auto flex shrink-0 flex-col items-center py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-foreground"
        >
          Mehr zur Methodik
          <i className="ti ti-chevron-down animate-bounce text-[15px]" aria-hidden="true" />
        </button>
      </div>

      {/* Methodik */}
      <section id="methodik" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 pt-20 md:px-8">
        <div className="mb-8 text-center">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.24em] text-[#2f6fb0]">Methodik</p>
          <h2 style={fraunces} className="mt-2 text-[34px] leading-tight text-[#1a3152] md:text-[44px]">
            Geprüft, nicht generiert.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHODIK.map((m, i) => (
            <div
              key={m.title}
              className="rounded-[18px] border border-foreground/10 bg-[#fffefa] p-6 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)] transition-transform duration-300 hover:-translate-y-1"
            >
              <span style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }} className="text-[18px] font-semibold text-[#2f6fb0]/70">
                0{i + 1}
              </span>
              <p className="mt-3 text-[15px] font-bold text-foreground">{m.title}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/65">{m.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/ueber-uns" className="text-[14px] font-semibold text-[#1a3152] hover:underline">
            Ausführlich auf „Über uns“ →
          </Link>
        </div>
      </section>

      {/* Beim Scrollen: Monitor kippt auf */}
      <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-20 text-center md:px-8">
        <p
          className="text-[11.5px] font-bold uppercase tracking-[0.24em] text-[#2f6fb0] transition-all duration-700"
          style={{ opacity: monitorP, transform: `translateY(${(1 - monitorP) * 20}px)` }}
        >
          Hinweis
        </p>
        <h2
          style={{ ...fraunces, opacity: monitorP, transform: `translateY(${(1 - monitorP) * 30}px)` }}
          className="mt-2 text-[34px] leading-tight text-[#1a3152] md:text-[48px]"
        >
          Am besten am Mac oder Laptop.
        </h2>
        <p
          className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-foreground/65"
          style={{ opacity: monitorP, transform: `translateY(${(1 - monitorP) * 40}px)` }}
        >
          Die Akte mit Anamnese, Befunden und Diagnose entfaltet sich auf einem großen Bildschirm am besten. Am Smartphone
          geht&apos;s auch.
        </p>
        <div ref={monitorRef} className="mx-auto mt-12 max-w-[920px]" style={{ perspective: "1600px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/desktop-mockup-logo.png?v=3"
            alt="Casolvo am Desktop-Monitor"
            className="h-auto w-full will-change-transform"
            style={{
              transform: `rotateX(${(1 - monitorP) * 28}deg) scale(${0.82 + monitorP * 0.18}) translateY(${(1 - monitorP) * 60}px)`,
              transformOrigin: "50% 100%",
              opacity: 0.3 + monitorP * 0.7,
            }}
          />
        </div>
      </section>

      <footer className="border-t border-foreground/10">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[12.5px] text-muted md:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-casolvo-weiss.png" alt="" aria-hidden="true" className="h-6 w-auto rounded bg-[#1a3152] px-2 py-1" />
            <span>© 2026 Casolvo</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/news" className="hover:text-foreground">News</Link>
            <Link href="/ueber-uns" className="hover:text-foreground">Über uns</Link>
            <Link href="/qa" className="hover:text-foreground">Q&amp;A</Link>
            <Link href="/impressum" className="hover:text-foreground">Impressum</Link>
            <Link href="/impressum#datenschutz" className="hover:text-foreground">Datenschutz</Link>
            <KontaktPopover />
          </div>
        </div>
      </footer>
    </div>
  );
}

function formatDatumKurz(ts: number): string {
  const tage = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (tage === 0) return "heute";
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  return new Date(ts).toLocaleDateString("de-DE");
}

type CaseResultRow = ReturnType<typeof readCaseResults>[number];

// Ladeanimation (Local-Test 1, 13.10.2026, ruhige Fassung): Logo blendet
// weich ein, darunter füllt sich eine feine Linie. Kein Leuchten, kein EKG.
function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#1a3152]" role="status" aria-label="Fall wird geladen">
      <style>{`
        @keyframes cs-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes cs-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .cs-logo { opacity: 0; animation: cs-in 700ms cubic-bezier(0.22,1,0.36,1) 100ms forwards; }
        .cs-text { opacity: 0; animation: cs-in 600ms cubic-bezier(0.22,1,0.36,1) 400ms forwards; }
        .cs-bar { transform-origin: left; transform: scaleX(0); animation: cs-bar 1100ms cubic-bezier(0.65,0,0.35,1) 150ms forwards; }
        @media (prefers-reduced-motion: reduce) {
          .cs-logo, .cs-text { animation: none; opacity: 1; }
          .cs-bar { animation: none; transform: scaleX(1); }
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-casolvo-weiss.png" alt="Casolvo" className="cs-logo h-auto w-[min(280px,60vw)] opacity-90" />
      <div className="mt-9 h-px w-[min(220px,50vw)] overflow-hidden bg-white/15">
        <div className="cs-bar h-full w-full bg-white/60" />
      </div>
      <p className="cs-text mt-5 text-[12px] font-medium uppercase tracking-[0.24em] text-white/50">Fall wird vorbereitet</p>
    </div>
  );
}

const RELEVANCE_LABEL: Record<Relevance, string> = {
  tragend: "tragend",
  stuetzend: "stützend",
  abgrenzend: "abgrenzend",
  meist_irrelevant: "nicht zielführend",
};
const NIVEAU_LABEL: Record<"einfach" | "erfahren" | "experte", string> = {
  einfach: "Niveau Student",
  erfahren: "Niveau Assistenzarzt",
  experte: "Niveau Facharzt",
};

function resultTags(c: Case): string[] {
  const t: string[] = [];
  const cat = c.caseContext?.category;
  if (cat === "haeufig") t.push("Häufig");
  if (cat === "selten") t.push("Selten");
  if (c.niveau) t.push(NIVEAU_LABEL[c.niveau]);
  if (c.cannotMiss || cat === "cannot-miss") t.push("Cannot-miss");
  return t;
}

// v3-Notizen beginnen mit Metadaten-Prosa („Schwierigkeit: … Cannot-miss: ja.“),
// die jetzt als Tags erscheint — nur der inhaltliche Rest bleibt als Text.
function stripContextMeta(note?: string): string {
  if (!note) return "";
  return note
    .replace(/Schwierigkeit:[^.]*\.\s*/i, "")
    .replace(/Cannot-miss:\s*(ja|nein)\.?\s*/i, "")
    .trim();
}

// Abzüge > 10 (verpasster tragender Befund) rot, kleinere amber.
const MISSED_THRESHOLD = 10;

function DiagnostikBilanz({ rows, jokerDelta }: { rows: BilanzRow[]; jokerDelta: number }) {
  const cell = "py-1.5 pr-2";
  return (
    <div className="mt-4">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">Diagnostik</p>
      <table className="mt-1.5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-foreground/15 text-left text-[10px] uppercase tracking-[0.06em] text-foreground/55">
            <th className={`${cell} font-bold`}>Befund</th>
            <th className={`${cell} font-bold`}>Relevanz</th>
            <th className={`${cell} text-center font-bold`}>Angefordert</th>
            <th className="py-1.5 text-right font-bold">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-foreground/[0.07]">
              <td className={`${cell} font-semibold text-foreground`}>{r.label}</td>
              <td className={`${cell} ${r.relevance === "tragend" ? "font-semibold text-foreground" : "text-foreground/60"}`}>
                {r.relevance ? RELEVANCE_LABEL[r.relevance] : "–"}
              </td>
              <td className={`${cell} text-center text-foreground/75`}>{r.requested ? "✓" : "–"}</td>
              <td
                className={`clinical-data py-1.5 text-right font-bold ${
                  r.delta < -MISSED_THRESHOLD ? "text-[var(--wrong)]" : r.delta < 0 ? "text-[var(--step-2)]" : "text-foreground/35"
                }`}
              >
                {r.delta < 0 ? `−${-r.delta}` : "0"}
              </td>
            </tr>
          ))}
          {jokerDelta < 0 && (
            <tr className="border-b border-foreground/[0.07]">
              <td className={`${cell} font-semibold text-foreground`}>Oberarzt-Tipp</td>
              <td className={`${cell} text-foreground/60`}>–</td>
              <td className={`${cell} text-center text-foreground/75`}>✓</td>
              <td className="clinical-data py-1.5 text-right font-bold text-[var(--step-2)]">−{-jokerDelta}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
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
  const [expanded, setExpanded] = useState(false);
  // Ergebnis-Box auf eine Zeile einklappbar; Wahl wird über Fälle hinweg gemerkt.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("casolvo:resultCollapsed") === "1";
    } catch {
      return false;
    }
  });
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("casolvo:resultCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const isCorrect = lastResultCorrect;
  const animatedScore = lastScoreEarned;
  const accentColor = isCorrect ? "#15803d" : "#c0362c";
  const bgColor = isCorrect ? "#eef7ed" : "#fbeeed";
  const borderColor = isCorrect ? "rgba(21,128,61,0.4)" : "rgba(192,54,44,0.4)";


  const tags = resultTags(caseData);
  const contextRest = stripContextMeta(caseData.caseContext?.note);
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
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
            style={{
              backgroundColor: isCorrect ? "rgba(21,128,61,0.12)" : "rgba(192,54,44,0.12)",
              color: accentColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {isCorrect ? `+${animatedScore}` : "0"} Punkte
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              onClick={onNext}
              className="group flex items-center gap-1.5 rounded-full bg-[#1a3152] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-95"
            >
              Nächster Patient
              <i className="ti ti-arrow-right text-[13px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Ergebnis ausklappen" : "Ergebnis einklappen"}
              aria-expanded={!collapsed}
              className="flex h-8 w-8 items-center justify-center rounded-lg border-[1.5px] border-foreground/20 bg-white/60 text-foreground/70 transition-colors hover:border-foreground/40"
            >
              <i className={`ti ${collapsed ? "ti-chevron-up" : "ti-minus"} text-sm`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {!collapsed && (
        <div className="px-4 pb-3">
          <div className="mb-3 h-px bg-foreground/10" />
          {!isCorrect && caseData.correctDiagnosis && (
            <p className="mb-2.5 text-sm text-foreground/75">
              Richtig: <span className="font-bold text-foreground">{caseData.correctDiagnosis}</span>
            </p>
          )}
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-foreground/15 bg-white/60 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-foreground/65"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {caseData.keyTakeaway && (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">Kernaussage</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-foreground sm:text-sm">
                {caseData.keyTakeaway}
              </p>
            </>
          )}
          {caseData.bilanz && caseData.bilanz.length > 0 && (
            <DiagnostikBilanz rows={caseData.bilanz} jokerDelta={caseData.jokerDelta ?? 0} />
          )}
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleToggleDetails}
              aria-expanded={expanded}
              className="flex items-center gap-1.5 rounded-full border-[1.5px] border-foreground/20 bg-white/70 px-5 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-foreground/40"
            >
              {expanded ? "Erklärung ausblenden" : "Ausführliche Erklärung"}
              <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"} text-[12px]`} aria-hidden="true" />
            </button>
          </div>
        </div>
        )}
      </div>
      {/* Expanded details — fills remaining space below the header, scrolls if content overflows */}
      {expanded && !collapsed && (
        <div className="px-4 pb-4">
          <div className="mb-3 h-px bg-foreground/10" />

          {contextRest && (
            <p className="mb-4 text-[12.5px] leading-relaxed text-foreground/70">
              <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                Einordnung
              </span>
              {contextRest}
            </p>
          )}
          {caseData.explanation && (
            <div className="mb-4">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                Begründung · {caseData.correctDiagnosis}
              </p>
              <p className="text-[13.5px] leading-relaxed text-foreground/85">{caseData.explanation}</p>
            </div>
          )}
          {caseData.differentialNotes && caseData.differentialNotes.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground/60">
                Differentialdiagnosen
              </p>
              <ul className="mt-1 divide-y divide-foreground/10">
                {caseData.differentialNotes.map((n) => (
                  <li key={n.option} className="py-2.5">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      Warum nicht {n.option}?
                      {n.option === selectedDiagnosis && (
                        <span className="ml-2 rounded border border-[var(--wrong)]/40 px-1.5 py-px align-middle text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--wrong)]">
                          deine Wahl
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/75">{n.whyNot}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback läuft jetzt über ein Overlay NACH dem Fall (PostCaseFeedback),
              nicht mehr eingebettet — verdeckte sonst die aufklappende Karte. */}

          <div className="flex justify-center pt-2">
            <button
              onClick={onNext}
              className="group flex items-center gap-2 rounded-full bg-[#1a3152] px-8 py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(26,49,82,0.7)] transition-[transform,opacity] duration-200 hover:opacity-95 active:scale-[0.98]"
            >
              Nächster Patient
              <i className="ti ti-arrow-right text-[15px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
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
    ? "bg-[var(--step-2-dot)] text-white"
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
type FindingKey =
  | "examination"
  | "auskultation"
  | "labs"
  | "ekg"
  | "eeg"
  | "imaging"
  | "konsil"
  | "oberarzt";

function LabTable({ labs }: { labs: LabCategory[] }) {
  // Fix 08.10.2026: v3-Fälle betten die Einheit in `value` ein ("29 mmHg") —
  // die Einheit-Spalte war dort immer komplett leer. Jetzt nur noch, wenn
  // mindestens ein Wert eine separate Einheit hat (Altfälle). Feste
  // Spaltenbreiten, damit Wert/Referenz über alle Laborgruppen fluchten.
  const hasUnits = labs.some((cat) => (cat.values ?? []).some((v) => v.unit?.trim()));
  return (
    <div className="flex flex-col gap-4">
      {labs.map((cat) => (
        <div key={cat.category}>
          <p className="mb-1.5 text-[13px] font-bold">{cat.category}</p>
          <table className="clinical-data w-full table-fixed text-[13px]">
            <thead>
              <tr className="border-b border-card-border/15 text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                <th className={`pb-1 pr-4 font-bold ${hasUnits ? "w-[38%]" : "w-[44%]"}`}>Parameter</th>
                <th className={`pb-1 pr-4 font-bold ${hasUnits ? "w-[22%]" : "w-[28%]"}`}>Wert</th>
                {hasUnits && <th className="w-[14%] pb-1 pr-4 font-bold">Einheit</th>}
                <th className="pb-1 font-bold">Referenz</th>
              </tr>
            </thead>
            <tbody>
              {(cat.values ?? []).map((v) => (
                <tr key={v.name} className="border-b border-card-border/[0.07] last:border-0">
                  <td className="py-1.5 pr-4 font-sans font-medium">{v.name}</td>
                  <td
                    className={`py-1.5 pr-4 font-semibold ${
                      v.flag === "high" ? "text-[#b91c1c]" : v.flag === "low" ? "text-[#1d4ed8]" : ""
                    }`}
                  >
                    {v.value}
                    {v.flag === "high" && <span className="ml-1 font-extrabold">↑</span>}
                    {v.flag === "low" && <span className="ml-1 font-extrabold">↓</span>}
                  </td>
                  {hasUnits && <td className="py-1.5 pr-4 text-muted">{v.unit}</td>}
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

function joinDe(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

type VerlaufStep = {
  key: string;
  tone: "s1" | "s2" | "s3";
  title: string;
  detail: string;
  lines?: { label?: string; value: string; extra?: string }[];
  extra?: string;
  tint?: "correct" | "wrong";
  state: "done" | "now" | "idle";
  onClick: () => void;
};

function VerlaufInsel({
  steps,
  caseId,
  difficulty,
}: {
  steps: VerlaufStep[];
  caseId: string;
  difficulty: Difficulty;
}) {
  const current = steps.find((st) => st.state === "now") ?? steps[steps.length - 1];
  return (
    <div className="card px-5 py-5">
      <p className="mb-5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">Verlauf</p>

      {/* Mobil: nur der aktuelle Stand in einer Zeile */}
      <p className="text-[13px] md:hidden">
        <span className="font-semibold">{current.title}:</span> <span className="text-muted">{current.detail}</span>
      </p>

      {/* Desktop: nummerierte Liste, Details je Zeile */}
      <ul className="hidden space-y-6 md:block">
        {steps.map((st, i) => (
          <li key={st.key} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={`w-4 shrink-0 text-[14px] leading-snug ${st.state === "idle" ? "text-muted/70" : "font-semibold text-foreground"}`}
            >
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={st.onClick} className="block w-full text-left">
                <span className={`block text-[14px] leading-snug ${st.state === "idle" ? "font-medium text-muted" : "font-bold"}`}>
                  {st.title}
                </span>
              </button>
              {st.lines && st.lines.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {st.lines.map((ln) => (
                    <li key={`${ln.label ?? ""}${ln.value}`} className="flex items-baseline justify-between gap-2 text-[13px] leading-snug">
                      <span className="min-w-0">
                        {ln.label && <span className="text-muted">{ln.label}: </span>}
                        <span className={ln.label ? "font-medium text-foreground" : "text-foreground/90"}>{ln.value}</span>
                      </span>
                      {ln.extra && <span className="clinical-data shrink-0 text-xs font-bold text-[var(--step-2)]">{ln.extra}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <span
                  className={`mt-1 block text-[13px] leading-snug ${
                    st.tint === "correct"
                      ? "font-semibold text-[var(--correct)]"
                      : st.tint === "wrong"
                      ? "font-semibold text-[var(--wrong)]"
                      : "text-muted"
                  }`}
                >
                  {st.detail}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ReportCaseCard caseId={caseId} difficulty={difficulty} embedded />
    </div>
  );
}

function BefundeAnfordern({
  rows,
  picks,
  onToggle,
  onSubmit,
  showPrices,
}: {
  showPrices: boolean;
  rows: { key: FindingKey; label: string; state: "open" | "locked" | "unavailable" }[];
  picks: FindingKey[];
  onToggle: (key: FindingKey) => void;
  onSubmit: () => void;
}) {
  const total = picks.length * INVESTIGATION_COST;
  return (
    <section
      id="akte-befunde"
      className="overflow-hidden rounded-[14px] border-[1.5px] border-l-[3px] border-card-border/12 border-l-[var(--step-2-dot)] bg-card shadow-[0_-10px_30px_-16px_rgba(15,15,15,0.3)]"
    >
      <div className="flex items-center gap-2.5 px-4 pt-3 text-[13.5px] font-bold">
        <StepDot tone="s2">2</StepDot>
        <span>Befunde anfordern</span>
        <span className="ml-auto text-xs font-medium text-muted">
          {showPrices ? (
            <>
              je <span className="clinical-data font-bold text-[var(--step-2)]">−{INVESTIGATION_COST}</span>
            </>
          ) : (
            "Bewertung nach Abgabe"
          )}
        </span>
      </div>
      {/* Update 01.10.2026: Button nicht mehr Teil desselben Grids wie die
          Kategorie-Kacheln (Spalten-Trick war fest auf 3 Kategorien
          ausgelegt) — skaliert jetzt unabhängig von der Zeilenanzahl
          (bis zu 7 Kategorien bei v3-Fällen statt vorher 3). */}
      <div className="px-4 pb-3 pt-2.5">
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
          {rows.map((row) => {
            const on = picks.includes(row.key);
            const off = row.state === "unavailable";
            return (
              <button
                key={row.key}
                type="button"
                disabled={off}
                aria-pressed={on}
                onClick={() => onToggle(row.key)}
                className={`flex items-center gap-2 rounded-lg border-[1.5px] px-3 py-2 text-left text-[13.5px] font-semibold transition-colors ${
                  off
                    ? "cursor-not-allowed border-dashed border-card-border/20 text-muted/60"
                    : on
                    ? "border-[var(--step-2-dot)] bg-[var(--step-2-dot-tint)]"
                    : "border-card-border/20 bg-card hover:border-[var(--step-2-dot)]"
                }`}
              >
                <i
                  className={`ti ${on ? "ti-square-check" : "ti-square"} text-[17px] ${on ? "text-[var(--step-2-dot)]" : "text-muted/60"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="ml-auto hidden text-xs sm:inline">
                  {off ? (
                    <span className="font-medium">n. v.</span>
                  ) : showPrices ? (
                    <span className="clinical-data font-bold text-[var(--step-2)]">−{INVESTIGATION_COST}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="mt-2 w-full whitespace-nowrap rounded-lg bg-accent px-5 py-2.5 text-[14px] font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
        >
          {picks.length > 0 ? (
            <>
              Befunde anfordern{" "}
              <span className="ml-1 font-semibold opacity-80">{showPrices ? `−${total}` : `(${picks.length})`}</span>
            </>
          ) : (
            "Ohne Befunde zur Diagnose"
          )}
        </button>
      </div>
    </section>
  );
}

function AufnahmeAkte({
  caseData,
  open,
  onToggle,
  fixed = false,
}: {
  caseData: Case;
  open: boolean;
  onToggle: () => void;
  fixed?: boolean;
}) {
  // Aufnahme + Anamnese als eine Akte, beim Fallstart offen und im Fokus.
  // Oben der Patientenkopf wie auf der Papierakte, darunter Vorstellungsgrund
  // und Anamnese nebeneinander — die volle Breite wird genutzt, die Karte bleibt niedrig.
  const ageLabel = caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`;
  const genderLabel = caseData.gender === "male" ? "männlich" : "weiblich";
  // Kompakte Kernfelder (immer kurz, immer sichtbar) getrennt von den
  // variablen Detailfeldern — Update 06.10.2026: eine lange Vorerkrankung
  // sprengte vorher die 4-Spalten-Grid-Zelle und schob Anamnese unlesbar
  // weit nach unten. Leere Detailfelder werden jetzt komplett weggelassen
  // statt als "—" Platz zu beanspruchen.
  const coreFields: [string, string][] = [
    ["Name", caseData.patientName],
    ["Alter", ageLabel],
    ["Geschlecht", genderLabel],
    ["Beruf", caseData.occupation?.trim() || "—"],
  ];
  const detailFields: [string, string][] = [
    ["Familie", caseData.family?.trim() || ""],
    ["Vorerkrankungen", caseData.preExisting?.trim() || ""],
    ["Allergien", caseData.allergies?.trim() || ""],
    ["Alkohol & Drogen", caseData.substanceHistory?.trim() || ""],
    ["Medikamente", caseData.medications?.trim() || ""],
  ].filter(([, value]) => value.length > 0) as [string, string][];

  return (
    <section
      id="akte-aufnahme"
      className="overflow-hidden rounded-[14px] border-[1.5px] border-l-[3px] border-card-border/12 border-l-[var(--step-1)] bg-card"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-[11px] text-left text-[13.5px] font-bold"
      >
        <StepDot tone="s1">1</StepDot>
        <span className="shrink-0">Aufnahme &amp; Anamnese</span>
        {!open && (
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted">
            <span className="avatar-circle h-6 w-6 shrink-0 text-[10px]" style={{ backgroundColor: avatarColorForCase(caseData.id) }}>
              {initials(caseData.patientName)}
            </span>
            <span className="truncate">{caseData.patientName}, {ageLabel}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="clinical-data text-xs font-bold text-[var(--step-1)]">inkl.</span>
          {!fixed && (
            <>
              <span className="hidden text-xs font-semibold text-muted sm:inline">{open ? "Einklappen" : "Anzeigen"}</span>
              <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} text-base text-muted/70`} aria-hidden="true" />
            </>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t-[1.5px] border-card-border/10 px-4 pb-4 pt-3 md:px-6">
          {/* Patientenkopf: kompakte Kernzeile (immer kurz) — Update 07.10.2026:
              insgesamt deutlich kompakter (kleinerer Avatar, engere Abstände),
              damit Vorstellungsgrund/Anamnese weiter oben sichtbar sind. */}
          <div className={`flex items-center gap-3 pb-2.5 ${detailFields.length === 0 ? "border-b border-card-border/10" : ""}`}>
            <div
              className="avatar-circle h-9 w-9 shrink-0 text-sm"
              style={{ backgroundColor: avatarColorForCase(caseData.id) }}
            >
              {initials(caseData.patientName)}
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {coreFields.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] font-semibold text-muted">{label}:</dt>
                  <dd className="break-words text-[14px] font-semibold leading-[1.25]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Detailfelder: nur vorhandene, je eine eigene volle Zeile statt
              in der Grid-Zelle gequetscht — leere Felder (Familie/Medikamente
              bei den meisten Fällen) tauchen gar nicht erst auf. Engere
              Zeilenabstände + schmalere Label-Spalte (weniger Umbruch). */}
          {detailFields.length > 0 && (
            <dl className="space-y-1 border-b border-card-border/10 pb-2.5">
              {detailFields.map(([label, value]) => (
                <div key={label} className="grid gap-x-4 sm:grid-cols-[110px_1fr]">
                  <dt className="text-[11px] font-semibold text-muted">{label}:</dt>
                  <dd className="text-[13px] leading-[1.35] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Update 07.10.2026 (Sergio): Vorstellungsgrund + Anamnese gestapelt
              statt 2-spaltig — volle Kartenbreite bedeutet weniger Zeilenumbrüche
              pro Text, also insgesamt weniger Höhe trotz gleichem Inhalt. */}
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">Vorstellungsgrund</p>
              <blockquote className="mt-1.5 border-l-2 border-[var(--step-1)] pl-4 text-[16px] font-medium italic leading-[1.4] text-foreground">
                „{caseData.chiefComplaint}“
              </blockquote>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">Anamnese</p>
              {caseData.anamnese && caseData.anamnese.length > 0 ? (
                <div className="mt-1.5 divide-y divide-card-border/10">
                  {caseData.anamnese.map((sec) => (
                    <div key={sec.label} className="grid gap-x-6 gap-y-0.5 py-1.5 first:pt-0 sm:grid-cols-[150px_1fr]">
                      <span className="text-[13px] font-semibold text-muted">{sec.label}</span>
                      <span className="whitespace-pre-line text-[14.5px] leading-[1.45] text-foreground">{sec.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.45] text-foreground">{caseData.history}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AkteSection({
  tone,
  number,
  title,
  state,
  cost,
  price = INVESTIGATION_COST,
  late = false,
  showPrice = true,
  onRequest,
  anchorId,
  children,
}: {
  anchorId?: string;
  tone: "s1" | "s2";
  number: string;
  title: string;
  state: "open" | "locked" | "unavailable";
  cost: "inkl" | "charged" | "free";
  price?: number;
  late?: boolean;
  showPrice?: boolean;
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
              ? "border-[var(--step-2-dot)] text-[var(--step-2-dot)] group-hover:bg-[var(--step-2-dot)] group-hover:text-white"
              : "border-card-border/30 text-muted group-hover:border-accent group-hover:text-accent"
          }`}
          aria-hidden="true"
        >
          <i className="ti ti-plus" />
        </span>
      ) : (
        <StepDot tone={tone} idle={!open} small={!number}>
          {number}
        </StepDot>
      )}
      <span className={clickable ? "transition-colors group-hover:text-foreground" : undefined}>
        {title}
        {clickable && <span className="font-semibold text-muted">{late ? " nachträglich anfordern" : " anfordern"}</span>}
      </span>
      <span className="ml-auto flex items-center">
        {open && cost === "inkl" && <span className="clinical-data text-xs font-bold text-[var(--step-1)]">inkl.</span>}
        {open && cost === "charged" && showPrice && <span className="clinical-data text-xs font-bold text-[var(--step-2)]">−{price}</span>}
        {open && cost === "free" && <span className="text-xs font-medium text-muted">nachträglich eingesehen</span>}
        {state === "unavailable" && (
          <span className="text-xs font-medium text-muted/70">für diesen Fall nicht verfügbar</span>
        )}
        {clickable && showPrice && (
          <span
            className={`clinical-data text-xs font-bold ${
              paid ? "text-[var(--step-2)]" : "text-muted"
            }`}
          >
            {paid ? `−${price}` : "kostenlos"}
          </span>
        )}
      </span>
    </>
  );

  if (clickable) {
    return (
      <button
        id={anchorId}
        type="button"
        onClick={onRequest}
        className={`group flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-4 py-[11px] text-left text-[13.5px] font-bold text-muted transition-colors ${
          paid
            ? "border-card-border/25 hover:border-[var(--step-2-dot)] hover:bg-[var(--step-2-dot-tint)]"
            : "border-card-border/25 hover:border-accent hover:bg-accent/[0.05]"
        }`}
      >
        {head}
      </button>
    );
  }

  return (
    <section
      id={anchorId}
      className={`scroll-mt-4 overflow-hidden rounded-[14px] border-[1.5px] ${
        open
          ? `border-l-[3px] border-card-border/12 bg-card ${
              tone === "s1" ? "border-l-[var(--step-1)]" : "border-l-[var(--step-2-dot)]"
            }`
          : "border-dashed border-card-border/20 bg-transparent"
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

const SLIDE_TITLES = ["Anamnese", "Befunde", "Diagnose"];

// Hintergrund-Varianten zum Vergleichen: ?bg=a … ?bg=e (Standard: siehe BG_DEFAULT)
const BG_VARIANTS: Record<string, React.CSSProperties> = {
  // A — Pearl flach (Markenfarbe aus BRAND.md)
  a: { background: "#faf8f3" },
  // B — Grau-Weiß-Verlauf (Stand 15:34)
  b: {
    background:
      "radial-gradient(1100px 620px at 50% 8%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%), radial-gradient(900px 700px at 100% 100%, rgba(203,209,218,0.55) 0%, rgba(203,209,218,0) 70%), radial-gradient(800px 600px at 0% 90%, rgba(214,219,227,0.5) 0%, rgba(214,219,227,0) 70%), linear-gradient(180deg, #f3f4f6 0%, #e7e9ed 100%)",
  },
  // C — Pearl-Grau mit feinem Punktraster (Millimeterpapier-Anmutung)
  c: {
    backgroundColor: "#efede7",
    backgroundImage: "radial-gradient(rgba(21,32,43,0.12) 1px, transparent 1.2px)",
    backgroundSize: "22px 22px",
  },
  // D — kühles Schiefer mit leichtem Cerulean-Licht von oben
  d: {
    background:
      "radial-gradient(1200px 520px at 50% -6%, rgba(23,94,143,0.10) 0%, rgba(23,94,143,0) 70%), linear-gradient(180deg, #eef1f4 0%, #e2e7ec 100%)",
  },
  // E — warmes Steingrau, flach (Pearl-Familie, eine Stufe dunkler)
  e: { background: "#ecebe6" },
};
const BG_DEFAULT = "e";
const BLATT_TITLES = ["Anamnesebogen", "Anordnungen & Befunde", "Arbeitsdiagnose"];

function Barcode({ seed }: { seed: string }) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < 44; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    bars.push(1 + ((h >>> 27) % 3));
  }
  return (
    <div aria-hidden="true" className="flex h-8 items-stretch justify-end gap-[1.5px]">
      {bars.map((w, i) => (
        <span key={i} className={i % 2 === 0 ? "bg-foreground/85" : ""} style={{ width: w }} />
      ))}
    </div>
  );
}

function Rubrik({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-foreground/25 pb-1.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/70">{children}</h3>
      {right && <span className="text-[11.5px] font-medium text-muted">{right}</span>}
    </div>
  );
}

function FeldZeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b border-dotted border-foreground/20 py-2.5 sm:grid-cols-[180px_1fr]">
      <dt className="text-[12.5px] font-semibold text-muted">{label}</dt>
      <dd className="text-[15px] leading-[1.6] text-foreground">{children}</dd>
    </div>
  );
}

function AkteBlatt({
  caseData,
  blatt,
  children,
  footer,
}: {
  caseData: Case;
  blatt: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ageLabel = caseData.age === 0 ? "Neugeboren" : `${caseData.age} J.`;
  const gender = caseData.gender === "male" ? "männlich" : "weiblich";
  const datum = new Date().toLocaleDateString("de-DE");
  return (
    <div className="@container relative flex h-full flex-col">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b-2 border-foreground/80 px-6 pb-3.5 pt-5 md:px-10">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Innere Medizin · Patientenakte</p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-[24px] font-semibold leading-tight text-foreground md:text-[27px]">
            {BLATT_TITLES[blatt - 1]}
          </h2>
        </div>
        {/* Patientenetikett: bricht bei schmalen Fenstern in eine eigene Zeile um, nichts wird abgeschnitten */}
        <dl className="order-last flex w-full flex-wrap gap-x-7 gap-y-2 @5xl:order-none @5xl:w-auto @5xl:flex-1 @5xl:border-l @5xl:border-foreground/15 @5xl:pl-8">
          {[
            ["Name", caseData.patientName],
            ["Alter", ageLabel],
            ["Geschlecht", gender],
            ["Aufnahme", datum],
            ["Blatt", `${blatt} / 3`],
          ].map(([l, v]) => (
            <div key={l} className="shrink-0">
              <dt className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">{l}</dt>
              <dd className="clinical-data whitespace-nowrap text-[13.5px] font-semibold text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="ml-auto hidden shrink-0 sm:block">
          <Barcode seed={caseData.id} />
          <p className="clinical-data mt-1 text-right text-[9.5px] tracking-[0.16em] text-muted">
            FALL {caseData.id.toUpperCase()}
          </p>
        </div>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto px-6 pt-6 md:px-10 md:pt-7 ${footer ? "pb-28" : "pb-7"}`}>{children}</div>
      {footer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-foreground/10 bg-white/85 p-1.5 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45),0_2px_6px_-2px_rgba(15,23,42,0.12)] backdrop-blur-md">
            {footer}
          </div>
        </div>
      )}
    </div>
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
  onRevealCategories,
  revealedAtSubmit,
  lateFindings,
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
  onRevealCategories: (keys: FindingKey[]) => Promise<void>;
  revealedAtSubmit: Revealed;
  lateFindings: FindingKey[];
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
  const isResult = phase === "result";
  const revealCount = Object.values(revealed).filter(Boolean).length;
  const possiblePoints = Math.max(BASE_SCORE - investigationCost(revealed, lateFindings), MIN_SCORE);
  const imagingAvailable = caseData.imagingAvailable;
  // v3-Fälle (mit niveau) werden nach Relevanz bewertet — Preise vorab
  // würden die Bewertung verraten, deshalb keine Punkteangaben während des Falls.
  const relevanzModus = Boolean(caseData.niveau);

  const [pending, setPending] = useState<string | null>(null);
  // Diagnose-Insel: auf schmalen Screens eingeklappt (sonst frisst sie die
  // halbe Höhe), auf dem Desktop offen.
  const [diagOpen, setDiagOpen] = useState(false);
  // Aufnahme & Anamnese: beim Fallstart offen und dominant (Lese-Modus);
  // eingeklappt rückt die Diagnose-Insel nach und die Befunde bekommen Platz.
  const [aufnahmeOpen, setAufnahmeOpen] = useState(true);
  // Anforderung als Bündel: erst Befunde auswählen, dann einmal anfordern.
  // Danach klappt die Aufnahme zusammen und die Befunde stehen offen darunter.
  const [orderDone, setOrderDone] = useState(false);
  const [picks, setPicks] = useState<FindingKey[]>([]);
  // Local-Test 1: Folien-Navigation (0 Anamnese · 1 Befunde · 2 Diagnose)
  const [slide, setSlide] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const [activeFinding, setActiveFinding] = useState<FindingKey | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bgStyle = BG_VARIANTS[BG_DEFAULT];
  const [stageW, setStageW] = useState(1200);
  const touchX = useRef<number | null>(null);
  useTrackpadSwipe(stageRef, setSlide, 2);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // Update 07.10.2026 (Sergio): Avatar statt "..."-Menü im Spiel-Header —
  // dasselbe lokale Profil wie auf der Hero-Seite (ProfileCorner).
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    setPending(null);
    setMenuOpen(false);
    setDiagOpen(false);
    setAufnahmeOpen(true);
    setOrderDone(false);
    setPicks([]);
    setSlide(0);
    setActiveFinding(null);
    window.scrollTo({ top: 0 });
    // Ab md scrollt nicht das Fenster, sondern die Akte-Spalte selbst.
    document.getElementById("akte-scroll")?.scrollTo({ top: 0 });
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") setSlide((v) => Math.min(2, v + 1));
      if (e.key === "ArrowLeft") setSlide((v) => Math.max(0, v - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleAufnahme() {
    setAufnahmeOpen((v) => !v);
  }

  function togglePick(key: FindingKey) {
    setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  async function submitOrder() {
    if (picks.length > 0) {
      await onRevealCategories(picks);
    }
    setOrderDone(true);
    if (picks.length === 0) setSlide(2);
    else setActiveFinding(picks[0]);
    // Fix 08.10.2026 (Sergio): Aufnahme bleibt nach dem Anfordern offen —
    // Anamnese muss beim Lesen der Befunde erreichbar bleiben (manuell
    // einklappbar). Stattdessen zu den neuen Befunden scrollen; scrollIntoView
    // funktioniert auch in der eigenen Scroll-Spalte (window.scrollTo nicht).
    setDiagOpen(true);
  }

  // Nach der Bestellung zu den Befunden scrollen — als Effect, damit es erst
  // NACH dem Rendern von #akte-befunde passiert (rAF war mobil zu früh).
  useEffect(() => {
    if (orderDone && !isResult) scrollToId("akte-befunde");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderDone]);

  async function reveal(key: FindingKey) {
    if (revealed[key]) return;
    // Nach der ersten Bestellung (und vor der Abgabe) ist jede weitere Anforderung "nachträglich" = teurer.
    // Der Oberarzt-Joker hat einen fixen Preis (siehe OBERARZT_COST), nie "nachträglich" verteuert.
    await onRevealCategories([key]);
    setActiveFinding(key);
    // Fix 08.10.2026: neuer Befund öffnet sich sonst unten hinter der
    // Diagnose-Insel, ohne dass man es merkt.
    requestAnimationFrame(() => scrollToId(`akte-${key}`));
  }
  function priceOf(key: FindingKey): number {
    if (key === "oberarzt") return OBERARZT_COST;
    return INVESTIGATION_COST;
  }

  // Kosten-Logik für eine Befundzeile: vor dem Abgeben kostet jeder Befund,
  // danach ist Einsehen kostenlos — berechnet wurde nur, was bei Abgabe offen war.
  function costOf(key: FindingKey): "charged" | "free" {
    if (isResult) return revealedAtSubmit[key] ? "charged" : "free";
    return "charged";
  }
  // Update 01.10.2026 — v3: Verfügbarkeit generisch aus den vom Server
  // gelieferten *Available-Flags statt nur für "imaging" hart codiert.
  // Bei Altfällen sind die 4 neuen Flags immer false/undefined -> "unavailable",
  // was korrekt ist (diese Kategorien existieren dort schlicht nicht).
  const availability: Partial<Record<FindingKey, boolean>> = {
    imaging: imagingAvailable,
    auskultation: Boolean(caseData.auskultationAvailable),
    ekg: Boolean(caseData.ekgAvailable),
    eeg: Boolean(caseData.eegAvailable),
    konsil: Boolean(caseData.konsilAvailable),
  };
  function stateOf(key: FindingKey): "open" | "locked" | "unavailable" {
    if (availability[key] === false) return "unavailable";
    return revealed[key] ? "open" : "locked";
  }

  function findingContent(key: FindingKey): React.ReactNode {
    if (key === "labs") return <LabTable labs={caseData.labs ?? []} />;
    const text: Partial<Record<FindingKey, string | undefined>> = {
      examination: caseData.examination,
      auskultation: caseData.auskultation,
      ekg: caseData.ekg,
      eeg: caseData.eeg,
      imaging: caseData.imaging,
      konsil: caseData.konsil,
      oberarzt: caseData.oberarzt,
    };
    return <div className="whitespace-pre-line text-[14.5px] leading-relaxed text-foreground/90">{text[key]}</div>;
  }

  const BASE_ROWS: FindingKey[] = ["examination", "auskultation", "labs", "ekg", "eeg", "imaging", "konsil"];
  const paidRevealedCount = BASE_ROWS.filter((k) => revealed[k]).length;
  // Oberarzt-Joker: eigene Gating-Logik (frühestens nach ≥1 eingesehenem
  // Befund, siehe CASE_SCHEMA_V3.md "Sichtbarkeits-Tabelle") — deshalb nicht
  // Teil von `stateOf`/`rows`, sondern separat behandelt.
  function oberarztState(): "open" | "locked" | "unavailable" {
    if (!caseData.oberarztAvailable) return "unavailable";
    if (revealed.oberarzt) return "open";
    return paidRevealedCount >= 1 ? "locked" : "unavailable";
  }

  const rows: { key: FindingKey; label: string }[] = [
    { key: "examination", label: "Untersuchung" },
    { key: "auskultation", label: "Auskultation" },
    { key: "labs", label: "Labor" },
    { key: "ekg", label: "EKG" },
    { key: "eeg", label: "EEG" },
    { key: "imaging", label: "Bildgebung" },
    { key: "konsil", label: "Konsil" },
  ];

  // Verlauf (linke Insel): Aufnahme → Befunde angefordert → eingesehen → Diagnose
  const ordered = orderDone || isResult;
  const asked = rows.filter((r) => (isResult ? revealedAtSubmit[r.key] : revealed[r.key]));
  const previewPicks = rows.filter((r) => picks.includes(r.key));
  const ageText = caseData.age === 0 ? "Neugeboren" : `${caseData.age} Jahre`;
  function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const verlaufSteps: VerlaufStep[] = [
    {
      key: "aufnahme",
      tone: "s1",
      title: "Aufnahme",
      detail: `${caseData.patientName}, ${ageText}`,
      // Update 06.10.2026: leere Detailfelder (Familie/Medikamente bei den
      // meisten Fällen) werden in der Sidebar weggelassen statt als "—"
      // Zeile zu erscheinen; Vorerkrankungen/Allergien/Alkohol&Drogen laufen
      // als eigene Zeilen statt in einem Fließtext-Block (siehe AufnahmeAkte).
      lines: [
        { label: "Name", value: caseData.patientName },
        { label: "Alter", value: ageText },
        { label: "Beruf", value: caseData.occupation?.trim() || "—" },
        { label: "Familie", value: caseData.family?.trim() || "" },
        { label: "Vorerkrankungen", value: caseData.preExisting?.trim() || "" },
        { label: "Allergien", value: caseData.allergies?.trim() || "" },
        { label: "Alkohol & Drogen", value: caseData.substanceHistory?.trim() || "" },
        { label: "Medikamente", value: caseData.medications?.trim() || "" },
      ].filter((l) => l.value.length > 0),
      state: !ordered && picks.length === 0 ? "now" : "done",
      onClick: () => setSlide(0),
    },
    {
      key: "angefordert",
      tone: "s2",
      title: "Befunde angefordert",
      detail: ordered
        ? asked.length > 0
          ? joinDe(asked.map((r) => r.label))
          : "keine"
        : previewPicks.length > 0
        ? `Auswahl: ${joinDe(previewPicks.map((r) => r.label))}`
        : "noch offen",
      lines: [
        ...(ordered ? asked : previewPicks).map((r) => ({
          value: r.label,
          extra: relevanzModus ? undefined : `−${INVESTIGATION_COST}`,
        })),
        // Fix 08.10.2026: Oberarzt-Joker fehlte in der Liste, obwohl er −40 kostet.
        ...((isResult ? revealedAtSubmit.oberarzt : revealed.oberarzt)
          ? [{ value: "Oberarzt-Tipp", extra: `−${OBERARZT_COST}` }]
          : []),
      ],
      state: ordered ? "done" : picks.length > 0 ? "now" : "idle",
      onClick: () => setSlide(1),
    },
    {
      key: "diagnose",
      tone: "s3",
      title: "Diagnose",
      detail: isResult
        ? lastResultCorrect
          ? `Richtig · +${lastScoreEarned} Punkte`
          : "Falsch · 0 Punkte"
        : pending !== null
        ? "Antwort gewählt"
        : diagOpen && orderDone
        ? "wird gestellt"
        : "offen",
      tint: isResult ? (lastResultCorrect ? "correct" : "wrong") : undefined,
      state: isResult ? "done" : pending !== null || (diagOpen && orderDone) ? "now" : "idle",
      onClick: () => setSlide(2),
    },
  ];

  return (
    <div>
      {/* Header = Statusleiste. Update 07.10.2026 (Sergio): von sticky auf
          fixed umgestellt — sticky lag innerhalb des scrollenden Dokuments und
          wanderte beim Erreichen des oberen Endes sichtbar mit (Zusammenspiel
          mit den negativen Rändern, die vorher das Eltern-Padding ausglichen).
          fixed positioniert strikt relativ zum Viewport, bewegt sich nie mehr.
          Der direkt folgende Spacer-Div gleicht die fehlende Flow-Höhe aus. */}
      <header className="fixed inset-x-0 top-0 z-30 bg-[#1a3152] px-4 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.6)] md:px-10">
        <div className="mx-auto flex h-16 w-full items-center gap-3 md:w-[min(1480px,calc((100vw-5rem)*0.9))] md:gap-5">
          {/* Marke + Kontext */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Navigation öffnen"
              aria-expanded={drawerOpen}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="flex w-[18px] flex-col gap-[4px]" aria-hidden="true">
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
                <span className="h-[1.5px] w-full rounded-full bg-current" />
              </span>
            </button>
            <button onClick={onGoHome} className="flex items-center transition-opacity hover:opacity-75" aria-label="Zur Startseite">
              {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 34, width: "auto" }} />
            </button>
            <span className="hidden h-5 w-px bg-white/20 lg:block" aria-hidden="true" />
            <span className="hidden whitespace-nowrap text-[13px] text-white/60 lg:inline">
              <span className="font-semibold text-white/90">{difficultyLabel}</span> · {disciplineLabel}
            </span>
          </div>

          <div className="flex-1" />

          {/* Stand + Profil */}
          <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden items-baseline gap-4 sm:flex">
              {played > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/55">Richtig</span>
                  <span className="clinical-data text-[16px] font-bold text-[#8fd19e]">
                    {solved}
                    <span className="text-white/40">/{played}</span>
                  </span>
                </span>
              )}
              <span className="flex items-baseline gap-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/55">Punkte</span>
                <span className="clinical-data text-[16px] font-bold text-white">{score}</span>
              </span>
            </div>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setProfileModalOpen(true)}
                aria-label={profile ? "Profil" : "Profil anlegen"}
                aria-expanded={menuOpen}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                style={profile ? { backgroundColor: profile.avatarColor, color: "#1a3152", borderColor: "transparent" } : undefined}
              >
                {profile ? initialsOf(profile.name) : <i className="ti ti-user text-base" aria-hidden="true" />}
              </button>
              {profileModalOpen && (
                <ProfileModal
                  initial={profile}
                  onClose={() => setProfileModalOpen(false)}
                  onSave={(p) => {
                    saveProfile(p);
                    setProfile(p);
                    setProfileModalOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </header>
      {/* Seitennavigation */}
      <div
        className={`fixed inset-0 z-40 bg-[#0b1626]/30 backdrop-blur-[2px] transition-opacity duration-500 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        inert={!drawerOpen}
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] max-w-[86vw] flex-col bg-[#fbfaf6] shadow-[24px_0_60px_-30px_rgba(15,23,42,0.5)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between bg-[#1a3152] px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-casolvo-weiss.png" alt="Casolvo" style={{ height: 32, width: "auto" }} />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Navigation schließen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="ti ti-x text-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-1 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Aktueller Fall</p>
          <p className="mb-3 px-3.5 text-[13px] text-foreground/65">
            {caseData.patientName}, {caseData.age} J. · {difficultyLabel}
          </p>
          <ul className="mb-7 space-y-0.5">
            {SLIDE_TITLES.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => {
                    setSlide(i);
                    setDrawerOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground ${slide === i ? "bg-[#1a3152]/[0.07] text-foreground" : ""}`}
                >
                  <span
                    className={`clinical-data flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-bold ${
                      slide === i ? "bg-[#1a3152] text-white" : "bg-foreground/[0.07] text-foreground/60"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {BLATT_TITLES[i]}
                </button>
              </li>
            ))}
          </ul>

          <p className="mb-1.5 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">Navigation</p>
          <ul className="space-y-0.5">
            <li>
              <button type="button" onClick={() => { setDrawerOpen(false); onGoHome(); }} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-home text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Startseite
              </button>
            </li>
            <li>
              <Link href="/statistik" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-chart-line text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Statistik
              </Link>
            </li>
            <li>
              <Link href="/ueber-uns" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-info-circle text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Über uns
              </Link>
            </li>
            <li>
              <Link href="/qa" onClick={() => setDrawerOpen(false)} className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <i className="ti ti-help-circle text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Q&amp;A
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setProfileModalOpen(true);
                }}
                className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <i className="ti ti-user text-[18px] text-foreground/45 group-hover:text-foreground/70" aria-hidden="true" />
                Profil
              </button>
            </li>
          </ul>
        </div>

        <div className="border-t border-foreground/10 px-6 py-4">
          <ReportCaseCard caseId={caseData.id} difficulty={difficulty} embedded />
        </div>
      </aside>
      {/* Spacer: gleicht die Höhe des jetzt fixed-positionierten Headers aus,
          damit der Inhalt nicht darunter verschwindet. */}
      <div className="h-16" aria-hidden="true" />

      {(
      // Update 07.10.2026 (Sergio): Verlauf-Spalte und Akte-Spalte sollen ab
      // md unabhängig voneinander scrollen, statt gemeinsam mit der Seite.
      // Beide Spalten bekommen eine feste Höhe (Viewport minus Header) und
      // einen eigenen overflow-y-auto-Container statt sticky/min-h.
      <div className="grid gap-4 pb-8 pt-5 md:grid-cols-1 md:items-start md:gap-5 md:pb-0 md:pt-0 md:h-[calc(100dvh-4rem)]">
        {/* Eine Karte: Patient · Befunde · Punkte · Melden — kein Leerraum dazwischen */}
        <aside className="hidden">
          <VerlaufInsel steps={verlaufSteps} caseId={caseData.id} difficulty={difficulty} />
        </aside>

        {/* Akte */}
        {/* Fix 08.10.2026 (Sergio: "wenn man Befunde anfordert, kann ich die
            Anamnese nicht mehr sehen"): main ist ein flex-col mit fester
            Höhe — ohne shrink-0 hat Flexbox die Aufnahme-Karte (overflow-
            hidden ⇒ min-height 0) auf 3 px zusammengedrückt, sobald die
            Befunde die Spalte überfüllt haben. [&>*]:shrink-0 verhindert das
            für alle direkten Kinder; gescrollt wird in main selbst. */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10" style={bgStyle} />
        <main key={`akte-${caseData.id}`} className="flex min-w-0 flex-col items-center md:h-full md:pb-2 md:pt-2.5">
          <nav aria-label="Akte" className="mb-2.5 flex items-center rounded-full bg-foreground/[0.07] p-[3px]">
            {SLIDE_TITLES.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setSlide(i)}
                aria-current={slide === i ? "step" : undefined}
                className={`rounded-full px-3.5 py-[3px] text-[12.5px] font-semibold leading-5 transition-all duration-300 ${
                  slide === i
                    ? "bg-white text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.16),0_0_0_0.5px_rgba(15,23,42,0.05)]"
                    : "text-foreground/50 hover:text-foreground/80"
                }`}
              >
                <span className={`clinical-data mr-1 ${slide === i ? "text-[#2f6fb0]" : "opacity-60"}`}>{i + 1}</span>
                {t}
              </button>
            ))}
          </nav>

          {/* Bühne: Karten auf einem Kreis */}
          {(() => {
            const cardW = stageW >= 768 ? Math.min(1480, stageW * 0.9) : stageW - 16;
            // Cover-Flow: Nachbarblätter seitlich versetzt, nach hinten geschoben, eingedreht
            const coverTransform = (d: number) => {
              if (d === 0) return "translate3d(0,0,0) rotateY(0deg)";
              const sign = d > 0 ? 1 : -1;
              const k = Math.abs(d) - 1;
              const x = sign * (cardW * 0.7 + k * cardW * 0.22);
              const z = -(cardW * 0.34 + 140 + k * 220);
              return `translate3d(${Math.round(x)}px,0,${Math.round(z)}px) rotateY(${-sign * 40}deg)`;
            };
            const blatt1 = (
              <AkteBlatt
                caseData={caseData}
                blatt={1}
                footer={
                  <button
                    type="button"
                    onClick={() => setSlide(1)}
                    className="rounded-full bg-[#1a3152] px-8 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Weiter zu den Befunden
                  </button>
                }
              >
                <div className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0">
                    <Rubrik>Vorstellungsgrund</Rubrik>
                    <blockquote className="mb-7 border-l-2 border-[var(--step-1)] pl-5 font-[family-name:var(--font-fraunces)] text-[19px] italic leading-snug text-foreground">
                      „{caseData.chiefComplaint}“
                    </blockquote>
                    <Rubrik>Anamnese</Rubrik>
                    {caseData.anamnese && caseData.anamnese.length > 0 ? (
                      <dl>
                        {caseData.anamnese.map((sec) => (
                          <FeldZeile key={sec.label} label={sec.label}>
                            <span className="whitespace-pre-line">{sec.text}</span>
                          </FeldZeile>
                        ))}
                      </dl>
                    ) : (
                      <p className="whitespace-pre-line text-[15.5px] leading-[1.7] text-foreground">{caseData.history}</p>
                    )}
                  </div>
                  <aside className="min-w-0">
                    {(() => {
                      const facts: [string, string][] = (
                        [
                          ["Beruf", caseData.occupation?.trim() || ""],
                          ["Familie", caseData.family?.trim() || ""],
                          ["Vorerkrankungen", caseData.preExisting?.trim() || ""],
                          ["Allergien", caseData.allergies?.trim() || ""],
                          ["Alkohol & Drogen", caseData.substanceHistory?.trim() || ""],
                          ["Medikamente", caseData.medications?.trim() || ""],
                        ] as [string, string][]
                      ).filter(([, v]) => v.length > 0);
                      return facts.length > 0 ? (
                        <div className="rounded-xl border border-foreground/12 bg-[#f5f2ea]/70 px-5 py-4">
                          <Rubrik>Vorgeschichte</Rubrik>
                          <dl className="space-y-3">
                            {facts.map(([l, v]) => (
                              <div key={l}>
                                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{l}</dt>
                                <dd className="mt-0.5 text-[14px] leading-[1.5] text-foreground">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ) : null;
                    })()}

                  </aside>
                </div>
              </AkteBlatt>
            );

            const blatt2 = (
              <AkteBlatt
                caseData={caseData}
                blatt={2}
                footer={
                  <>
                    <button
                      type="button"
                      onClick={() => setSlide(0)}
                      className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                    >
                      ← Anamnese
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlide(2)}
                      className="rounded-full bg-[#1a3152] px-8 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Weiter zur Diagnose
                    </button>
                  </>
                }
              >
                {!orderDone && !isResult ? (
                  <>
                    <Rubrik right={relevanzModus ? "Bewertung nach Abgabe" : `je −${INVESTIGATION_COST} Punkte`}>
                      Anordnungsbogen
                    </Rubrik>
                    <ul className="grid gap-x-10 sm:grid-cols-2">
                      {rows.map((r) => {
                        const off = stateOf(r.key) === "unavailable";
                        const on = picks.includes(r.key);
                        return (
                          <li key={r.key}>
                            <button
                              type="button"
                              disabled={off}
                              aria-pressed={on}
                              onClick={() => togglePick(r.key)}
                              className={`flex w-full items-center gap-3.5 border-b border-dotted border-foreground/20 py-3.5 text-left ${
                                off ? "cursor-not-allowed text-muted/50" : "text-foreground"
                              }`}
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors ${
                                  on ? "border-[#1a3152] bg-[#1a3152] text-white" : "border-foreground/40"
                                }`}
                              >
                                {on && <i className="ti ti-check text-[13px]" aria-hidden="true" />}
                              </span>
                              <span className="text-[15.5px] font-medium">{r.label}</span>
                              <span className="ml-auto text-[12px] text-muted">
                                {off ? "nicht verfügbar" : relevanzModus ? "" : `−${INVESTIGATION_COST}`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-8 flex items-center justify-between gap-4">
                      <span className="text-[13px] text-muted">
                        {picks.length > 0 ? `${picks.length} angekreuzt` : "Nichts angekreuzt"}
                      </span>
                      <button
                        type="button"
                        onClick={submitOrder}
                        className="rounded-full bg-[#1a3152] px-6 py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        {picks.length > 0 ? "Anordnen" : "Ohne Befunde zur Diagnose"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
                    <div>
                      {(() => {
                        const all = [...rows, { key: "oberarzt" as FindingKey, label: "Oberarzt-Tipp" }].filter((r) =>
                          r.key === "oberarzt" ? oberarztState() !== "unavailable" : true
                        );
                        const stOf = (k: FindingKey) => (k === "oberarzt" ? oberarztState() : stateOf(k));
                        const vorhanden = all.filter((r) => stOf(r.key) === "open");
                        const offen = all.filter((r) => stOf(r.key) === "locked");
                        const nv = all.filter((r) => stOf(r.key) === "unavailable");
                        return (
                          <>
                            <Rubrik right={`${vorhanden.length}`}>Angefordert</Rubrik>
                            {vorhanden.length > 0 ? (
                              <ul className="mb-7">
                                {vorhanden.map((r) => {
                                  const active = activeFinding === r.key;
                                  return (
                                    <li key={r.key}>
                                      <button
                                        type="button"
                                        onClick={() => setActiveFinding(r.key)}
                                        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                                          active ? "bg-[#1a3152] text-white" : "hover:bg-foreground/[0.04]"
                                        }`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-white" : "bg-[var(--step-2-dot)]"}`}
                                          aria-hidden="true"
                                        />
                                        <span className="text-[14px] font-semibold">{r.label}</span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="mb-7 px-2 text-[13px] text-muted">Keine Befunde angeordnet.</p>
                            )}

                            {offen.length > 0 && (
                              <>
                                <Rubrik>{isResult ? "Weitere Befunde" : "Nachfordern"}</Rubrik>
                                <p className="mb-2 px-2 text-[11.5px] leading-snug text-muted">
                                  {isResult
                                    ? "Nach der Abgabe kostenlos einsehbar."
                                    : relevanzModus
                                    ? "Fließt in die Bewertung ein: nicht zielführende Befunde −10."
                                    : `Je Befund −${INVESTIGATION_COST} Punkte.`}
                                </p>
                                <ul>
                                  {offen.map((r) => (
                                    <li key={r.key}>
                                      <button
                                        type="button"
                                        onClick={() => reveal(r.key)}
                                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                                      >
                                        <i className="ti ti-plus text-[13px]" aria-hidden="true" />
                                        <span className="text-[13.5px] font-medium">{r.label}</span>
                                        {!isResult && r.key === "oberarzt" && (
                                          <span className="clinical-data ml-auto text-[11.5px] text-[var(--step-2)]">−{OBERARZT_COST}</span>
                                        )}
                                        {!isResult && r.key !== "oberarzt" && !relevanzModus && (
                                          <span className="clinical-data ml-auto text-[11.5px] text-[var(--step-2)]">−{INVESTIGATION_COST}</span>
                                        )}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {nv.length > 0 && (
                              <p className="mt-4 px-2 text-[11.5px] text-muted/70">
                                Nicht verfügbar: {nv.map((r) => r.label).join(", ")}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <article className="min-w-0">
                      {activeFinding && (activeFinding === "oberarzt" ? revealed.oberarzt : revealed[activeFinding]) ? (
                        <>
                          <Rubrik right="Befundbericht">
                            {activeFinding === "oberarzt"
                              ? "Oberarzt-Tipp"
                              : rows.find((r) => r.key === activeFinding)?.label}
                          </Rubrik>
                          <div className="text-[15px] leading-[1.7]">{findingContent(activeFinding)}</div>
                        </>
                      ) : (
                        <p className="pt-8 text-center text-[14px] text-muted">
                          {asked.length > 0 ? "Befund links auswählen." : "Keine Befunde angeordnet."}
                        </p>
                      )}
                    </article>
                  </div>
                )}
              </AkteBlatt>
            );

            const blatt3 = (
              <AkteBlatt
                caseData={caseData}
                blatt={3}
                footer={
                  !isResult ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSlide(1)}
                        className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                      >
                        ← Befunde
                      </button>
                      <button
                        type="button"
                        onClick={() => pending && onSubmitDiagnosis(pending)}
                        disabled={!pending || !!selectedDiagnosis}
                        className="rounded-full bg-[#1a3152] px-8 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        Diagnose abgeben
                      </button>
                    </>
                  ) : undefined
                }
              >
                {!isResult ? (
                  <>
                    <Rubrik
                      right={
                        relevanzModus
                          ? `${paidRevealedCount} ${paidRevealedCount === 1 ? "Befund" : "Befunde"} angeordnet`
                          : `noch ${possiblePoints} Punkte möglich`
                      }
                    >
                      Diagnose festlegen
                    </Rubrik>
                    <ul className="grid gap-3 lg:grid-cols-2">
                      {caseData.diagnosisOptions.map((opt, i) => {
                        const sel = pending === opt;
                        return (
                          <li key={opt}>
                            <button
                              type="button"
                              onClick={() => setPending(sel ? null : opt)}
                              disabled={!!selectedDiagnosis}
                              aria-pressed={sel}
                              className={`flex w-full items-center gap-4 rounded-xl border-[1.5px] px-5 py-4 text-left transition-colors duration-200 ${
                                sel ? "border-[#1a3152] bg-[#1a3152]/[0.05]" : "border-foreground/15 hover:border-foreground/35"
                              }`}
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                  sel ? "border-[#1a3152]" : "border-foreground/40"
                                }`}
                              >
                                {sel && <span className="h-2.5 w-2.5 rounded-full bg-[#1a3152]" />}
                              </span>
                              <span className="clinical-data w-4 text-[13px] text-muted">{String.fromCharCode(65 + i)}</span>
                              <span className="text-[16.5px] font-semibold text-foreground">{opt}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <div ref={resultRef}>
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
              </AkteBlatt>
            );
            const blaetter = [blatt1, blatt2, blatt3];

            return (
              <div
                ref={stageRef}
                className="relative h-[calc(100dvh-9rem)] min-h-[560px] w-full overflow-x-clip md:h-auto md:flex-1"
                style={{ perspective: "2600px", perspectiveOrigin: "50% 45%" }}
                onTouchStart={(e) => {
                  touchX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (touchX.current === null) return;
                  const dx = e.changedTouches[0].clientX - touchX.current;
                  if (dx < -60) setSlide((v) => Math.min(2, v + 1));
                  if (dx > 60) setSlide((v) => Math.max(0, v - 1));
                  touchX.current = null;
                }}
              >
                <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
                  {blaetter.map((inhalt, i) => {
                    const signed = i - slide;
                    const d = Math.abs(signed);
                    const active = d === 0;
                    return (
                      <div
                        key={i}
                        className="absolute bottom-2 top-0 motion-reduce:!transition-none"
                        style={{
                          left: "50%",
                          width: cardW,
                          marginLeft: -cardW / 2,
                          transform: coverTransform(signed),
                          transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                          zIndex: 10 - d,
                          backfaceVisibility: "hidden",
                        }}
                      >
                        <div
                          inert={!active}
                          aria-hidden={!active}
                          className="h-full overflow-hidden rounded-[22px] border border-foreground/10 bg-[#fffefa] transition-[opacity,filter] duration-700"
                          style={{
                            opacity: active ? 1 : d === 1 ? 0.6 : 0.25,
                            filter: active ? "none" : "saturate(0.6)",
                            boxShadow: "0 50px 90px -50px rgba(15,23,42,0.55), 0 18px 36px -24px rgba(15,23,42,0.25)",
                          }}
                        >
                          {inhalt}
                        </div>
                        {!active && (
                          <button
                            type="button"
                            aria-label={`Zu ${SLIDE_TITLES[i]}`}
                            onClick={() => setSlide(i)}
                            className="absolute inset-0 cursor-pointer rounded-[22px]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pfeile: links = zurück, rechts = weiter */}
                <button
                  type="button"
                  aria-label="Vorheriges Blatt"
                  onClick={() => setSlide((v) => Math.max(0, v - 1))}
                  className={`absolute left-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-white/95 text-foreground shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] transition-opacity duration-300 hover:bg-white md:left-4 ${
                    slide === 0 ? "pointer-events-none opacity-0" : "opacity-100"
                  }`}
                >
                  <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Nächstes Blatt"
                  onClick={() => setSlide((v) => Math.min(2, v + 1))}
                  className={`absolute right-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-white/95 text-foreground shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] transition-opacity duration-300 hover:bg-white md:right-4 ${
                    slide === 2 ? "pointer-events-none opacity-0" : "opacity-100"
                  }`}
                >
                  <i className="ti ti-chevron-right text-xl" aria-hidden="true" />
                </button>
              </div>
            );
          })()}
        </main>
      </div>
      )}
    </div>
  );
}

