import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, DISCORD_WEBHOOK_URL } =
    process.env;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return NextResponse.json(
      { error: "KV_REST_API_URL oder KV_REST_API_TOKEN fehlt." },
      { status: 500 }
    );
  }

  if (!DISCORD_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "DISCORD_WEBHOOK_URL fehlt." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.caseId || !body.difficulty) {
    return NextResponse.json(
      { error: "caseId und difficulty sind Pflichtfelder." },
      { status: 400 }
    );
  }

  const { caseId, difficulty, reason = "" } = body as {
    caseId: string;
    difficulty: string;
    reason?: string;
  };

  const timestamp = new Date().toISOString();
  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });

  const [, discordRes] = await Promise.all([
    redis.set(`caseReports:${caseId}:${Date.now()}`, {
      caseId,
      reason,
      difficulty,
      timestamp,
    }),
    fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: [
          `**Fall gemeldet**`,
          `• Fall-ID: \`${caseId}\``,
          `• Schwierigkeit: ${difficulty}`,
          reason ? `• Hinweis: ${reason}` : null,
          `• Zeitpunkt: ${timestamp}`,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    }),
  ]);

  if (!discordRes.ok) {
    console.error("Discord-Webhook fehlgeschlagen:", await discordRes.text());
  }

  return NextResponse.json({ success: true });
}
