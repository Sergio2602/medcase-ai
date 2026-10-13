import { NextResponse } from "next/server";
import { countCasesByDiscipline, parseDifficulty } from "@/lib/case-bank";

export const dynamic = "force-dynamic";

// Anzahl verfügbarer Fälle je Disziplin (nur Zahlen, keine Inhalte).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const difficulty = parseDifficulty(url.searchParams.get("difficulty") ?? "klinik");
  const counts = await countCasesByDiscipline(difficulty);
  return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
}
