"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "disclaimerSeen";
const COOKIE_DAYS = 365;

export function DisclaimerModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    setCookie(COOKIE_NAME, "true", COOKIE_DAYS);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(15,15,15,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
        style={{
          background: "var(--background)",
          border: "1.5px solid color-mix(in srgb, var(--card-border) 15%, transparent)",
          borderRadius: 16,
          padding: "28px 28px 24px",
          maxWidth: 480,
          width: "100%",
        }}
      >
        {/* Blue shield icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              backgroundColor: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className="ti ti-shield-check" style={{ fontSize: 26, color: "#ffffff" }} />
          </div>
        </div>

        {/* Main text — large */}
        <p
          id="disclaimer-title"
          style={{ fontSize: 16, lineHeight: 1.65, marginBottom: 24, color: "var(--foreground)" }}
        >
          Medcase ist ein Lerntool für Medizinstudierende. Die Fälle sind fiktiv, dienen dem Üben und ersetzen keine ärztliche Diagnose oder Beratung — sie sind nicht geeignet, um reale Patientinnen oder Patienten zu beurteilen.
        </p>

        {/* Fine print */}
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--muted)",
            marginBottom: 24,
          }}
        >
          Diese Seite verwendet ein technisch notwendiges Cookie, um deinen Fortschritt zu speichern — keine Marketing- oder Tracking-Cookies. Wenn du deine E-Mail für Release-Benachrichtigungen hinterlässt, nutzen wir sie ausschließlich dafür, nicht für Marketing. Mit &bdquo;Verstanden&ldquo; bestätigst du, dass du diesen Hinweis gelesen hast. Details:{" "}
          <Link href="/impressum#datenschutz" style={{ color: "var(--accent)" }}>
            Datenschutzerklärung
          </Link>
          ,{" "}
          <Link href="/impressum" style={{ color: "var(--accent)" }}>
            Impressum
          </Link>
          .
        </p>

        {/* CTA button — matches Diagnose-button / accent-CTA style */}
        <button
          onClick={handleAccept}
          className="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ fontSize: 16, fontFamily: "inherit", cursor: "pointer", border: "none" }}
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
