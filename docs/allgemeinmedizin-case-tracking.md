# Allgemeinmedizin — Case-Tracking & Methodik

Lebendes Dokument, analog zu `docs/case-tracking.md` (Innere/Klinik) und
`docs/vorklinik-case-tracking.md`. Abschnitt 6 (Anti-Giveaway) und
Abschnitt 7 (EKG-/Bildgebungs-Platzierung) aus dem Innere-Dokument gelten
**1:1 auch hier** und werden nicht dupliziert.

Wichtig: Die 15 Fälle liegen technisch in `public/cases/innere.json` (dem
bestehenden Klinik-Fallpool), **nicht** in einer eigenen
`allgemeinmedizin.json`. Die Disziplin-Auswahl in der App (`app/page.tsx`,
`DISCIPLINES`) filtert aktuell nicht nach Diagnose-Disziplin — nur nach
Schwierigkeitsgrad (`vorklinik`/`klinik`/`examen`). "Allgemeinmedizin"
bleibt daher vorerst als Disziplin-Kachel gesperrt (`locked: true`); die
Auswahl ist rein kosmetisch, solange keine echte Filter-Logik gebaut ist.
Das war eine bewusste Entscheidung (Aufwand/Nutzen), um die Fälle nicht
unerreichbar in einer isolierten Datei liegen zu lassen.

## 1. Warum eine eigene Auswahl-Logik für Allgemeinmedizin?

Anders als Innere (IMPP-Blueprint nach Fachgebiet) oder Vorklinik
(GK1-Anwendungsbeispiele) hat die Allgemeinmedizin kein numerisches
Prüfungs-Blueprint. Stattdessen zählt hier die **hausärztliche
Versorgungsrealität**: Was sieht man tatsächlich in der Hausarztpraxis,
und wo liegt das Risiko, eine gefährliche Diagnose hinter einem häufigen
Beratungsanlass zu übersehen?

Zentrales Konzept: **Abwendbar gefährlicher Verlauf (AGV)** — die
DEGAM-eigene Terminologie für "cannot-miss" in der Hausarztmedizin. Ein
AGV ist eine seltenere, aber gefährliche Diagnose, die sich hinter einem
häufigen, meist harmlosen Beratungsanlass verbergen kann und die durch
rechtzeitiges Erkennen abwendbar ist.

## 2. Drei Auswahl-Achsen

**Achse 1 — Beratungsanlass-Häufigkeit.** Fälle orientieren sich an den
laut DEGAM-Leitlinien und hausärztlicher Literatur häufigsten
Konsultationsgründen (Rückenschmerz, Harnwegsinfekt, Husten, Schwindel,
Müdigkeit, Bauchschmerz, Hypertonie, Diabetes).

**Achse 2 — AGV/Cannot-miss hinter dem häufigen Symptom.** Zu mehreren
häufigen Beratungsanlässen gibt es einen gepaarten AGV-Fall mit
ähnlicher/verwandter Symptomatik, aber gefährlicherem Verlauf (z. B.
unspezifischer Kreuzschmerz ↔ Cauda-equina-Syndrom; Zystitis ↔
Pyelonephritis; virale Bronchitis ↔ Bronchialkarzinom; BPPV ↔ TIA;
Müdigkeit/Eisenmangel ↔ Kolonkarzinom). Das Ziel: Lernende sollen genau
die Unterscheidungsmerkmale trainieren, die in der Praxis über
"abwarten" vs. "sofort einweisen" entscheiden.

**Achse 3 — Praktische Relevanz für die Pflichtfamulatur.** In vielen
deutschen Bundesländern ist eine Famulatur in der Hausarztpraxis
Pflicht. Die Fallauswahl bildet bewusst das ab, was Studierende dort
tatsächlich antreffen, statt seltener Spezialfälle.

## 3. Schema

Identisch zum Innere-Schema (siehe `docs/case-tracking.md`), keine neuen
Felder: `id`, `difficulty` (`"klinik"` — Allgemeinmedizin-Fälle liegen im
Klinik-Pool, siehe Hinweis oben), `patientName`, `age`, `gender`,
`chiefComplaint`, `history`, `examination`, `labs`, `imaging`,
`correctDiagnosis`, `diagnosisOptions` (4, inkl. korrekt), `keyTakeaway`,
`differentialNotes`, `explanation`, `sourceNotes`, `caseContext`
(`{category: "haeufig" | "cannot-miss", note}`).

## 4. Quellen

Ausschließlich AWMF-Leitlinien (insb. DEGAM-S2k/S3-Leitlinien),
Nationale VersorgungsLeitlinien (NVL), Onkopedia, RKI, PubMed und
leitlinien.de — nie Amboss/UpToDate, konsistent mit der Vorgabe aus
`docs/case-tracking.md`. Zentrale Quellen für diese Fallbank:

- DEGAM-Leitlinie Brustschmerz (AWMF 053-023) — Marburger Herz-Score
- Nationale VersorgungsLeitlinie Kreuzschmerz (nvl-007) / S2k Spezifischer
  Kreuzschmerz (187-059) — Red Flags, Cauda-equina-Syndrom
- DEGAM-Leitlinie Brennen beim Wasserlassen (053-001) — Zystitis
- AWMF S3-Leitlinie Harnwegsinfektionen (043/044) — Pyelonephritis
- DEGAM-Leitlinie Akuter und chronischer Husten (053-013) — Bronchitis,
  Bronchialkarzinom-Alarmzeichen
- S3-Leitlinie Lungenkarzinom (020/007) — Abklärungsschema Malignomverdacht
- DEGAM-Leitlinie Akuter Schwindel in der Hausarztpraxis (053-018) — BPPV
- ABCD2-Score-Literatur / DGN-Schlaganfall-Leitlinie — TIA
- DEGAM-Leitlinie Müdigkeit (053-002) — Abklärungstiefe bei
  unspezifischer Müdigkeit, Anämie-Abklärung
- S3-Leitlinie Reizdarmsyndrom (021-016, DGVS/DGNM) — Rom-IV-Kriterien
- Nationale VersorgungsLeitlinie Hypertonie (nvl-009fs, 2023)
- Nationale VersorgungsLeitlinie Typ-2-Diabetes — Neuropathie-Screening

Wo keine dedizierte DEGAM-Einzelleitlinie existiert (z. B. Appendizitis,
Hashimoto-Thyreoiditis, TIA in der Hausarztpraxis), ist das in den
jeweiligen `sourceNotes` der Fälle explizit vermerkt — konsistent mit der
Ehrlichkeitspflicht aus `docs/case-tracking.md` (dünne Quellenlage
zugeben statt Zitat erfinden).

## 5. Stand — Allgemeinmedizin

**Alle 15 Fälle erstellt, strukturvalidiert und in `public/cases/innere.json`
zusammengeführt (2026-07-13).** Node/Python-Strukturvalidierung geprüft
(Pflichtfelder, diagnosisOptions/differentialNotes 1:1, gültige
caseContext-/Flag-/Gender-Werte, keine ID-Kollisionen mit bestehenden
Fällen) — alle 15 bestanden.

| ID | Diagnose | Kategorie | Schwierigkeit |
|---|---|---|---|
| `kreuzschmerz-unspezifisch-1` | Nicht-spezifischer Kreuzschmerz | Häufig | Leicht |
| `cauda-equina-1` | Bandscheibenvorfall mit Cauda-equina-Syndrom | Cannot-miss | Mittel |
| `zystitis-unkompliziert-1` | Unkomplizierte Zystitis | Häufig | Leicht |
| `pyelonephritis-hausarzt-1` | Akute unkomplizierte Pyelonephritis | Cannot-miss | Mittel |
| `bronchitis-akut-1` | Akute virale Bronchitis | Häufig | Leicht |
| `bronchialkarzinom-hausarzt-1` | Bronchialkarzinom (Erstmanifestation) | Cannot-miss | Schwer |
| `bppv-1` | Benigner paroxysmaler Lagerungsschwindel | Häufig | Mittel |
| `tia-hausarzt-1` | Transitorische ischämische Attacke | Cannot-miss | Schwer |
| `hashimoto-thyreoiditis-1` | Hashimoto-Thyreoiditis | Häufig | Mittel |
| `kolonkarzinom-hausarzt-1` | Kolonkarzinom hinter Müdigkeit/Anämie | Cannot-miss | Schwer |
| `reizdarmsyndrom-1` | Reizdarmsyndrom | Häufig | Mittel |
| `appendizitis-hausarzt-1` | Akute Appendizitis (Hausarzt-Erstpräsentation) | Cannot-miss | Mittel |
| `hypertonie-neueinstellung-1` | Arterielle Hypertonie, Neueinstellung | Häufig | Leicht |
| `diabetes-typ2-polyneuropathie-1` | Diabetes mellitus Typ 2 mit Polyneuropathie | Häufig | Mittel |
| `acs-hausarzt-1` | Instabile Angina pectoris (Marburger Herz-Score) | Cannot-miss | Schwer |

Verteilung: 7 Häufig / 8 Cannot-miss, 3 Leicht / 6 Mittel / 6 Schwer.
Bewusst AGV-lastiger als Vorklinik, da AGV-Erkennung der zentrale Zweck
der hausärztlichen Fallauswahl ist (Achse 2).

Hinweis zu thematischer Nähe: `kolonkarzinom-hausarzt-1` (Colon
ascendens, per Koloskopie histologisch verdächtig) und das bestehende
`eisenmangelanaemie-1` in `innere.json` (Eisenmangelanämie bei noch
unspezifiziertem okkultem GI-Blutverlust) behandeln beide
Eisenmangelanämie als Leitbefund, kommen aber zu unterschiedlichen
Diagnosen/Lernzielen (eine zeigt den Such-Prozess, die andere das
konkrete Karzinom) — bewusst beibehalten, da beide Perspektiven lehrreich
sind. `appendizitis-hausarzt-1` und `pyelonephritis-hausarzt-1` haben
ebenfalls Diagnose-Überschneidungen mit Fällen aus `vorklinik.json` bzw.
`pj.json` (`appendizitis-1`, `pyelonephritis-1`) — das ist unkritisch, da
es sich um getrennte Schwierigkeits-Pools mit unterschiedlicher
Falldarstellung handelt (Hausarzt-Erstpräsentation vs.
Klinik-/Stationskontext).

## 6. Offene Punkte

- [x] 15 Kandidaten mit Sergio abgestimmt (14 vorgeschlagen + ACS/instabile
      Angina pectoris als 15. Diagnose ergänzt)
- [x] Alle 15 Fälle geschrieben, sourced, strukturvalidiert
- [x] In `public/cases/innere.json` zusammengeführt (User-Entscheidung:
      kein separates File, keine Discipline-Filter-Verdrahtung — siehe
      Hinweis oben)
- [ ] Fälle in der laufenden App stichprobenartig durchspielen/gegenlesen
- [ ] Falls später echte Discipline-Filterung gebaut wird: `discipline`-
      Feld pro Fall ergänzen, API-Route (`app/api/generate-case/route.ts`)
      und Fetch-Aufruf (`app/page.tsx`) um `discipline`-Parameter
      erweitern, dann `DISCIPLINES`-Eintrag `allgemeinmedizin` entsperren
