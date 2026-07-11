"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
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

const DIFFICULTY_LABELS: Record<string, string> = {
  vorklinik: "Vorklinik",
  klinik: "Klinik",
  examen: "PJ",
};

function labelFor(map: Record<string, string>, id: string) {
  return map[id] ?? id;
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
}: {
  title: string;
  icon: string;
  groups: Group[];
  labels: Record<string, string>;
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
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg border-[1.5px] border-card-border/10 px-4 py-3"
            >
              <span className="min-w-[120px] font-semibold">{labelFor(labels, g.id)}</span>
              <span className="text-sm text-muted">
                <span className="font-bold text-foreground">{g.count}</span> gelöst
              </span>
              <span className="text-sm text-muted">
                Trefferquote{" "}
                <span
                  className="font-bold"
                  style={{ color: accuracy >= 70 ? "#15803d" : accuracy >= 40 ? "#92400e" : "#c0362c" }}
                >
                  {accuracy}%
                </span>
              </span>
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
      <div className="mx-auto max-w-[1320px]">
        <AppHeader backLabel="Zurück" backIcon="ti-arrow-left" />

        <div className="mx-auto max-w-[860px]">
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
              <div className="card grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Gelöst</p>
                  <p className="text-xl font-extrabold">{summary.count}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Trefferquote</p>
                  <p className="text-xl font-extrabold">{summary.accuracy}%</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Punkte gesamt</p>
                  <p className="text-xl font-extrabold text-accent">{summary.totalScore}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Ø Zeit / Fall</p>
                  <p className="text-xl font-extrabold">{formatDuration(summary.avgDuration)}</p>
                </div>
              </div>

              <GroupTable
                title="Nach Fachbereich"
                icon="ti-stethoscope"
                groups={byDiscipline}
                labels={DISCIPLINE_LABELS}
              />
              <GroupTable
                title="Nach Schwierigkeit"
                icon="ti-school"
                groups={byDifficulty}
                labels={DIFFICULTY_LABELS}
              />

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
                        <i
                          className={`ti ${r.correct ? "ti-check text-[#15803d]" : "ti-x text-[#c0362c]"} text-sm`}
                        />
                        {labelFor(DISCIPLINE_LABELS, r.discipline)} ·{" "}
                        {labelFor(DIFFICULTY_LABELS, r.difficulty)}
                      </span>
                      <span className="text-muted">{formatDuration(r.durationSeconds)}</span>
                      <span className="text-muted">{formatDate(r.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>

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
