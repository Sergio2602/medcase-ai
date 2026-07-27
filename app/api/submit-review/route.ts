import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

// Nimmt Experten-Feedback entgegen (vom Review-Modus):
//  - kind "case":    fachliches Urteil zu einem einzelnen Fall
//  - kind "session": Produkt-/Didaktik-Fragebogen (einmal pro Sitzung)
// Speichert strukturiert in Upstash Redis und pingt den Discord-Webhook —
// dieselbe Infrastruktur wie "Fall melden", keine neue Abhängigkeit.

type Reviewer = { name?: string; role?: string; fach?: string };

function reviewerLine(r: Reviewer) {
  return `${r.name ?? "—"} (${r.role ?? "—"}${r.fach ? `, ${r.fach}` : ""})`;
}

async function ping(url: string, content: string) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function POST(req: NextRequest) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, DISCORD_WEBHOOK_URL, REVIEW_ACCESS_KEY } =
    process.env;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return NextResponse.json({ error: "Speicher nicht konfiguriert." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  // Zugangsprüfung (nur wenn ein Key gesetzt ist).
  if (REVIEW_ACCESS_KEY && body.accessKey !== REVIEW_ACCESS_KEY) {
    return NextResponse.json({ error: "Kein Zugang." }, { status: 401 });
  }

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  const timestamp = new Date().toISOString();
  const reviewer: Reviewer = body.reviewer ?? {};

  // Waitlist: E-Mail für Gratis-Monat bei Release (am Tageslimit erfasst).
  if (body.kind === "waitlist") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ungültige E-Mail." }, { status: 400 });
    }
    await redis.set(`waitlist:${email}`, { email, timestamp });
    return NextResponse.json({ success: true });
  }

  // Studenten-Micro-Survey (offen, kein Reviewer/Key nötig): nur nach Redis,
  // kein Discord-Ping (sonst Spam). PostHog-Event feuert der Client separat.
  if (body.kind === "student") {
    await redis.set(`studentFeedback:${Date.now()}`, {
      kind: "student",
      nutzung: body.nutzung ?? "",
      preis: body.preis ?? "",
      timestamp,
    });
    return NextResponse.json({ success: true });
  }

  const kind = body.kind === "session" ? "session" : "case";

  if (kind === "session") {
    const record = {
      kind: "session",
      klinischesDenken: body.klinischesDenken ?? "",
      empfehlung: body.empfehlung ?? "",
      mechanik: body.mechanik ?? "",
      realismus: body.realismus ?? "",
      schwierigkeit: body.schwierigkeit ?? "",
      einverstaendnis: body.einverstaendnis ?? "",
      freitext: body.freitext ?? "",
      reviewerName: reviewer.name ?? "",
      reviewerRole: reviewer.role ?? "",
      reviewerFach: reviewer.fach ?? "",
      timestamp,
    };
    const tasks: Promise<unknown>[] = [
      redis.set(`sessionFeedback:${Date.now()}`, record),
    ];
    if (DISCORD_WEBHOOK_URL) {
      tasks.push(
        ping(
          DISCORD_WEBHOOK_URL,
          [
            `**Produkt-Feedback (Review-Session)**`,
            `• Klinisches Denken: ${record.klinischesDenken}`,
            `• Empfehlung: ${record.empfehlung}`,
            `• Mechanik verständlich: ${record.mechanik}`,
            `• Realismus: ${record.realismus}`,
            `• Schwierigkeit: ${record.schwierigkeit}`,
            `• Nutzung erlaubt: ${record.einverstaendnis}`,
            record.freitext ? `• Freitext: ${record.freitext}` : null,
            `• Reviewer: ${reviewerLine(reviewer)}`,
            `• Zeitpunkt: ${timestamp}`,
          ]
            .filter(Boolean)
            .join("\n")
        )
      );
    }
    await Promise.all(tasks);
    return NextResponse.json({ success: true });
  }

  // kind === "case"
  if (!body.caseId || !body.plausibel) {
    return NextResponse.json(
      { error: "caseId und plausibel sind Pflichtfelder." },
      { status: 400 }
    );
  }

  const record = {
    kind: "case",
    caseId: body.caseId,
    difficulty: body.difficulty ?? "",
    diagnosis: body.diagnosis ?? "",
    plausibel: body.plausibel,
    anmerkung: body.anmerkung ?? "",
    reviewerName: reviewer.name ?? "",
    reviewerRole: reviewer.role ?? "",
    reviewerFach: reviewer.fach ?? "",
    timestamp,
  };

  const tasks: Promise<unknown>[] = [
    redis.set(`caseReviews:${body.caseId}:${Date.now()}`, record),
  ];
  if (DISCORD_WEBHOOK_URL) {
    const label =
      body.plausibel === "ja"
        ? "plausibel"
        : body.plausibel === "nein"
        ? "nicht plausibel"
        : "geht so";
    tasks.push(
      ping(
        DISCORD_WEBHOOK_URL,
        [
          `**Fall-Review**`,
          `• Fall: \`${body.caseId}\`${body.diagnosis ? ` (${body.diagnosis})` : ""}`,
          `• Bewertung: ${label}`,
          body.anmerkung ? `• Anmerkung: ${body.anmerkung}` : null,
          `• Reviewer: ${reviewerLine(reviewer)}`,
          `• Zeitpunkt: ${timestamp}`,
        ]
          .filter(Boolean)
          .join("\n")
      )
    );
  }
  await Promise.all(tasks);
  return NextResponse.json({ success: true });
}
