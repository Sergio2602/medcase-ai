"use client";

import { useEffect, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "medcase_a2hs_seen";
const COOKIE_DAYS = 30;

function isIOSSafariNotInstalled(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return isIOS && isSafari && !isStandalone;
}

export function AddToHomescreenBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (getCookie(COOKIE_NAME)) return;
    if (isIOSSafariNotInstalled()) setShow(true);
  }, []);

  function dismiss() {
    setCookie(COOKIE_NAME, "1", COOKIE_DAYS);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 55,
        backgroundColor: "#ffffff",
        border: "1.5px solid #d8d6cd",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
      role="status"
    >
      <i
        className="ti ti-share-2"
        style={{ fontSize: 20, color: "#285dd2", flexShrink: 0, marginTop: 1 }}
        aria-hidden
      />
      <p style={{ fontSize: 13, lineHeight: 1.5, flex: 1, color: "#0f0f0f", margin: 0 }}>
        Für schnelleren Zugriff: Tippe auf{" "}
        <strong>Teilen</strong> →{" "}
        <strong>Zum Home-Bildschirm hinzufügen</strong>
      </p>
      <button
        onClick={dismiss}
        aria-label="Schließen"
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#5f5e5a",
          fontSize: 18,
          lineHeight: 1,
          padding: 2,
        }}
      >
        <i className="ti ti-x" aria-hidden />
      </button>
    </div>
  );
}
