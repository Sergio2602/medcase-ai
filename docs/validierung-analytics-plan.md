# Validierungsphase: Analytics + Offline-Material (GEPARKT — später umsetzen)

Stand: 14.07.2026. Beschlossen mit Claude, Umsetzung auf Zuruf.

## Schritt 0: Analytics (Voraussetzung für alles andere)

**Entscheidung: PostHog** (EU-Cloud, cookieless, kostenlos bis 1 Mio Events/Monat).

Begründung: Einziges kostenloses Tool, das alle drei Erfolgskriterien misst
(D7-Retention, Fälle/Session, Funnels). Plausible = 9 €/Monat, schwache
Retention. Vercel Analytics Hobby = nur Pageviews.

**Vorarbeit Sergio:**
1. Account auf posthog.com anlegen, **EU-Region** wählen.
2. Project API Key an Claude geben.

**Einbau (Claude, ~1 Std):**
- PostHog-Snippet cookieless konfigurieren (kein Consent-Banner nötig, keine
  personenbezogenen Daten).
- Events: `fall_gestartet` (mit difficulty/discipline), `fall_abgeschlossen`,
  `diagnose_korrekt` / `diagnose_falsch` (mit Anzahl angeforderter Befunde),
  `share_geklickt`, `fall_gemeldet`.
- 3 Dashboards beschreiben: Retention-Kurve, Funnel (Landing → Fall gestartet
  → abgeschlossen), Events pro Tag.

## Erfolgskriterien (vorab definiert, nicht nachträglich verbiegen)

- D7-Retention ≥ 20 % → weitermachen.
- ≥ 3 Fälle pro Session im Schnitt → Kernmechanik trägt.
- ≥ 1 von 10 teilt den Link unaufgefordert → organisches Wachstum möglich.
- Nach 100 Nutzern D7 < 5 % → Produkt hinterfragen, nicht Marketing erhöhen.

## Geparkt bis PostHog-Daten vorliegen

- **Hero-Teaser klickbar machen** (echtes Mini-Spiel statt Timer-Auflösung):
  Hypothese, kein Fakt — Sergios Einwand „man probiert doch eh direkt aus"
  ist berechtigt, da der CTA direkt darunter sitzt. Entscheidung nach
  Messung: Teaser-Interaktion vs. direkter CTA-Klick.

## Offline-Material (Claude erstellt auf Zuruf)

1. **QR-Plakat (A4-PDF, druckfertig):** Fall als Köder („58-Jähriger,
   Brustschmerz seit heute Morgen. Findest du die Diagnose mit 3 Befunden?")
   + QR + „Kostenlos, kein Account". Für UB + Mensa.
2. **Beobachtungsprotokoll (1 Seite):** für die 10 Live-Tests — Zögern wo?
   Punktesystem verstanden? Abbruch wann? Nutzer-Zitat.
3. **Reviewer-Anschreiben (Vorlage):** Assistenzärzte, 5 Fälle gegenlesen,
   ~30 Min, optional Nennung als Reviewer auf der Seite.

## Rollout-Reihenfolge (4–6 Wochen, ~0 €)

Analytics → 10 Live-Tests (UB/Mensa) → nachbessern → WhatsApp-Jahrgangsgruppe
(EIN Jahrgang zuerst) + Fachschaft Mainz → QR als Beifang →
Assistenzarzt-Review → erst danach Dozenten (Skills-Lab/AG Lehre, mit
Clinical-Reasoning-Evidenzargument).

**Dozenten-Warnung:** Nicht vor abgeschlossenem fachärztlichem Review
kontaktieren — ein gefundener fachlicher Fehler verbrennt den Ruf an der
eigenen Fakultät.
