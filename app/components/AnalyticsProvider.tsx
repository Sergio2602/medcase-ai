"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, trackPageview } from "@/lib/analytics";

// Initialisiert PostHog einmalig im Client und feuert bei jeder
// App-Router-Navigation einen $pageview. Rendert nichts.
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageview();
  }, [pathname]);

  return null;
}
