import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

// Nimmt Waitlist-Anmeldungen und den Studenten-Micro-Survey entgegen und
// speichert sie in Upstash Redis. Das frühere Experten-Review (/review,
// kind "case"/"session", REVIEW_ACCESS_KEY-Gate) wurde komplett entfernt.

export async function POST(req: NextRequest) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return NextResponse.json({ error: "Speicher nicht konfiguriert." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  const timestamp = new Date().toISOString();

  // Waitlist: E-Mail für Gratis-Monat bei Release (am Tageslimit erfasst).
  if (body.kind === "waitlist") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ungültige E-Mail." }, { status: 400 });
    }
    await redis.set(`waitlist:${email}`, { email, timestamp });
    return NextResponse.json({ success: true });
  }

  // Studenten-Micro-Survey (offen): nur nach Redis, kein Discord-Ping (sonst
  // Spam). PostHog-Event feuert der Client separat.
  if (body.kind === "student") {
    await redis.set(`studentFeedback:${Date.now()}`, {
      kind: "student",
      nutzung: body.nutzung ?? "",
      preis: body.preis ?? "",
      timestamp,
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unbekannter Feedback-Typ." }, { status: 400 });
}
