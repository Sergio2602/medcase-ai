import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./globals.css";
import { AddToHomescreenBanner } from "./components/AddToHomescreenBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Medcase — Klinisches Denken trainieren",
  description:
    "Medcase trainiert klinisches Denken anhand realistischer Patientenfälle für Vorklinik, Klinik und PJ.",
  manifest: "/manifest.json",
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        {children}
        <AddToHomescreenBanner />
      </body>
    </html>
  );
}
