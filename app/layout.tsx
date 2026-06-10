import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedCase.AI – Diagnosespiel für Medizinstudierende",
  description:
    "Übe klinische Fallbeispiele für Physikum und Staatsexamen. Befrage, untersuche und diagnostiziere Patienten – auf Deutsch.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Match the dark teal header so the iOS status bar / browser chrome blends in.
  themeColor: "#074F42",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
