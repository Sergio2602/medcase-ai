import { NextResponse } from "next/server";
import {
  corsHeaders,
  isRateLimited,
  clientIp,
  GENERIC_ERROR,
  findCaseById,
  toRevealPayload,
  parseDifficulty,
  type FindingKey,
} from "@/lib/case-bank";

// Liefert genau die angeforderten Befund-Kategorien für einen laufenden Fall
// (nie mehr als das). Keine Relevanz-/Diagnose-Infos hier — die kommen erst
// über /api/case/verify nach Diagnoseabgabe.
//
// Update 01.10.2026: 4 zusätzliche v3-Kategorien (auskultation/ekg/eeg/konsil)
// + "oberarzt" (Oberarzt-Joker) ergänzt — bei Altfällen liefert
// toRevealPayload() für diese Schlüssel einfach nichts (siehe lib/case-bank.ts).
export const dynamic = "force-dynamic";

const VALID_CATEGORIES: FindingKey[] = [
  "examination",
  "auskultation",
  "labs",
  "ekg",
  "eeg",
  "imaging",
  "konsil",
  "oberarzt",
];

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const baseHeaders = corsHeaders(request.headers.get("origin"));

  if (isRateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es in einer Minute erneut." },
      { status: 429, headers: baseHeaders }
    );
  }

  let difficulty = parseDifficulty(undefined);
  let caseId = "";
  let categories: FindingKey[] = [];
  try {
    const body = await request.json();
    difficulty = parseDifficulty(body?.difficulty);
    caseId = typeof body?.caseId === "string" ? body.caseId : "";
    if (Array.isArray(body?.categories)) {
      categories = body.categories.filter((c: unknown): c is FindingKey =>
        VALID_CATEGORIES.includes(c as FindingKey)
      );
    }
  } catch {
    // fällt unten auf die "ungültige Anfrage"-Antwort durch
  }

  if (!caseId || categories.length === 0) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400, headers: baseHeaders });
  }

  const raw = await findCaseById(difficulty, caseId);
  if (!raw) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404, headers: baseHeaders });
  }

  return NextResponse.json(toRevealPayload(raw, categories), { headers: baseHeaders });
}
