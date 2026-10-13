"use client";

import { SiteHeader, type SiteSection } from "./SiteHeader";

/**
 * Update 13.10.2026 (Local-Test 1, Sergio: Unterseiten-Header wie auf Home):
 * Die alte zweizeilige Navigationsleiste ist ersetzt durch den einheitlichen
 * SiteHeader (Navy, Menü links, Logo mittig, Profil rechts). Name und
 * Signatur bleiben, damit die Unterseiten unverändert importieren können.
 */
export function CenteredNav({ active }: { active: SiteSection }) {
  return <SiteHeader active={active} />;
}
