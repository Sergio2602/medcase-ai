import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
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

const TITLE = "Medcase — Klinisches Denken trainieren";
const DESCRIPTION =
  "Medcase trainiert klinisches Denken anhand realistischer Patientenfälle für Vorklinik, Klinik und PJ.";

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
    <html lang="de">
      <body className={`${inter.variable} ${ibmPlexMono.variable} antialiased`}>
        <AnalyticsProvider />
        <PageTransition>{children}</PageTransition>
        <DisclaimerBanner />
        <AddToHomescreenBanner />
      </body>
    </html>
  );
}
