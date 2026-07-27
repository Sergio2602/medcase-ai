"use client";

export type CaseReview = {
  caseId: string;
  difficulty?: string;
  diagnosis?: string;
  plausibel: string;
  anmerkung?: string;
  reviewerName?: string;
  reviewerRole?: string;
  reviewerFach?: string;
  timestamp: string;
};

export type SessionFeedback = {
  klinischesDenken?: string;
  empfehlung?: string;
  mechanik?: string;
  realismus?: string;
  schwierigkeit?: string;
  einverstaendnis?: string;
  freitext?: string;
  reviewerName?: string;
  reviewerRole?: string;
  reviewerFach?: string;
  timestamp: string;
};

export type StudentFeedback = {
  nutzung?: string;
  preis?: string;
  timestamp: string;
};

export type WaitlistEntry = {
  email: string;
  timestamp: string;
};

function tally(items: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of items) {
    if (!x) continue;
    m.set(x, (m.get(x) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const PLAUS_LABEL: Record<string, string> = {
  ja: "Plausibel",
  teils: "Geht so",
  nein: "Nicht plausibel",
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(rows: CaseReview[]) {
  const head = ["caseId", "diagnosis", "difficulty", "plausibel", "anmerkung", "reviewer", "rolle", "fach", "zeitpunkt"];
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.caseId, r.diagnosis ?? "", r.difficulty ?? "", r.plausibel, r.anmerkung ?? "", r.reviewerName ?? "", r.reviewerRole ?? "", r.reviewerFach ?? "", r.timestamp]
      .map((v) => esc(String(v)))
      .join(",")
  );
  return [head.join(","), ...lines].join("\n");
}

export function UebersichtClient({
  cases,
  sessions,
  students,
  waitlist,
}: {
  cases: CaseReview[];
  sessions: SessionFeedback[];
  students: StudentFeedback[];
  waitlist: WaitlistEntry[];
}) {
  const nutzungTally = tally(students.map((s) => s.nutzung ?? ""));
  const preisTally = tally(students.map((s) => s.preis ?? ""));

  // Nach Fall gruppieren.
  const byCase = new Map<string, CaseReview[]>();
  for (const c of cases) {
    const arr = byCase.get(c.caseId) ?? [];
    arr.push(c);
    byCase.set(c.caseId, arr);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Review-Übersicht</h1>
          <p className="mt-1 text-sm text-muted">Alle Experten-Reviews an einem Ort.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => download("medcase-fall-reviews.csv", toCsv(cases), "text/csv")}
            className="rounded-lg border-[1.5px] border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
          >
            <i className="ti ti-download mr-1" />
            Fall-Reviews (CSV)
          </button>
          <button
            onClick={() => download("medcase-reviews.json", JSON.stringify({ cases, sessions, students, waitlist }, null, 2), "application/json")}
            className="rounded-lg border-[1.5px] border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
          >
            <i className="ti ti-download mr-1" />
            Alles (JSON)
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { n: students.length, label: "Studenten-Antworten", group: "Studenten" },
          { n: waitlist.length, label: "Waitlist", group: "Studenten" },
          { n: cases.length, label: "Fall-Reviews", group: "Ärzte" },
          { n: sessions.length, label: "Produkt-Feedbacks", group: "Ärzte" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border-[1.5px] border-card-border/15 p-3">
            <p className="text-2xl font-extrabold">{s.n}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted/60">{s.group}</p>
          </div>
        ))}
      </div>

      {/* ===== STUDENTEN ===== */}
      <h2 className="mt-8 border-b border-card-border/10 pb-1 text-lg font-bold tracking-tight">
        Studenten-Feedback
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold">Würden zusätzlich zu AMBOSS/Anki nutzen</p>
          {nutzungTally.length === 0 ? (
            <p className="text-[13px] text-muted">Noch keine Antworten.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {nutzungTally.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-bold">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold">Preisbereitschaft / Monat</p>
          {preisTally.length === 0 ? (
            <p className="text-[13px] text-muted">Noch keine Antworten.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {preisTally.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-bold">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 card p-4">
        <p className="text-sm font-bold">Waitlist (Gratis-Monat) · {waitlist.length}</p>
        {waitlist.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">Noch keine Anmeldungen.</p>
        ) : (
          <p className="mt-1 break-words text-[12.5px] text-muted">
            {waitlist.map((w) => w.email).join(", ")}
          </p>
        )}
      </div>

      {/* ===== ÄRZTE ===== */}
      <h2 className="mt-8 border-b border-card-border/10 pb-1 text-lg font-bold tracking-tight">
        Ärzte-Reviews
      </h2>

      {/* Fall-Reviews nach Fall */}
      <h3 className="mt-3 text-[15px] font-bold tracking-tight">Fall-Reviews</h3>
      {byCase.size === 0 ? (
        <p className="mt-2 text-sm text-muted">Noch keine Fall-Reviews.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {[...byCase.entries()].map(([caseId, reviews]) => (
            <div key={caseId} className="card p-4">
              <p className="text-sm font-bold">{reviews[0].diagnosis || caseId}</p>
              <p className="text-xs text-muted">{caseId}</p>
              <div className="mt-2 flex flex-col gap-2">
                {reviews.map((r, i) => (
                  <div key={i} className="rounded-lg border-[1.5px] border-card-border/10 p-2.5 text-[13px]">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        r.plausibel === "ja"
                          ? "bg-[#e8f5e9] text-[#1b5e20]"
                          : r.plausibel === "nein"
                          ? "bg-[#fdf2f1] text-[#b3524f]"
                          : "bg-[#fef4e3] text-[#b45309]"
                      }`}
                    >
                      {PLAUS_LABEL[r.plausibel] ?? r.plausibel}
                    </span>
                    {r.anmerkung && <span className="text-foreground/90">{r.anmerkung}</span>}
                    <span className="mt-1 block text-[11px] text-muted">
                      {r.reviewerName} ({r.reviewerRole}
                      {r.reviewerFach ? `, ${r.reviewerFach}` : ""}) · {fmt(r.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Produkt-Feedback */}
      <h3 className="mt-6 text-[15px] font-bold tracking-tight">Produkt-Feedback</h3>
      {sessions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Noch kein Produkt-Feedback.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {sessions.map((s, i) => (
            <div key={i} className="card p-4 text-[13px]">
              <p className="text-[11px] font-semibold text-muted">
                {s.reviewerName} ({s.reviewerRole}
                {s.reviewerFach ? `, ${s.reviewerFach}` : ""}) · {fmt(s.timestamp)}
              </p>
              <ul className="mt-2 flex flex-col gap-0.5">
                <li><b>Klinisches Denken:</b> {s.klinischesDenken || "—"}</li>
                <li><b>Empfehlung:</b> {s.empfehlung || "—"}</li>
                <li><b>Mechanik:</b> {s.mechanik || "—"}</li>
                <li><b>Realismus:</b> {s.realismus || "—"}</li>
                <li><b>Schwierigkeit:</b> {s.schwierigkeit || "—"}</li>
                <li><b>Zitierbar:</b> {s.einverstaendnis || "—"}</li>
                {s.freitext && <li className="mt-1"><b>Freitext:</b> {s.freitext}</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
