"use client";

import { useEffect, useMemo, useState } from "react";
import { CenteredNav } from "@/app/components/CenteredNav";
import { FadeInUp } from "@/app/components/FadeInUp";
import { readCaseResults, clearCaseResults, type CaseResult } from "@/lib/stats";

const DISCIPLINE_LABELS: Record<string, string> = {
  zufaellig: "Zufällig",
  innere: "Innere",
  kardiologie: "Kardiologie",
  chirurgie: "Chirurgie",
  allgemeinmedizin: "Allgemeinmedizin",
  neurologie: "Neurologie",
  hno: "HNO",
  augenheilkunde: "Augenheilkunde",
  anaesthesiologie: "Anästhesiologie",
};

const DISCIPLINE_ICONS: Record<string, string> = {
  zufaellig: "ti-arrows-shuffle",
  innere: "ti-heart-rate-monitor",
  kardiologie: "ti-heart",
  chirurgie: "ti-cut",
  allgemeinmedizin: "ti-first-aid-kit",
  neurologie: "ti-brain",
  hno: "ti-ear",
  augenheilkunde: "ti-eye",
  anaesthesiologie: "ti-vaccine",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  vorklinik: "Vorklinik",
  klinik: "Klinik",
  examen: "PJ",
};

const DIFFICULTY_ICONS: Record<string, string> = {
  vorklinik: "ti-book-2",
  klinik: "ti-stethoscope",
  examen: "ti-building-hospital",
};

function labelFor(map: Record<string, string>, id: string) {
  return map[id] ?? id;
}

function iconFor(map: Record<string, string>, id: string) {
  return map[id] ?? "ti-chart-bar";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} min`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Grün ab 70 %, Orange/Gelb 40–69 %, Rot darunter — dieselbe Ampel-Logik wie
// bei den Lab-Flags im Spiel, damit die Farbsprache app-weit konsistent bleibt.
function accuracyColors(pct: number) {
  if (pct >= 70) return { bg: "#e7f6ec", text: "#15803d", bar: "#22c55e" };
  if (pct >= 40) return { bg: "#fef3e2", text: "#92400e", bar: "#f59e0b" };
  return { bg: "#fdf1f0", text: "#c0362c", bar: "#ef4444" };
}

// Kompakter Ring-Gauge für die Trefferquote — gleiche Größe wie die
// Icon-Kreise der anderen Summary-Karten, damit alle vier Zellen strukturell
// gleich aussehen. Animiert beim Laden von 0 auf den Zielwert.
function RingGauge({ percent, color }: { percent: number; color: string }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setAnimated(percent);
      return;
    }
    const id = requestAnimationFrame(() => setAnimated(percent));
    return () => cancelAnimationFrame(id);
  }, [percent]);

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);

  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" className="text-card-border/10" strokeWidth={4} />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </svg>
    </div>
  );
}

function AccuracyBadge({ pct }: { pct: number }) {
  const c = accuracyColors(pct);
  return (
    <div className="flex min-w-[110px] flex-col gap-1">
      <span
        className="w-fit rounded-full px-2.5 py-0.5 text-xs font-bold"
        style={{ backgroundColor: c.bg, color: c.text }}
      >
        {pct}% Trefferquote
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-border/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: c.bar }}
        />
      </div>
    </div>
  );
}

type Group = {
  id: string;
  count: number;
  correct: number;
  totalScore: number;
  totalDuration: number;
};

function groupBy(results: CaseResult[], key: "discipline" | "difficulty"): Group[] {
  const map = new Map<string, Group>();
  for (const r of results) {
    const id = r[key];
    const existing = map.get(id) ?? { id, count: 0, correct: 0, totalScore: 0, totalDuration: 0 };
    existing.count += 1;
    if (r.correct) existing.correct += 1;
    existing.totalScore += r.score;
    existing.totalDuration += r.durationSeconds;
    map.set(id, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function GroupTable({
  title,
  icon,
  groups,
  labels,
  icons,
}: {
  title: string;
  icon: string;
  groups: Group[];
  labels: Record<string, string>;
  icons: Record<string, string>;
}) {
  return (
    <div className="card p-6">
      <p className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <i className={`ti ${icon} text-sm`} />
        {title}
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const accuracy = g.count > 0 ? Math.round((g.correct / g.count) * 100) : 0;
          const avgDuration = g.count > 0 ? g.totalDuration / g.count : 0;
          return (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-[1.5px] border-card-border/10 px-4 py-3"
            >
              <span className="flex min-w-[150px] items-center gap-2 font-semibold">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
                  <i className={`ti ${iconFor(icons, g.id)} text-sm`} />
                </span>
                {labelFor(labels, g.id)}
              </span>
              <span className="text-sm text-muted">
                <span className="font-bold text-foreground">{g.count}</span> gelöst
              </span>
              <AccuracyBadge pct={accuracy} />
              <span className="text-sm text-muted">
                Ø Zeit <span className="font-bold text-foreground">{formatDuration(avgDuration)}</span>
              </span>
              <span className="text-sm text-muted">
                Punkte <span className="font-bold text-accent">{g.totalScore}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <i className={`ti ${icon} text-lg`} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-xl font-semibold" style={{ color }}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function StatistikPage() {
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    setResults(readCaseResults());
  }, []);

  const byDiscipline = useMemo(() => (results ? groupBy(results, "discipline") : []), [results]);
  const byDifficulty = useMemo(() => (results ? groupBy(results, "difficulty") : []), [results]);

  const summary = useMemo(() => {
    if (!results || results.length === 0) return null;
    const correct = results.filter((r) => r.correct).length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationSeconds, 0);
    return {
      count: results.length,
      accuracy: Math.round((correct / results.length) * 100),
      totalScore,
      avgDuration: totalDuration / results.length,
    };
  }, [results]);

  const recent = useMemo(() => (results ? [...results].reverse().slice(0, 10) : []), [results]);

  function handleReset() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    clearCaseResults();
    setResults([]);
    setConfirmingReset(false);
  }

  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1560px]">
        <CenteredNav active="statistik" />

        <div className="mx-auto max-w-[980px]">
          <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
            Deine Statistik
          </h1>
          <p className="mb-6 text-sm text-muted">
            Dein Lernfortschritt — lokal auf diesem Gerät gespeichert, kein Account nötig.
          </p>

          {results === null && <p className="text-sm text-muted">Lädt …</p>}

          {results !== null && results.length === 0 && (
            <div className="card p-8 text-center">
              <i className="ti ti-notebook mb-3 block text-3xl text-muted" />
              <p className="mb-1 font-semibold">Noch keine Fälle gelöst.</p>
              <p className="text-sm text-muted">
                Löse deinen ersten Fall — deine Statistik füllt sich automatisch.
              </p>
            </div>
          )}

          {results !== null && results.length > 0 && summary && (
            <div className="flex flex-col gap-4">
              <FadeInUp>
                <div className="card grid grid-cols-2 items-center gap-5 p-6 sm:grid-cols-4">
                  <SummaryCard icon="ti-flag-check" label="Gelöst" value={String(summary.count)} color="#1d4ed8" />
                  <div className="flex items-center gap-3">
                    <RingGauge percent={summary.accuracy} color={accuracyColors(summary.accuracy).text} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Trefferquote</p>
                      <p className="text-xl font-semibold" style={{ color: accuracyColors(summary.accuracy).text }}>
                        {summary.accuracy}%
                      </p>
                    </div>
                  </div>
                  <SummaryCard icon="ti-star" label="Punkte gesamt" value={String(summary.totalScore)} color="#1d4ed8" />
                  <SummaryCard
                    icon="ti-clock"
                    label="Ø Zeit / Fall"
                    value={formatDuration(summary.avgDuration)}
                    color="#0f0f0f"
                  />
                </div>
              </FadeInUp>

              {/* Case-Historie weiter oben, direkt nach der Summary — vorher
                  ganz unten, kaum sichtbar ohne viel Scrollen. Unterer Bereich
                  bewusst ohne Scroll-Animation: soll normal scrollbar sein. */}
              <div className="card p-6">
                <p className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                  <i className="ti ti-history text-sm" />
                  Zuletzt gelöst
                </p>
                <div className="flex flex-col gap-1.5">
                  {recent.map((r, i) => (
                    <div
                      key={`${r.caseId}-${r.timestamp}-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-card-border/10 py-1.5 text-sm last:border-b-0"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: r.correct ? "#e7f6ec" : "#fdf1f0",
                            color: r.correct ? "#15803d" : "#c0362c",
                          }}
                        >
                          <i className={`ti ${r.correct ? "ti-check" : "ti-x"} text-[11px]`} />
                        </span>
                        {labelFor(DISCIPLINE_LABELS, r.discipline)} ·{" "}
                        {labelFor(DIFFICULTY_LABELS, r.difficulty)}
                      </span>
                      <span className="text-muted">{formatDuration(r.durationSeconds)}</span>
                      <span className="text-muted">{formatDate(r.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <GroupTable
                title="Nach Fachbereich"
                icon="ti-stethoscope"
                groups={byDiscipline}
                labels={DISCIPLINE_LABELS}
                icons={DISCIPLINE_ICONS}
              />
              <GroupTable
                title="Nach Schwierigkeit"
                icon="ti-school"
                groups={byDifficulty}
                labels={DIFFICULTY_LABELS}
                icons={DIFFICULTY_ICONS}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  onBlur={() => setConfirmingReset(false)}
                  className="rounded-lg border-[1.5px] border-card-border/15 px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-[#c0362c]/40 hover:text-[#c0362c]"
                >
                  {confirmingReset ? "Wirklich zurücksetzen?" : "Statistik zurücksetzen"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
