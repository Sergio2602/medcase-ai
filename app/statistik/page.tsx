"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

// Nur 3 Stufen — Rot < 50 %, Gelb 50–79 %, Grün ab 80 % — in derselben
// punchy-pastelligen Familie wie die Avatar-Farben (avatar-1/3/4 in
// globals.css), statt der zu grellen reinen Ampelfarben. Einziger Ort in
// der App mit mehr als der einen Akzentfarbe, darf also als Ausnahme
// fröhlicher/lebendiger wirken statt dem sonst monotonen Blau-Schema
// zu folgen — aber weich statt knallhart.
function accuracyColors(pct: number) {
  if (pct >= 80) return { bg: "#e8f5e9", text: "#2e7d32", bar: "#66bb6a" };
  if (pct >= 50) return { bg: "#fefce8", text: "#ca8a04", bar: "#facc15" };
  return { bg: "#fdf2f1", text: "#b3524f", bar: "#ef9a9a" };
}

// Ring-Gauge für die Trefferquote — jetzt als präsenter Hero-Ring in der
// Summary-Karte (size/strokeWidth konfigurierbar statt fix), mit der
// Prozentzahl mittig im Ring. Animiert beim Laden von 0 auf den Zielwert.
function RingGauge({
  percent,
  color,
  size = 40,
  strokeWidth = 4,
  showLabel = false,
}: {
  percent: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}) {
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

  const radius = size / 2 - strokeWidth;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ height: size, width: size }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" className="text-card-border/10" strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </svg>
      {showLabel && (
        <span className="absolute font-extrabold" style={{ color, fontSize: size * 0.26 }}>
          {Math.round(animated)}%
        </span>
      )}
    </div>
  );
}

function AccuracyBadge({ pct }: { pct: number }) {
  const c = accuracyColors(pct);
  return (
    <div className="flex min-w-[84px] flex-col gap-1">
      <span
        className="w-fit rounded-full px-2 py-0.5 text-[10.5px] font-bold"
        style={{ backgroundColor: c.bg, color: c.text }}
      >
        {pct}%
      </span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-card-border/10">
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
    <div className="card p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <i className={`ti ${icon} text-sm`} />
        {title}
      </p>
      <div className="flex flex-col gap-1.5">
        {groups.length === 0 && (
          <p className="rounded-lg border-[1.5px] border-dashed border-card-border/15 px-3 py-3 text-center text-xs text-muted">
            Noch keine Daten.
          </p>
        )}
        {groups.map((g) => {
          const accuracy = g.count > 0 ? Math.round((g.correct / g.count) * 100) : 0;
          const avgDuration = g.count > 0 ? g.totalDuration / g.count : 0;
          return (
            <div
              key={g.id}
              className="rounded-lg border-[1.5px] border-card-border/10 px-3 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
                    <i className={`ti ${iconFor(icons, g.id)} text-xs`} />
                  </span>
                  <span className="truncate">{labelFor(labels, g.id)}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  <span className="font-bold text-foreground">{g.count}</span> gelöst
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pl-[30px]">
                <AccuracyBadge pct={accuracy} />
                <span className="text-[11px] text-muted">
                  Ø <span className="font-bold text-foreground">{formatDuration(avgDuration)}</span>
                </span>
                <span className="text-[11px] text-muted">
                  <span className="font-bold text-accent">{g.totalScore}</span> Pkt.
                </span>
              </div>
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
    // Auch bei 0 Fällen ein Objekt zurückgeben (statt null), damit die
    // Struktur (Ring, Spalten, Historie) immer gleich bleibt — nur mit
    // Null-Werten statt einer komplett anderen Leer-Ansicht.
    if (!results) return null;
    const correct = results.filter((r) => r.correct).length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationSeconds, 0);
    return {
      count: results.length,
      accuracy: results.length > 0 ? Math.round((correct / results.length) * 100) : 0,
      totalScore,
      avgDuration: results.length > 0 ? totalDuration / results.length : 0,
    };
  }, [results]);

  const recent = useMemo(() => (results ? [...results].reverse().slice(0, 30) : []), [results]);

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

        <div>
          <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
            Deine Statistik
          </h1>
          <p className="mb-6 text-sm text-muted">
            Dein Lernfortschritt — lokal auf diesem Gerät gespeichert, kein Account nötig.
          </p>

          {results === null && <p className="text-sm text-muted">Lädt …</p>}

          {results !== null && summary && (
            <div className="flex flex-col gap-4">
              {/* Volle Breite auf Desktop: links die Fachbereich-/
                  Schwierigkeits-Aufschlüsselung (scrollbar bei vielen
                  Einträgen), rechts Trefferquote + Stats. Auf Mobile bleibt
                  die Reihenfolge Trefferquote zuerst, dann Aufschlüsselung. */}
              <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                {/* Links: Fachbereich-/Schwierigkeits-Aufschlüsselung */}
                <div className="flex flex-col gap-4 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
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
                </div>

                {/* Rechts: Trefferquote — großer Ring, füllt die Spalte auf
                    voller Höhe aus (h-full + justify-center), statt kleiner
                    als die linke Spalte zu wirken. */}
                <FadeInUp>
                  <div className="card flex h-full flex-col items-center justify-center gap-6 p-6">
                    <div className="flex items-center gap-5">
                      <RingGauge
                        percent={summary.accuracy}
                        color={accuracyColors(summary.accuracy).text}
                        size={140}
                        strokeWidth={11}
                        showLabel
                      />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Trefferquote</p>
                        <p className="text-sm text-muted">gesamt</p>
                      </div>
                    </div>

                    <div className="h-px w-full bg-card-border/10" />

                    {/* Nebenwerte darunter, gleichmäßig über die volle Breite
                        verteilt statt in einer schmalen Spalte daneben. */}
                    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
                      <SummaryCard icon="ti-flag-check" label="Gelöst" value={String(summary.count)} color="#1d4ed8" />
                      <SummaryCard icon="ti-star" label="Punkte gesamt" value={String(summary.totalScore)} color="#1d4ed8" />
                      <SummaryCard
                        icon="ti-clock"
                        label="Ø Zeit / Fall"
                        value={formatDuration(summary.avgDuration)}
                        color="#0f0f0f"
                      />
                    </div>
                  </div>
                </FadeInUp>
              </div>

              {/* Case-Historie über die volle Breite darunter — nimmt auf
                  Desktop bewusst ~50vh ein, damit sie präsent bleibt statt
                  erst nach viel Scrollen sichtbar zu werden. Liste scrollt
                  intern, Kopfzeile bleibt fix. Unterer Bereich bewusst ohne
                  Scroll-Animation. */}
              <div className="card flex flex-col p-6 lg:h-[50vh]">
                <p className="mb-4 flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                  <i className="ti ti-history text-sm" />
                  Zuletzt gelöst
                </p>
                <div className="flex flex-col gap-1.5 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {recent.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-8 text-center">
                      <i className="ti ti-notebook text-2xl text-muted" />
                      <p className="text-sm font-semibold">Noch keine Fälle gelöst.</p>
                      <p className="text-xs text-muted">
                        Löse deinen ersten Fall — deine Statistik füllt sich automatisch.
                      </p>
                    </div>
                  )}
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

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  onBlur={() => setConfirmingReset(false)}
                  className="rounded-lg border-[1.5px] border-card-border/15 px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-[#c0362c]/40 hover:text-[#c0362c]"
                >
                  {confirmingReset ? "Wirklich zurücksetzen?" : "Statistik zurücksetzen"}
                </button>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-card-border/15 px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <i className="ti ti-arrow-left text-[12px]" />
                  Zurück
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
