import posthog from "posthog-js";

// Zentraler Analytics-Wrapper (PostHog, EU-Cloud, cookieless).
//
// Datenschutz-Entscheidungen (bewusst, nicht zufällig):
// - persistence "localStorage": keine Cookies → kein Consent-Banner nötig.
// - autocapture aus: nur unsere explizit benannten Events, kein Klick-Rauschen
//   und keine unbeabsichtigt erfassten Seiteninhalte.
// - Session Recording aus: Bildschirmaufzeichnung ist DSGVO-heikler als
//   anonyme Events und für die Validierungsphase unnötig.
// - respect_dnt: "Do Not Track" im Browser wird respektiert.
//
// Ohne NEXT_PUBLIC_POSTHOG_KEY sind init/track/trackPageview No-ops —
// lokale Entwicklung funktioniert also auch ganz ohne Key.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || !KEY || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: HOST,
    persistence: "localStorage",
    autocapture: false,
    // Pageviews feuern wir selbst pro App-Router-Navigation (siehe
    // AnalyticsProvider) — der automatische Capture greift nur beim
    // Init und würde SPA-Navigationen verpassen.
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    respect_dnt: true,
  });
  initialized = true;
}

export function trackPageview() {
  if (!initialized) return;
  posthog.capture("$pageview");
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
