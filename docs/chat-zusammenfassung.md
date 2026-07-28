# Medcase — Zusammenfassung Arbeitssession

Stand: 15.07.2026

---

## 1. Was umgesetzt & live ist (dieser Sprint)

**Analytics (die Validierungs-Grundlage)**
- PostHog eingebaut: cookieless, EU-Cloud, kein Consent-Banner, localhost ausgeschlossen.
- Events: `fall_gestartet`, `fall_abgeschlossen` (inkl. Befund-Anzahl + Dauer), `share_geklickt`, `fall_gemeldet`, `fall_generierung_fehlgeschlagen`, `$pageview`.
- Live verifiziert — Events fließen.

**Landing / Inhalt**
- SSR-Zahlen gefixt (zeigten „0" für Crawler/Previews → echte Werte).
- Evidenz-Sektion „Warum dieses Training im Studium fehlt" (GMS-2020-Quelle, verifiziert).
- Subhead konkretisiert, Limit-Copy als Tagesration („Heute 5 freie Fälle").
- Abschluss-CTA am Seitenende, Nav-Reihenfolge (Über uns vor Statistik).
- `/statistik`: eigene Metadata + Skeleton statt „Lädt …".
- „Erfahre mehr über unser Konzept" scrollt jetzt zur Evidenz-Sektion.

**GameScreen (Spielbildschirm)**
- Ladezeit 1,8s → 0,8s.
- In-Game-Status-Chips („Klinik" · „Zufällig") statt Breadcrumb.
- Befund-Karten in umgekehrter Aufdeck-Reihenfolge (zuletzt angefordert oben — kein Scrollen).
- Empty-State im Befund-Bereich („Was brauchst du, um zur Diagnose zu kommen?").
- Label-Fix: Schwierigkeit „Klinik" statt „Innere".

**Auswahl-Modal (Aktivierung / Problem 1)**
- Disclaimer erscheint erst beim ersten Spiel-Klick (nicht mehr beim Pageload).
- Modal breiter (max-w-2xl), drei Niveau-Karten nebeneinander (Desktop) / gestapelt (Mobile).
- Smart Default: Klinik bzw. letzte Wahl vorausgewählt, mit „Vorausgewählt"-Badge (verschwindet bei erster Interaktion).
- Fach-Auswahl eingeklappt (Default „Zufällig", aufklappbar) — Erstkontakt = eine Entscheidung.
- Wahl per localStorage gemerkt → Wiederkehrer startet mit einem Klick.
- Aktiver Start-Button mit dezenter Pfeil-Animation, Titel „Niveau wählen".

**Bewusst NICHT verändert:** Hero-Landingpage bleibt wie im Original (single „Ersten Fall ausprobieren" → Modal, „Erfahre mehr"-Outline-Button).

---

## 2. Strategie & Positionierung

**Zielgruppe:** ~113.000 Medizinstudierende in Deutschland, ~65 % weiblich, mobil, abends, AMBOSS/Anki-gewohnt.

**Differenzierung (bestätigt, echt):** AMBOSS = Wissens-Nachschlagewerk + Kreuzen. Medcase = aktives klinisches Denken (Befunde selbst anfordern unter Kostendruck). Das deckt AMBOSS **nicht** ab — es ist die Famulatur-/PJ-Vorbereitung, der Sprung von „Fakten kennen" zu „Patient aufarbeiten". Forschung stützt die Lücke (deutsche Studierende fordern nachweislich zu viele unnötige Befunde an; Clinical Reasoning kaum gelehrt, nur ~50 % kennen den Begriff).

---

## 3. Monetarisierung (Erkenntnisse — Phase 3, nicht jetzt)

- **AMBOSS-Preise:** Studierende 8,25 €/Monat (Jahr) bzw. 11,99 €/Monat; ~90 % der Unis stellen AMBOSS gratis (Campuslizenz). Kreuz-Upgrade (Prüfungsphase) 39–139 €.
- **Wichtig:** Studenten zahlen nicht fürs Grundtool, aber sehr wohl zeitlich begrenzt für Prüfungs-/Übergangs-Endspurt.
- **WTP heute: ~0 €** (70 Fälle, kein Review → kein Zahlungsgrund).
- **WTP reif** (fachärztlich geprüft, ~150+ Fälle, belegte Wirkung): Einmal-Paket „Famulatur-/PJ-ready" 15–30 €, oder 5–8 €/Monat im aktiven Fenster. Freemium passt (Tageslimit ist schon der Keim).
- **Werbung = Quatsch** für dieses Produkt: Nischen-CPM ~2 € → ~40 €/Monat bei 1.000 Nutzern, dafür Vertrauensschaden. Pfad ist Freemium/Examens-Paket, nicht Ads.
- **Nicht monetarisieren, bis:** (a) Review durch, (b) D7-Retention ≥ 20 %, (c) ein paar Hundert wöchentlich aktive Nutzer. Niedriger Preis erhöht die Abhängigkeit von Masse, umgeht die Voraussetzungen nicht.

---

## 4. Review — der kritische Pfad

**Zwei verschiedene „Reviews" nicht verwechseln:**
- **Fachärztliches Review** = ist der Fall medizinisch *korrekt*? → Glaubwürdigkeits-Grundlage.
- **In-App-Bewertung „zu leicht/schwer"** = Kalibrierung/Engagement. Kein Ersatz fürs fachärztliche Review.

**Erstellungsschema geprüft:** überdurchschnittlich (evidenzbasierte Auswahl, nur Primärquellen, Konsistenz-Check, Strukturvalidierung). **Lücke:** kein unabhängiger Korrektheits-Check. Ein Fall kann intern konsistent und trotzdem klinisch falsch sein.

**Warum KI-prüft-KI nicht reicht:** Fehler-*Dekorrelation*, nicht Kompetenz, ist der Punkt. Schreibt und prüft dieselbe Modellfamilie, teilen sie dieselben blinden Flecken. Der Wert eines unabhängigen Menschen ist, dass seine Fehler anders verteilt sind.

**Pragmatischer Mittelweg (nicht „Vollreview oder nichts"):**
1. Cross-Model-Check als zweite algorithmische Schicht (anderes Modell, z.B. Opus, prüft Sonnet-generierte Fälle) — echt dekorreliert, billig.
2. Ein Assistenzarzt spot-checkt nur die **38 Cannot-miss-Fälle** (höchstes Risiko) — ~1–2 Std, deckt das gefährlichste Viertel.

**Review ist der Blocker für den Massen-Launch** (Fachschaft, Jahrgangsgruppen, Dozenten). Usability-Tests mit 10 Leuten gehen parallel.

---

## 5. Reviewer gewinnen — erst Assistenzärzte, warm vor Mail

**Zielgruppe der Reviewer: Assistenzärzte zuerst** (zugänglich, glaubwürdig genug) — NICHT Dozenten/Professoren am Anfang. Ein skeptischer Professor, der einen Fehler findet, verbrennt den Ruf an der eigenen Fakultät. Dozenten erst NACH dem Review, mit dem Clinical-Reasoning-Evidenzargument.

**Reihenfolge: erst warmer persönlicher Kontakt, dann Mail — nie Kalt-Mail zuerst.**
- Kalt-Mail an busy Assistenzarzt = wird ignoriert.
- Warmer mündlicher/WhatsApp-Ask → „Ja" → dann Mail mit fertigem Prüf-Artefakt.

**Wen:** jemanden, der Sergio schon kennt — Ärzte aus bisherigen Famulaturen, Familie/Freundeskreis, PJ-ler ein Jahr höher, über die Fachschaft Mainz.

**Ask klein halten:** nicht „review meine App", sondern „5 Fälle, ~30 Min, ich schick dir eine Checkliste, geht nur um plausibel/nicht, du wirst als Reviewer genannt wenn du magst".

**Ablauf:** warme Frage → „Ja" → Prüf-Tabelle (5–10 Cannot-miss-Fälle) → Korrekturen einpflegen → mit Einverständnis auf `/ueber-uns` als Reviewer nennen (= Glaubwürdigkeit + erster Fürsprecher).

---

## 6. Nächste Schritte

**Offen / Phase 1 (kleine Fixes vor Launch):**
- Fachärztliches Review anstoßen (der kritische Pfad — siehe oben).
- Freeze nach Diagnose-Absenden prüfen (mögliches Bug-Risiko, evtl. Share-Card blockiert Main-Thread).
- Statistik-Gelb WCAG-Fix (1 Zeile).
- Onboarding-Tour entschärfen (3 Schritte → 1 oder erst beim 2. Fall).
- Domain (medcase.de) + Domain-Mail — Sergios Aktion.

**Phase 2 — Launch & Validierung** (Details in `docs/validierung-analytics-plan.md`): 10 Live-Tests UB/Mensa → WhatsApp-Jahrgangsgruppe + Fachschaft → QR-Plakate → Assistenzarzt-Review → dann Dozenten. Erfolgskriterien: D7 ≥ 20 %, ≥ 3 Fälle/Session, 1/10 teilt.

**Phase 3 — nach den ersten Daten:** Retention-Hebel (Streak / „Fall des Tages"), E-Mail-Capture, Share prominenter, mehr Disziplinen freischalten, Monetarisierung testen.

**Sofort machbar (auf Zuruf):** Cross-Model-Check an 5 Cannot-miss-Fällen · Prüf-Tabelle (Excel pro Fach) fürs Review · Reviewer-Anschreiben (mündliche Frage + Follow-up-Mail) · QR-Plakat + Beobachtungsprotokoll.

---

## Kern-Botschaft (als kritischer Reviewer)

Das Produkt ist launch-reif. Die größte Gefahr ab jetzt ist Weiterpolieren im luftleeren Raum. Der eine Hebel, der zählt: **Review → Launch → Retention-Daten.** Danach beantwortet sich alles andere (inkl. Preis) mit echten Zahlen statt Schätzungen.
