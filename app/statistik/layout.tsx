import type { Metadata } from "next";

// Eigene Metadata für /statistik — die Seite selbst ist ein Client
// Component (localStorage), deshalb liegt der Metadata-Export hier im
// Server-Layout statt in page.tsx.
export const metadata: Metadata = {
  title: "Deine Statistik — Medcase",
  description:
    "Dein Lernfortschritt bei Medcase: Trefferquote, Fachbereiche und gelöste Fälle — lokal auf deinem Gerät gespeichert, ohne Account.",
};

export default function StatistikLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
