# Case-Pipeline v2 — technischer Bauplan

Kurzreferenz für die Umsetzung. Rechtlicher Hintergrund und vollständige
Begründung: `claude/uebergabe-fallgenerierung-v2.md` im Claude-Projekt
(Legal-Audit-Handover, 2026-09-08) — dieses Dokument wiederholt das nicht,
sondern verweist nur.

**Status:** Alle automatisierten Stufen (1–4) plus Orchestrierung gebaut und mit
Selbsttests abgesichert (`npx tsx scripts/<datei>.ts --selftest` für jede lib-Datei
und für `generate-case-v2.ts`). **Noch nicht live ausgeführt** — kein End-to-End-Lauf
gegen die echte API in dieser Session, da weder `ANTHROPIC_API_KEY` noch
`SERPER_API_KEY` hier gesetzt sind. Vor dem ersten echten Lauf: Sergio prüft den Code
gegen (per anderer Chat-Session), dann `.env.local` befüllen, dann `scripts/test-topic.example.json`
als erster Testfall.

## Warum diese Struktur

Jede Stufe ist ein juristisch wirksamer Schnitt, nicht nur Code-Organisation:

- Stufe 0 (Themenauswahl) muss von Sergio kommen → dokumentierter
  menschlicher Beitrag.
- Stufe 1 (Faktenextraktion) und Stufe 2 (Fallkonstruktion) sind
  **getrennte API-Calls mit getrenntem Kontext** — Stufe 2 sieht die
  Quelltexte nie, nur das Faktenblatt. Das ist der wirksamste
  Einzel-Schritt gegen unbewusste Übernahme geschützten Ausdrucks.
- Stufe 3 (Patient/Labor) kommt aus eigenen Randomizern, nicht vom Modell.
- Stufe 3.5 (medizinische Gegenprüfung) ist ein eigener Call mit frischem
  Kontext und eigener Quellen-Whitelist. Er sieht das Faktenblatt **ohne
  Quellenangaben** — sonst bestätigt er den Fall gegen dieselbe Quelle, aus
  der er stammt, und prüft damit nichts.
- Stufe 4 (Detektion) läuft VOR Veröffentlichung, nicht danach — und getrennt
  von Stufe 3.5: ein deterministisches Skript ist in fünf Jahren reproduzierbar,
  ein Modellurteil nicht. Der Beweiswert beider Schritte ist verschieden,
  deshalb bleiben sie getrennt.
- Stufe 6 (Provenienz-Record) ist gleichzeitig Beweismittel und die
  Grundlage für einen eigenen Datenbankherstellerrecht-Anspruch (§ 87a UrhG).
- Stufe 7: nur über die Anthropic-API (Commercial Terms), nie über Chat.

## Dateien

```
data/
  case-topics.schema.json   # Schema + Beispiel (fertig)
  case-topics.json          # echte Liste (noch nicht angelegt — wartet auf Sergios Freigabe, Task #4)
scripts/
  lib/provenance.ts         # Record-Typ + assertReleasable() + Warnungen (fertig)
  lib/case-types.ts         # ConstructedCase + Serialisierung für Review/Hash (fertig)
  lib/factsheet.ts          # Stufe 1 (fertig)
  lib/construct.ts          # Stufe 2 — noch offen
  lib/patient.ts            # Stufe 3 Demografie-Randomizer (fertig)
  lib/labs.ts               # Stufe 3 Laborwert-Randomizer (fertig)
  lib/verify.ts             # Stufe 3.5 medizinische Gegenprüfung (fertig)
  lib/canary.ts             # Kalibrierung von Stufe 3.5 (fertig)
  lib/ngram.ts              # geteilte n-Gramm-Logik für 3.5 + 4 (fertig)
  lib/detect.ts             # Stufe 4 n-Gramm-Detektion (fertig, siehe Hinweis unten)
  prompts/factsheet.v1.md   # Stufe-1-Prompt, gehasht (fertig)
  prompts/verify.v1.md      # Stufe-3.5-Prompt, gehasht (fertig)
  prompts/construct.v1.md   # Stufe-2-Prompt, gehasht (fertig)
  generate-case-v2.ts       # Orchestrierung aller Stufen (fertig, siehe Hinweis unten)
provenance/<caseId>.json    # ein Record pro Fall, in Git — noch keine echten Records
provenance/verify/<caseId>.json  # vollständiger Prüfbericht je Fall
content/cases/v2/staging/<caseId>.json  # ein Fall pro Datei (Grund: Stufe 0 hat noch
  # kein Disziplin-Feld — sobald data/case-topics.json steht, kann eine Promotion die
  # Fälle nach Disziplin zu {disziplin}-staging.json-Arrays zusammenfassen)
content/cases/v2/*.json      # neue Bank — noch leer (Route liest aus content/, nicht public/ —
  # Dateien unter public/ werden von Next.js unter derselben URL 1:1 ausgeliefert; jeder
  # Fall dort waere per direktem Link inkl. correctDiagnosis/explanation abrufbar, noch bevor
  # ein Mensch ihn gesehen hat. Korrektur 2026-09-16, siehe DECISION_LOG.md.)
```

## Nächste Schritte (in Reihenfolge)

1. Sergio gibt Themenliste frei (Entwurf kommt separat, Task #4).
2. `lib/factsheet.ts` + `prompts/factsheet.v1.md` bauen (Stufe 1).
3. `lib/construct.ts` + `prompts/construct.v1.md` bauen (Stufe 2, frischer Kontext).
4. `lib/patient.ts` + `lib/labs.ts` + `data/reference-ranges.json` bauen (Stufe 3).
5. ~~`lib/detect.ts` bauen~~ — **fertig**, mit einer offenen Einschränkung: ohne
   `SERPER_API_KEY` fällt die Websuche auf ein Anthropic-Fallback zurück, das dem
   Modell ein kurzes Zitat abverlangt und dieses lokal gegenprüft — funktioniert,
   ist aber schwächer als eine echte Such-API. **Vor Produktivbetrieb `SERPER_API_KEY`
   besorgen** (siehe Kommentar am Kopf von `scripts/lib/detect.ts`).
6. ~~`generate-case-v2.ts` bauen~~ — **fertig**. Setzt niemals `review.status`
   oder `release.approved` selbst — das bleibt Sergios Schritt.
7. **Canary-Lauf vor den Testfällen**: `canary.ts` erzeugt aus einem korrekten
   Fall mutierte Fassungen mit bekanntem Fehler. Erkennt `verify.ts` sie nicht,
   ist die Prüfstufe wirkungslos — dann hilft auch kein Testfall-Ergebnis, weil
   "pass" dann nichts bedeutet. `generate-case-v2.ts` löst das automatisch bei
   jedem 20. Fall aus (`--index`), oder manuell erzwingbar per `--force-canary
   <mutationId>`.
8. **3 Testfälle** end-to-end durchlaufen lassen (`npx tsx scripts/generate-case-v2.ts
   scripts/test-topic.example.json`), Detektion manuell prüfen. Erst danach die
   restlichen Fälle in großer Zahl erzeugen — nicht überspringen. Noch nicht
   gelaufen (kein API-Key in dieser Session, siehe Status oben).
9. Sergio-Review pro Fall (Stufe 5), `assertReleasable()` muss grün sein.
10. Erst wenn `content/cases/v2/` vollständig + reviewed ist: alte Bank
   (`content/cases/{innere,pj,vorklinik}.json`) löschen + Route umstellen.

## Was NICHT passieren darf

- Stufe 2 darf niemals Zugriff auf die Rohtexte aus Stufe 1 haben, nur auf
  das strukturierte Faktenblatt.
- Kein Fall geht ohne `assertReleasable() == OK` nach `content/cases/v2/`.
- Der automatisierte, protokollierte Prüfschritt fragt niemals Amboss oder
  UpToDate ab — auch nicht "nur lesend". Begründung: DECISION_LOG.md 2026-09-13.
- Nach jeder Korrekturschleife durch Stufe 2 müssen Stufe 3.5 und Stufe 4 neu
  laufen. `assertReleasable(record, { caseTextSha256 })` erzwingt das.
- Ein Canary-Fall wird nie veröffentlicht (ID-Präfix `canary-`).
- `generate-case-v2.ts` schreibt IMMER nach `provenance/` und `content/cases/v2/staging/`,
  auch bei `verdict: "reject"` — Sergio soll den beanstandeten Fall sehen, um ihn zu
  korrigieren. Was es NIE tut: `review.status` auf `"approved"` oder `release.approved`
  auf `true` setzen. Die eigentliche Freigabe ist ein separater, von Sergio ausgelöster
  Schritt (noch nicht gebaut — kommt erst nach den 3 Testfällen).
- Alte Bank wird nicht gelöscht, bevor die neue vollständig live ist.
