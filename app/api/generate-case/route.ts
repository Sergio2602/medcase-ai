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

// Optional "reviewed" case bank per difficulty — source-checked cases authored
// manually (Claude/Claude Code chat, added to these files by hand). Entries
// here REPLACE the base-bank entry with the same `id` (so a reviewed case can
// supersede a known-bad one) and any entry with a new `id` is simply added.
// Files are intentionally kept separate from the base bank so in-progress
// review work never mixes with unreviewed content, and so this can be rolled
// out gradually per difficulty.
const REVIEWED_CASE_FILES: Partial<Record<Difficulty, string>> = {
  klinik: "innere-reviewed.json",
  vorklinik: "vorklinik-reviewed.json",
};

// Case banks are static build assets, so parse them once and cache in memory.
// A missing/unreadable file is never cached, so it's retried on the next call.
const caseBankCache = new Map<Difficulty, Record<string, unknown>[]>();

async function readCaseFile(fileName: string): Promise<Record<string, unknown>[]> {
  try {
    const filePath = path.join(process.cwd(), "public", "cases", fileName);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    // Missing or invalid JSON — treated as "no cases from this file".
    return [];
  }
}

async function loadCaseBank(
  difficulty: Difficulty
): Promise<Record<string, unknown>[]> {
  // Skip the cache outside production: case JSON files are actively edited
  // during content work, and public/ is a static asset dir the dev server
  // doesn't watch for this route's purposes — a stale in-memory cache here
  // silently serves outdated content until the process restarts. In
  // production the files are immutable per deploy, so caching is safe there.
  const cacheEnabled = process.env.NODE_ENV === "production";
  const cached = cacheEnabled ? caseBankCache.get(difficulty) : undefined;
  if (cached) return cached;

  const base = await readCaseFile(CASE_FILES[difficulty]);
  const reviewedFile = REVIEWED_CASE_FILES[difficulty];
  const reviewed = reviewedFile ? await readCaseFile(reviewedFile) : [];

  let cases: Record<string, unknown>[];
  if (reviewed.length > 0) {
    // Merge by id: reviewed cases override a base case with the same id
    // (replace), and any reviewed-only id is appended (extend).
    const byId = new Map(base.map((c) => [c.id as string, c]));
    for (const c of reviewed) byId.set(c.id as string, c);
    cases = Array.from(byId.values());
  } else {
    cases = base;
  }

  // Only cache once we have at least one usable case — an empty result during
  // a transient read failure should be retried on the next request, not stuck.
  if (cacheEnabled && cases.length > 0) caseBankCache.set(difficulty, cases);
  return cases;
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

  let difficulty: Difficulty = "klinik";
  try {
    const body = await request.json();
    if (
      body.difficulty === "vorklinik" ||
      body.difficulty === "klinik" ||
      body.difficulty === "examen"
    ) {
      difficulty = body.difficulty;
    }
  } catch {
    // No body / invalid body is fine — we'll serve a random case at the default level.
  }

  // Serve a random case from the matching static bank. There is no live
  // generation path — content is authored offline (Claude/Claude Code) and
  // added to public/cases/*.json (and the *-reviewed.json overlays) directly.
  const bank = await loadCaseBank(difficulty);
  if (bank.length > 0) {
    const picked = bank[Math.floor(Math.random() * bank.length)];
    return NextResponse.json(picked, { headers: baseHeaders });
  }

  // No case available for this difficulty (empty/missing bank file).
  return NextResponse.json(
    { error: GENERIC_ERROR },
    { status: 500, headers: baseHeaders }
  );
}
