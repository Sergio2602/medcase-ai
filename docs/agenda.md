# Produkt-Agenda — MedCase.AI

Lebendes Dokument für Themen außerhalb der reinen Fall-Erstellung (dafür ist
`docs/case-tracking.md` zuständig). Hier landet alles, was wir besprochen,
aber noch nicht umgesetzt haben — damit nichts zwischen Sessions verloren
geht.

## Offen

- **Onboarding-Tutorial/WelcomeModal überarbeiten.** Aktuell zeigt
  `app/page.tsx` (`WelcomeModal`) bei jedem Seitenaufruf Sergios Intro-Text,
  neu erscheinend pro Session (kein localStorage-Dismiss). Inhalt/Ablauf ist
  seit den letzten Redesigns (Breite, Result-Island, Case-Kontext-Badge,
  neue Fallbank) nicht mehr angepasst worden — noch zu klären: was genau
  veraltet ist (Text, Screenshots/Beispiele, Ablauf?) und ob das Dismiss-
  Verhalten (aktuell: nur pro Session) beibehalten werden soll.

## Erledigt

- Git-Sicherheitshygiene: Lock-File-Workaround dokumentiert (`.git/index.lock`
  über FUSE-Mount nicht per `rm`, nur per `mv` entfernbar) — 2026-07-09.
- Innere-Fallbank komplett neu aufgebaut (11 quellenbasierte Fälle,
  Anti-Giveaway-Schema) — 2026-07-09, siehe `docs/case-tracking.md`.
