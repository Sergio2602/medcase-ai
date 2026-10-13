import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./globals.css";
import { AddToHomescreenBanner } from "./components/AddToHomescreenBanner";
import { AnalyticsProvider } from "./components/AnalyticsProvider";
import { DisclaimerBanner } from "./components/DisclaimerModal";
import { PageTransition } from "./components/PageTransition";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// Update 07.10.2026 (Sergio, "aus Spaß"): Wordmark-Schrift für das
// Casolvo-Logo — scharfe, kontrastreiche Serife als freier Ersatz für die
// kommerzielle "Spitzkant" (nicht lizenziert, siehe Chat). opsz/soft/wght
// sind bei Fraunces als Achsen verfügbar, Next.js lädt hier feste Schnitte.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  // Update 07.10.2026 (Sergio: "zu klobig" bei 700) — 500 wirkt deutlich
  // schlanker/eleganter, 600 bleibt als Option für später.
  weight: ["500", "600"],
  style: ["normal"],
});

const TITLE = "Casolvo — Klinische Fälle üben";
const DESCRIPTION =
  "Casolvo trainiert klinisches Denken anhand realistischer Patientenfälle für Vorklinik, Klinik und PJ.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.json",
  // Favicon/App-Icons kommen über die Next.js-Dateikonvention automatisch:
  // app/favicon.ico, app/icon.png, app/apple-icon.png — kein manuelles
  // icons-Feld mehr nötig (der alte Verweis auf /icon-192.png existierte
  // nicht und führte zu einem kaputten Apple-Touch-Icon).
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Medcase",
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#285dd2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} ${ibmPlexMono.variable} ${fraunces.variable} antialiased`}>
        <AnalyticsProvider />
        <PageTransition>{children}</PageTransition>
        <DisclaimerBanner />
        <AddToHomescreenBanner />
      </body>
    </html>
  );
}
