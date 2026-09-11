"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

// Gemeinsame Waitlist-Logik für den permanenten Home-Block und den In-Game-Nudge.
// Sauberes Release-Intent-Signal: kein Sofort-Reward, nur der intent-alignte Perk
// "1 Monat gratis zum Launch" (schätzt nur, wer den Release wirklich nutzen will).

export function WaitlistForm({
  source,
  onDone,
}: {
  source: string;
  onDone?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@") || !consent || state === "sending") return;
    setState("sending");
    track("waitlist_signup", { source });
    try {
      const res = await fetch("/api/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "waitlist", email: clean }),
      });
      if (!res.ok) throw new Error();
      try {
        // Wer sich eingetragen hat, sieht den Tages-Nudge nie wieder.
        localStorage.setItem("medcase:waitlistJoined", "1");
      } catch {}
      setState("ok");
      if (onDone) setTimeout(onDone, 1600);
    } catch {
      setState("error");
    }
  }

  if (state === "ok") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-[#e8f5e9] px-3.5 py-3 text-[#1b5e20]">
        <i className="ti ti-check text-lg" />
        <p className="text-sm font-semibold">Notiert. Wir melden uns zum Launch.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@mail.de"
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="min-w-0 flex-1 rounded-lg border-[1.5px] border-card-border/25 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
        />
        <button
          onClick={submit}
          disabled={!email.includes("@") || !consent || state === "sending"}
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "sending" ? "…" : "Bescheid geben"}
        </button>
      </div>
      <label className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <span>
          Ich bin einverstanden, dass meine E-Mail für die Launch-Benachrichtigung gespeichert
          wird (siehe{" "}
          <a href="/impressum#datenschutz" className="underline underline-offset-2 hover:text-accent">
            Datenschutzerklärung
          </a>
          ). Jederzeit abbestellbar.
        </span>
      </label>
      {state === "error" && (
        <p className="mt-1.5 text-[12.5px] text-[#b3524f]">Hat nicht geklappt, bitte nochmal.</p>
      )}
    </div>
  );
}

// Permanenter, dezenter Waitlist-Block für die Startseite — der "jederzeit
// nachholbar"-Anker: wer den In-Game-Nudge wegklickt, findet es hier wieder.
export function HomeWaitlistCard() {
  return (
    <div className="card mt-3 p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <i className="ti ti-bell text-base" />
            </span>
            <p className="text-lg font-extrabold tracking-tight">Sei beim Launch als Erste:r dabei</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Wenn Medcase live geht, sagen wir dir einmal kurz Bescheid und du bekommst
            deinen <span className="font-semibold text-foreground">1 Monat gratis</span>. Keine
            Werbung, jederzeit abbestellbar.
          </p>
        </div>
        <div className="w-full sm:max-w-xs">
          <WaitlistForm source="home" />
        </div>
      </div>
    </div>
  );
}
