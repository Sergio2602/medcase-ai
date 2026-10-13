// scripts/lib/env.ts
//
// Gemeinsame Infrastruktur für die Pipeline-v2-Skripte: .env.local laden (gleicher
// minimaler Loader wie in generate-cases.ts, keine dotenv-Abhängigkeit), Anthropic-Client
// bauen, Standard-Modell festlegen.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..", "..");

function loadEnvLocal(): void {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY ist nicht gesetzt. In der Umgebung oder in .env.local eintragen."
  );
  process.exit(1);
}

// Regulärer API-Key über die Anthropic-Plattform (Commercial Terms) — siehe
// DECISION_LOG.md 2026-09-13: Pipeline v2 nutzt ausschließlich die API, nie Claude-Chat.
export const anthropic = new Anthropic({ apiKey: API_KEY });

// Gleicher Default wie generate-cases.ts / app/api/generate-case/route.ts, per Env
// überschreibbar.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
