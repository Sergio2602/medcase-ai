import { NextResponse } from "next/server";
import {
  corsHeaders,
  isRateLimited,
  clientIp,
  GENERIC_ERROR,
  findCaseById,
  toVerifyPayload,
  parseDifficulty,
} from "@/lib/case-bank";
import { parseRequested } from "@/lib/scoring";

// Prüft die abgegebene Diagnose serverseitig und liefert erst jetzt
// correctDiagnosis/explanation/differentialNotes/caseContext aus — das ist
// der eigentliche Payload-Fix: vorher lag das alles schon ab Fallstart im
// Client (siehe DECISION_LOG.md 16.09./21.09.2026).
export const dynamic = "force-dynamic";

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
  let guess = "";
  let requested: ReturnType<typeof parseRequested> = [];
  try {
    const body = await request.json();
    difficulty = parseDifficulty(body?.difficulty);
    caseId = typeof body?.caseId === "string" ? body.caseId : "";
    guess = typeof body?.guess === "string" ? body.guess : "";
    requested = parseRequested(body?.requested);
  } catch {
    // fällt unten auf die "ungültige Anfrage"-Antwort durch
  }

  if (!caseId) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400, headers: baseHeaders });
  }

  const raw = await findCaseById(difficulty, caseId);
  if (!raw) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404, headers: baseHeaders });
  }

  return NextResponse.json(toVerifyPayload(raw, guess, requested), { headers: baseHeaders });
}
