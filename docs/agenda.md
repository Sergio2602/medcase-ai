# Produkt-Agenda — Casolvo (ehem. Medcase)

Eine Liste, alles Offene. Stand: 2026-09-08.
Leitprinzip: Kern-Loop zuerst validieren (Review → Launch → Retention-Daten),
neue Module sind Post-Validierung.

## Offen

- **Procedere-Block (P1) — Details offen, muss noch geklärt werden** *(2026-09-08)* — Entschieden: Therapie/Procedere erscheint als **fest sichtbarer Block** im Ergebnis-Panel (nicht aufklappbar), nicht bepunktet, kein zweiter Spielschritt. Offen: (a) exakte Längenbegrenzung — Vorschlag max. 2 Sätze/~180 Zeichen als Schema-Constraint, weil die Ergebnis-Insel ohne Scrollen sichtbar bleiben muss (Layout-Regel vom 03.09.); (b) Platzierung von `procedereExamNote` (Vorschlag: im bestehenden Details-Bereich); (c) ob die Inhalte gleich in P2-Qualität generiert werden (inkl. 3 Antwortoptionen), um ein späteres Upgrade zur ungepunkteten Selbsttest-Frage ohne Neugenerierung zu ermöglichen; (d) Textregeln verbindlich machen: nie Handlungsform ("In der Prüfung erwartet: …" statt "Geben Sie …"), keine Dosierungen (Wirkstoffklassen ja, mg nein) — hält von der MDR-Zweckbestimmung "klinische Entscheidungsunterstützung" weg; (e) Veralterung: Therapieempfehlungen ändern sich schneller als Diagnosekriterien → Ablaufdatum/Review-Intervall pro Fall vorsehen. Berührt den bestehenden Punkt "Notfall-/Management-Modus".
- **`discipline`-Feld + Fachfilter (Bug, bestätigt 2026-09-08)** — Die Fachauswahl im Hero filtert AKTUELL NICHTS: `app/page.tsx` sendet nur `{ difficulty }`, `app/api/generate-case/route.ts` liest nur `difficulty` und zieht dann `bank[Math.random()*bank.length]` aus der gesamten Bank; `innere.json` enthält Innere- UND Allgemeinmedizin-Fälle gemischt; kein Fall hat ein `discipline`-Feld. Folge: Wer "Allgemeinmedizin" wählt, bekommt z. B. eine AML. To-do: `discipline` als Pflichtfeld ins Case-Schema v2, im Request mitschicken, in der Route filtern; Chips `kardiologie` (Teilgebiet der Inneren → Doppelzuordnung), `chirurgie`, `neurologie`, `hno`, `augenheilkunde`, `anaesthesiologie` aus `DISCIPLINES` entfernen. Beta-Umfang: nur Klinik mit 2 Disziplinen (Innere + Allgemeinmedizin).
- **Fallgenerierung nur noch über Console-API-Key** *(2026-09-08)* — Anthropic Commercial Terms gelten laut Volltext für "Anthropic API keys" und schließen claude.ai ausdrücklich aus; die Copyright-Verteidigung (Abschnitt K.1) setzt "paid use" voraus. Claude Code läuft hier über das Pro-Abo = Consumer Terms. Deshalb: Fallinhalte ausschließlich über das Generierungsskript mit einem Console-Key erzeugen (Vorschlag: eigener Key `casolvo-v2-generation`, Datum notieren), nie im Chat. Code-Arbeit mit Claude Code unter Pro bleibt unproblematisch. Einschränkung ehrlich mitführen: K.3 nimmt u. a. eigene Bearbeitungen des Outputs aus — da jeder Fall von Sergio redigiert wird, ist unklar, wie weit die Verteidigung dann noch trägt. Frage für den Fachanwalt.

- **Reducer-Refactor `app/page.tsx`** — State auslagern; Voraussetzung für die In-Game-Navigation, senkt Bug-Risiko. Fest eingeplant.
- **In-Game-Navigation + Session-Deck** — Deck (Zufallsreihenfolge in `sessionStorage`, „neuer Lauf" löscht) löst zugleich Anti-Repetition. Nur **Lese-Review** beantworteter Fälle, **frei vor/zurück** durch entschiedene Fälle; kein Neu-Beantworten; Revisits nicht doppelt zählen.
- **Bug prüfen: Freeze nach Diagnose-Absenden** — mögliches Blockieren des Main-Threads (evtl. Share-Card). Aus früherer Agenda, noch offen.
- **Statistik-Gelb WCAG-Fix** (1 Zeile) — prüfen, ob durch den Farb-Umbau schon erledigt.
- **Onboarding/WelcomeModal entschärfen + aktualisieren** — 3 Schritte → 1 (oder erst beim 2. Fall); Inhalt seit Rebrand veraltet; Dismiss-Verhalten (Session vs. localStorage) klären.
- **Mobile-Check** — Cerulean-Header-Band bisher nur Desktop → mobil nachziehen; Game/Header auf klein prüfen.
- **Mobile App / PWA** — AddToHomescreen existiert; native-/PWA-Strategie offen (aus früherer Agenda).
- **Marken-Entscheidung (fix):** Basics bleibt **Modul unter Casolvo** (Umbrella: „Casolvo Fälle" + „Casolvo Basics"), **kein separater Brand**. Für SEO ggf. `/basics`-Sektion oder Subdomain statt neuer Marke. „Medplexity" & Co. verworfen (überfüllter „Med-"-Namespace, wirkt als Perplexity-Me-too). Spin-out nur post-Validierung mit Daten.
- **Basics-Modus „Famulatur-Prep"** — Schema fertig (`BASICS_SCHEMA.md`); offen: Track-JSONs OP-Verhalten + Blutentnahme (order-Step), dann `/basics`-Route + Linear-Stepper + Order-Step-UI; 3–5 Szenarien als SEO/Positionierungstest; „rechtliches" separat (needs-legal-review); schematische SVGs statt KI-Fotos.
- **Sprachmodul** — Sprachauswahl auf Home → lokal gespeichert → nur Fälle der Sprachschiene, UI schaltet komplett um; eigene Datei pro Sprache; Übersetzung = Build-Werkzeug → Term-Review → JSON; bilingualer Toggle/Glossar; Sequenz DE→EN→romanisch; Engpass = Review pro Sprache.
- **Notfall-/Management-Modus (+ Therapie-Option zusammengelegt)** — untersuchen → Diagnose → Maßnahme; höchstes medico-legales Risiko; erst Teaser + Interesse-Vote vor Bau.
- **Case-Generator-Agent (Deutsch zuerst)** nach `CASE_SCHEMA` — generate → Staging → Discord → Review → publish; Themen-Ledger + Dedup + Difficulty-Balance; Doppelnutzen (Content-Skalierung + Basis fürs Sprachmodul).
- **Review-System technisch durchtesten** — end-to-end prüfen: Token-Gate, Discord-Notify, `/review`-Spielmodus, `/review/uebersicht` + Export funktionieren.
- **Fachärztliches Review durchführen (kritischer Pfad)** — Reviewer:innen gewinnen: Assistenzärzte zuerst, warmer Kontakt VOR Mail; Ask klein (5 Fälle, ~30 Min, Checkliste); Fokus Cannot-miss-Fälle; mit Einverständnis auf `/ueber-uns` nennen. Blocker für Massen-Launch.
- **Cross-Model-Check** — anderes Modell (z. B. Opus) prüft Sonnet-generierte Fälle als 2., dekorrelierte algorithmische Schicht. Billig, vor menschlichem Review.
- **Prüf-Tabelle (Excel pro Fach)** für Reviewer erstellen.
- **Reviewer-Anschreiben** (mündliche Frage + Follow-up-Mail) als Vorlage.
- **Beiblatt-PDF** (Fall-Begleitblatt) prüfen/erstellen.
- **Quellen-/Methodik-Transparenz auf `/ueber-uns` prüfen** — sind `sourceNotes`/Methodik sichtbar gemacht? (Glaubwürdigkeit vor Ärzte-Ansprache.)
- **QR-Plakat (A4-PDF) + Beobachtungsprotokoll** für 10 Live-Tests (UB/Mensa) erstellen.
- **Rollout Validierungsphase** — 10 Live-Tests → WhatsApp-Jahrgang + Fachschaft Mainz → QR → Assistenzarzt-Review → erst danach Dozenten. Kriterien: D7 ≥ 20 %, ≥ 3 Fälle/Session, 1/10 teilt.
- **Hero-Teaser klickbar machen?** — geparkt bis PostHog-Daten (Hypothese, erst messen).
- **Retention-Hebel (Phase 3, nach ersten Daten)** — Streak / „Fall des Tages", E-Mail-Capture, Share prominenter, mehr Disziplinen freischalten.
- **Monetarisierung testen (Phase 3)** — Freemium / Examens-Paket 15–30 €; erst nach Review + D7 ≥ 20 % + einige hundert WAU. Keine Ads.
- **Bernstein-Akzent nur Score-Ebene** (~#b0791f für Punkte); offene Entscheidung: nur Header-Score vs. ganze Punkte-Ökonomie.
- **Casolvo-Rebrand committen/pushen** — Rebrand + jüngste Änderungen lokal/uncommitted; dabei `layout.tsx` angleichen (Titel „Medcase" → Casolvo, `themeColor` #285dd2 → Cerulean).
- **Sergios eigene To-dos** — Domain kaufen; `REVIEW_ACCESS_KEY` in Vercel setzen; Gratis-Monat nur bei feststehendem Paid-Tier.

## Erledigt

- Analytics (PostHog, cookieless, EU) eingebaut + live verifiziert; Events fließen.
- Landing/Content-Politur, `/statistik`-Metadata, Auswahl-Modal (Smart Default, localStorage), GameScreen-Ladezeit 1,8→0,8 s.
- Review-System end-to-end gebaut: API (Redis + Discord), `/review` als Spielmodus, Session-Feedback, `/review/uebersicht` + Export, Besucher-Rating am Ergebnis-Screen. (→ noch: technisch durchtesten + tatsächlich Reviewer einsetzen.)
- Über-uns- + Q&A-Seiten poliert.
- Marken-/Domain-Recherche → „Casolvo" (sauber), Farbe Cerulean #175e8f, Casolvo-Wortmarke im Header.
- Gameplay-Umbau: Anamnese gratis, 2-Spalten-Befunde, Scroll-Fix (sticky Insel), farbige Akzente (A/B/C-Badges), Header-Cerulean-Band (Desktop), Entrance-Animation.
- Hartes Tageslimit entfernt → Engagement + nicht-blockierender Launch-Nudge; Survey-Kadenz.
- Dokumentation: `CASE_SCHEMA.md`, `BASICS_SCHEMA.md`.
- Git-Hygiene: Lock-File-Workaround (FUSE: nur `mv`) — 2026-07-09. Innere-Fallbank neu (quellenbasiert) — 2026-07-09.
