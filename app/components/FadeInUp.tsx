"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-Reveal-Wrapper: Kinder starten leicht nach unten versetzt + leicht
 * verkleinert/unsichtbar und faden beim ersten Sichtbarwerden sanft mit
 * einem leichten Scale-Pop ein ("Aufploppen"). Nur einmal pro Element,
 * respektiert prefers-reduced-motion. Gemeinsam genutzt von Home, Statistik,
 * Über uns und Impressum für ein konsistentes Scroll-Erlebnis.
 */
export function FadeInUp({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // rootMargin zieht die untere Trigger-Kante nach oben: Elemente, die
      // schon beim Laden knapp im Viewport liegen, poppen dadurch merklich
      // beim Scrollen auf, statt sofort und quasi unsichtbar zu erscheinen.
      { threshold: 0.1, rootMargin: "0px 0px -15% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="transition-all duration-[700ms] ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.96)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
