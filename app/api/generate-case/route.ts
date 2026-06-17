import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// Never cache this route — every request must produce a fresh case.
export const dynamic = "force-dynamic";

// Only these origins may call this route from a browser.
const ALLOWED_ORIGINS = new Set([
  "https://medcase-ai-peach.vercel.app",
  "http://localhost:3000",
]);

// Build CORS headers for a request. The origin is only echoed back when it's on
// the allowlist, so other sites can't read the response cross-origin.
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

// Fixed-window in-memory rate limiter: max 10 requests per IP per minute.
// Per-instance only (no shared store, no new dependencies).
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// Generic, client-safe German error message — never leak internal details.
const GENERIC_ERROR =
  "Der klinische Fall konnte nicht generiert werden. Bitte versuche es später erneut.";

// Preflight: answer CORS preflight requests with the allowlist headers.
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

type Difficulty = "vorklinik" | "klinik" | "examen";

// Each difficulty is backed by a pregenerated case bank under public/cases.
const CASE_FILES: Record<Difficulty, string> = {
  vorklinik: "vorklinik.json",
  klinik: "innere.json",
  examen: "pj.json",
};

// Case banks are static build assets, so parse them once and cache in memory.
// A missing/unreadable file is never cached, so it's retried on the next call.
const caseBankCache = new Map<Difficulty, Record<string, unknown>[]>();

async function loadCaseBank(
  difficulty: Difficulty
): Promise<Record<string, unknown>[]> {
  const cached = caseBankCache.get(difficulty);
  if (cached) return cached;
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "cases",
      CASE_FILES[difficulty]
    );
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const cases = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [];
    caseBankCache.set(difficulty, cases);
    return cases;
  } catch {
    // File missing or invalid JSON — caller surfaces a generic error.
    return [];
  }
}

export async function POST(request: Request) {
  const baseHeaders = corsHeaders(request.headers.get("origin"));

  // Rate limit by client IP (first hop in x-forwarded-for behind the proxy).
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es in einer Minute erneut." },
      { status: 429, headers: baseHeaders }
    );
  }

  let topic = "";
  let difficulty: Difficulty = "klinik";
  try {
    const body = await request.json();
    // Cap topic length to keep prompt input bounded.
    topic =
      typeof body.topic === "string" ? body.topic.trim().slice(0, 100) : "";
    if (
      body.difficulty === "vorklinik" ||
      body.difficulty === "klinik" ||
      body.difficulty === "examen"
    ) {
      difficulty = body.difficulty;
    }
  } catch {
    // No body / invalid body is fine — we'll generate a random case at the default level.
  }

  // Serve a random pregenerated case from the matching bank. A specific topic
  // request can't be honored from the bank, so it falls through to an error.
  if (!topic) {
    const bank = await loadCaseBank(difficulty);
    if (bank.length > 0) {
      const picked = bank[Math.floor(Math.random() * bank.length)];
      return NextResponse.json(picked, { headers: baseHeaders });
    }
  }

  // No bank case available (empty bank, or a topic request the bank can't serve).
  return NextResponse.json(
    { error: GENERIC_ERROR },
    { status: 500, headers: baseHeaders }
  );
}
