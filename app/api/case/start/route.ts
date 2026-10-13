import { NextResponse } from "next/server";
import {
  corsHeaders,
  isRateLimited,
  clientIp,
  GENERIC_ERROR,
  pickCase,
  findCaseById,
  toPublicView,
  extractDiagnosisOptionTexts,
  shuffle,
  parseDifficulty,
  parseDiscipline,
} from "@/lib/case-bank";

// Startet einen neuen Fall: liefert NUR die immer-sichtbaren Felder (Payload-Fix,
// siehe DECISION_LOG.md 21.09.2026). Untersuchung/Bildgebung/Labor kommen über
// /api/case/reveal, Diagnose/Begründung über /api/case/verify.
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
  let discipline: ReturnType<typeof parseDiscipline>;
  let debugCaseId = "";
  try {
    const body = await request.json();
    difficulty = parseDifficulty(body?.difficulty);
    discipline = parseDiscipline(body?.discipline);
    debugCaseId = typeof body?.caseId === "string" ? body.caseId : "";
  } catch {
    // Kein/ungültiges Body -> Default-Schwierigkeit, keine Disziplin-Filterung.
  }

  // QA-Hilfe: gezielter Fall-Abruf per caseId (z.B. ?case=innere-klinik-0001 im
  // Frontend), damit ein bestimmter Fall nicht erst zufällig gezogen werden muss.
  // Kein Effekt im Normalbetrieb (debugCaseId bleibt leer).
  const raw = debugCaseId ? await findCaseById(difficulty, debugCaseId) : await pickCase(difficulty, discipline);
  if (!raw) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500, headers: baseHeaders });
  }

  // extractDiagnosisOptionTexts() liest beide Fallschemata (v1/v2: Strings,
  // v3: { de, en }-Objekte) und liefert in jedem Fall die anzuzeigenden
  // deutschen Texte — die eigentliche Schema-Erkennung lebt in lib/case-bank.ts.
  const options = shuffle(extractDiagnosisOptionTexts(raw));
  return NextResponse.json(toPublicView(raw, options), { headers: baseHeaders });
}
