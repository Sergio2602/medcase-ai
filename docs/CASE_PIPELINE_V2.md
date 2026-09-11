# Case-Pipeline v2 — technischer Bauplan

Kurzreferenz für die Umsetzung. Rechtlicher Hintergrund und vollständige
Begründung: `claude/uebergabe-fallgenerierung-v2.md` im Claude-Projekt
(Legal-Audit-Handover, 2026-09-08) — dieses Dokument wiederholt das nicht,
sondern verweist nur.

**Status:** Gerüst angelegt (Typen + Schema), Generierungslogik (Stufe 1/2/4)
noch nicht implementiert. Siehe Task-Liste in der Cowork-Session.

## Warum diese Struktur

Jede Stufe ist ein juristisch wirksamer Schnitt, nicht nur Code-Organisation:

- Stufe 0 (Themenauswahl) muss von Sergio kommen → dokumentierter
  menschlicher Beitrag.
- Stufe 1 (Faktenextraktion) und Stufe 2 (Fallkonstruktion) sind
  **getrennte API-Calls mit getrenntem Kontext** — Stufe 2 sieht die
  Quelltexte nie, nur das Faktenblatt. Das ist der wirksamste
  Einzel-Schritt gegen unbewusste Übernahme geschützten Ausdrucks.
- Stufe 3 (Patient/Labor) kommt aus eigenen Randomizern, nicht vom Modell.
- Stufe 4 (Detektion) läuft VOR Veröffentlichung, nicht danach.
- Stufe 6 (Provenienz-Record) ist gleichzeitig Beweismittel und die
  Grundlage für einen eigenen Datenbankherstellerrecht-Anspruch (§ 87a UrhG).
- Stufe 7: nur über die Anthropic-API (Commercial Terms), nie über Chat.

## Dateien

```
data/
  case-topics.schema.json   # Schema + Beispiel (fertig)
  case-topics.json          # echte Liste (noch nicht angelegt — wartet auf Sergios Freigabe, Task #4)
scripts/
  lib/provenance.ts         # Record-Typ + assertReleasable() (fertig)
  lib/factsheet.ts          # Stufe 1 — noch offen
  lib/construct.ts          # Stufe 2 — noch offen
  lib/patient.ts            # Stufe 3 Demografie-Randomizer — noch offen
  lib/labs.ts               # Stufe 3 Laborwert-Randomizer — noch offen
  lib/detect.ts             # Stufe 4 n-Gramm-Detektion — noch offen
  prompts/                  # versionierte, gehashte Prompt-Dateien — noch offen
  generate-case-v2.ts       # Orchestrierung aller Stufen — noch offen
provenance/<caseId>.json    # ein Record pro Fall, in Git — noch keine Records
public/cases/v2/*.json      # neue Bank — noch leer
```

## Nächste Schritte (in Reihenfolge)

1. Sergio gibt Themenliste frei (Entwurf kommt separat, Task #4).
2. `lib/factsheet.ts` + `prompts/factsheet.v1.md` bauen (Stufe 1).
3. `lib/construct.ts` + `prompts/construct.v1.md` bauen (Stufe 2, frischer Kontext).
4. `lib/patient.ts` + `lib/labs.ts` + `data/reference-ranges.json` bauen (Stufe 3).
5. `lib/detect.ts` bauen (Stufe 4).
6. `generate-case-v2.ts` — alles orchestrieren, Provenienz-Record schreiben.
7. **3 Testfälle** end-to-end durchlaufen lassen, Detektion manuell prüfen.
   Erst danach die restlichen Fälle in großer Zahl erzeugen — nicht überspringen.
8. Sergio-Review pro Fall (Stufe 5), `assertReleasable()` muss grün sein.
9. Erst wenn `public/cases/v2/` vollständig + reviewed ist: alte Bank
   (`public/cases/{innere,pj,vorklinik}.json`) löschen + Route umstellen.

## Was NICHT passieren darf

- Stufe 2 darf niemals Zugriff auf die Rohtexte aus Stufe 1 haben, nur auf
  das strukturierte Faktenblatt.
- Kein Fall geht ohne `assertReleasable() == OK` nach `public/cases/v2/`.
- Alte Bank wird nicht gelöscht, bevor die neue vollständig live ist.
