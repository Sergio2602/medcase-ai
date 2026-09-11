"use client";

import { usePathname } from "next/navigation";

/**
 * Sanfter Seitenwechsel: sobald sich die Route ändert, wird der Inhalt neu
 * gemountet (key={pathname}) und die page-fade-in-Animation aus globals.css
 * läuft erneut — Inhalt fadet kurz ein statt hart zu wechseln. Bewusst ohne
 * horizontale Verschiebung: ein translateX bleibt Teil des Scroll-Bereichs
 * und erzeugt auf schmalen Viewports Horizontal-Overflow. Greift nur bei
 * Client-Side-Navigation (next/link), nicht bei vollständigem Reload.
 * Respektiert prefers-reduced-motion (siehe CSS).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
