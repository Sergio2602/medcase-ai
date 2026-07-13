"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "medcase_onboarding_seen";
const COOKIE_DAYS = 365;

const STEPS = [
  "Der Patient schildert dir seine Beschwerden.",
  "Hier kannst du Befunde aufdecken — jeder kostet dich 10 Punkte.",
  "Stelle die Diagnose mit den Befunden, die du wirklich brauchst. Je weniger du aufdeckst, desto mehr Punkte bekommst du. Viel Erfolg :)",
] as const;

interface TooltipStyle {
  top: number;
  left: number;
  width: number;
  arrowBelow: boolean; // true = arrow at top (tooltip below target), false = arrow at bottom (tooltip above)
  arrowOffset: number; // horizontal offset of arrow within tooltip
}

export function OnboardingTour({
  step1Ref,
  step2Ref,
  step3Ref,
}: {
  step1Ref: RefObject<HTMLElement | null>;
  step2Ref: RefObject<HTMLElement | null>;
  step3Ref: RefObject<HTMLElement | null>;
}) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(1);
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME) && getCookie("disclaimerSeen")) setActive(true);
  }, []);

  const refs = [step1Ref, step2Ref, step3Ref] as const;

  const getCurrentEl = useCallback(
    () => refs[step - 1]?.current ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, step1Ref, step2Ref, step3Ref]
  );

  const recalcTooltip = useCallback(() => {
    const el = getCurrentEl();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;
    const tooltipW = isMobile ? vw - 32 : 320;
    const estimatedH = 160;
    const gap = 12;

    const spaceBelow = vh - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const placeBelow = spaceBelow >= estimatedH || spaceBelow >= spaceAbove;

    let top: number;
    if (placeBelow) {
      top = rect.bottom + gap;
    } else {
      top = Math.max(8, rect.top - estimatedH - gap);
    }

    // clamp so tooltip doesn't fall off screen
    top = Math.min(top, vh - estimatedH - 8);

    let left: number;
    if (isMobile) {
      left = 16;
    } else {
      left = Math.max(16, Math.min(rect.left, vw - tooltipW - 16));
    }

    // arrow horizontal offset relative to tooltip left edge, pointing toward target center
    const targetCenterX = rect.left + rect.width / 2;
    const arrowOffset = Math.max(12, Math.min(targetCenterX - left - 6, tooltipW - 24));

    setTooltipStyle({ top, left, width: tooltipW, arrowBelow: placeBelow, arrowOffset });
  }, [getCurrentEl]);

  // Apply spotlight to active element
  useEffect(() => {
    if (!active) return;
    const el = getCurrentEl();
    if (!el) return;

    el.style.boxShadow = "0 0 0 9999px rgba(15,15,15,0.6)";
    el.style.position = "relative";
    el.style.zIndex = "50";
    el.style.borderRadius = "14px";
    if (!prefersReducedMotion.current) {
      el.style.transition = "box-shadow 0.2s ease";
    }

    requestAnimationFrame(recalcTooltip);

    return () => {
      el.style.boxShadow = "";
      el.style.position = "";
      el.style.zIndex = "";
      el.style.borderRadius = "";
      el.style.transition = "";
    };
  }, [active, step, getCurrentEl, recalcTooltip]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", recalcTooltip);
    window.addEventListener("scroll", recalcTooltip, { passive: true });
    return () => {
      window.removeEventListener("resize", recalcTooltip);
      window.removeEventListener("scroll", recalcTooltip);
    };
  }, [active, recalcTooltip]);

  function finish() {
    setCookie(COOKIE_NAME, "1", COOKIE_DAYS);
    setActive(false);
  }

  function advance() {
    if (step < 3) setStep((s) => s + 1);
    else finish();
  }

  if (!active) return null;

  return (
    <>
      {/* Skip link — fixed top-right throughout the tour */}
      <button
        onClick={finish}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 60,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(4px)",
          border: "1.5px solid rgba(255,255,255,0.18)",
          borderRadius: 8,
          color: "rgba(255,255,255,0.9)",
          fontSize: 13,
          fontWeight: 600,
          padding: "6px 14px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Überspringen
      </button>

      {/* Tooltip */}
      {tooltipStyle && (
        <div
          style={{
            position: "fixed",
            top: tooltipStyle.top,
            left: tooltipStyle.left,
            width: tooltipStyle.width,
            zIndex: 60,
            backgroundColor: "#285dd2",
            color: "#ffffff",
            borderRadius: 14,
            padding: "16px 20px",
            boxShadow: "0 4px 24px rgba(15,15,15,0.25)",
            fontFamily: "inherit",
          }}
        >
          {/* Arrow */}
          {tooltipStyle.arrowBelow ? (
            // Tooltip below target → arrow at top pointing up
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: -7,
                left: tooltipStyle.arrowOffset,
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderBottom: "7px solid #285dd2",
              }}
            />
          ) : (
            // Tooltip above target → arrow at bottom pointing down
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: -7,
                left: tooltipStyle.arrowOffset,
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "7px solid #285dd2",
              }}
            />
          )}

          {/* Step label */}
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              opacity: 0.75,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            SCHRITT {step} VON 3
          </p>

          {/* Step text */}
          <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 16 }}>
            {STEPS[step - 1]}
          </p>

          {/* Bottom row: dots + button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Dot indicators */}
            <div style={{ display: "flex", gap: 6 }}>
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 6,
                    width: i + 1 === step ? 18 : 6,
                    borderRadius: i + 1 === step ? 3 : 9999,
                    backgroundColor: "#ffffff",
                    opacity: i + 1 === step ? 1 : 0.4,
                  }}
                />
              ))}
            </div>

            {/* CTA button */}
            <button
              onClick={advance}
              style={{
                backgroundColor: "#ffffff",
                color: "#285dd2",
                border: "none",
                borderRadius: 8,
                padding: "7px 16px",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {step === 3 ? "Los geht's →" : "Weiter →"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
