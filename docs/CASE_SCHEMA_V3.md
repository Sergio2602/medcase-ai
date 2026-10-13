# CASE_SCHEMA_V3.md — Neues Fall-Schema (Entwurf v2, nach unabhängigem Audit)

> **Geltungsbereich:** Nur für NEU erstellte Fälle über das neue, von Sergio selbst genutzte
> Tool. Ersetzt NICHT `docs/CASE_SCHEMA.md` (v1, autoritativ für die bestehenden 70 Live-Fälle
> in `content/cases/{innere,pj,vorklinik}.json`). Diese Fälle bleiben unangetastet.
>
> **Aktueller Fokus:** ausschließlich `difficulty: "klinik"`, mehrere Fachdisziplinen (Innere,
> Kardiologie, Allgemeinmedizin, …). Vorklinik/PJ bleiben strukturell unverändert, werden
> vorerst aus der Niveau-Auswahl entfernt (Daten bleiben erhalten).
>
> **v2 dieses Entwurfs** nach unabhängigem Rechts-/Medizin-Audit (2026-09-21, DECISION_LOG.md).
> Wichtigste Änderung: klare Trennung, welche Felder wann an den Client gehen — der bisherige
> Client bekommt schon heute das komplette Fall-Objekt inkl. `correctDiagnosis` sofort (bekannte
> Lücke seit 16.09., ROADMAP.md Punkt 10). Dieser Umbau löst das jetzt mit, statt es weiter
> aufzuschieben.

## Sprache

Jedes Freitext-Feld existiert doppelt: `{ "de": "…", "en": "…" }`. Ein Fall = eine Datei mit
beiden Sprachen zusammen (verhindert Auseinanderdriften). Beide Fassungen unabhängig auf
Diagnose-Leak prüfen (siehe unten) — eine Übersetzung ist keine Umgehung des Urheberrechts an
der Quelle (§ 23 UrhG gilt auch für Übersetzungen).

## Relevanz-Flag (4 Stufen, erweitert nach Audit)

```ts
type Relevance = "tragend" | "stuetzend" | "abgrenzend" | "meist_irrelevant";
```

- `tragend` — Teil der minimal hinreichenden Befundkombination für die Diagnose.
- `stuetzend` — passt zur Diagnose, für sich allein nicht beweisend.
- `abgrenzend` — schließt aktiv einen Distraktor aus (z.B. normales Troponin schließt akute
  Ischämie aus). Eigene Stufe, weil "irrelevant" hier fachlich falsch wäre.
- `meist_irrelevant` — echtes Rauschen, trägt nichts zur Unterscheidung bei.

**Nur bei Labor: eine Relevanz für die ganze Kategorie**, nicht pro Einzelwert (bewusste
Vereinfachung fürs manuelle Erstellen, Kompromiss gegenüber Audit-Empfehlung "pro Wert").
Untersuchung/Vorerkrankungen bleiben pro Eintrag (waren es schon).

**Wichtig — wann der Client `relevance` sieht:** NIE während des Spiels, erst in der
Auflösung nach Diagnose-Abgabe (siehe Sichtbarkeits-Tabelle unten). Sonst verrät der
Netzwerk-Tab die Antwort, bevor sie erraten wurde.

## Niveau, Häufigkeit, Cannot-miss — Matrix + Rahmenbedingungen (Update 30.09.)

```ts
type Niveau = "einfach" | "erfahren" | "experte";        // Schwierigkeit
type Haeufigkeit = "haeufig" | "selten";                  // reine Prävalenz-Achse
// cannotMiss: boolean bleibt eigenes, unabhängiges Flag — siehe unten
```

Nur innerhalb `difficulty: "klinik"`, ersetzt NICHT den bestehenden Vorklinik/Klinik/PJ-Screen.

**`niveau` wird aus zwei Kriterien abgeleitet (Häufigkeit × Erkennbarkeit), nicht mehr aus einer
vagen Rollenbeschreibung:**

| | leicht zu erkennen | schwer zu erkennen |
|---|---|---|
| **häufig** | **einfach** (Med-Student) | **erfahren** (Assistenzarzt) |
| **selten** | **erfahren** (Assistenzarzt) | **experte** (Facharzt) |

Anzeige-/Angabe-Format (Prompt-Header, `caseContext`, Dokumentation): immer beide Achsen nennen,
z.B. "Schwierigkeit: Med-Student (häufig, leicht zu erkennen)" oder "Schwierigkeit: Assistenzarzt
(selten, leicht zu erkennen)" — wichtig bei `erfahren`, weil es zwei verschiedene Ursprünge hat
(häufig+schwer ODER selten+leicht), die sonst nicht auseinanderzuhalten sind.

**Definitionen (Rahmenbedingungen, nicht mehr Bauchgefühl):**
- **"schwer zu erkennen"** = das Leitsymptom überschneidet sich mit ≥2 anderen relevanten
  Differentialdiagnosen, ODER die Präsentation weicht vom Lehrbuch-Bild ab (atypisches
  Alter/Geschlecht/Verlauf/fehlendes Leitsymptom).
- **"leicht zu erkennen"** = klassische, lehrbuchhafte Präsentation, ein klarer
  Befund→Diagnose-Schluss ohne relevante Verwechslungsgefahr.
- **`caseContext.category` (haeufig/selten)** = qualitativ aus der ohnehin recherchierten
  AWMF-Leitlinien-Epidemiologie (Leitlinie nennt die Diagnose explizit als eine der häufigsten
  Ursachen/Differentialdiagnosen für das Leitsymptom → `haeufig`, sonst `selten`). Fallback bei
  fehlender Angabe: RKI (Gesundheitsberichterstattung des Bundes) oder Destatis
  (Diagnosedaten der Krankenhäuser). Bewusst kein fixer Zahlen-Schwellenwert — Häufigkeit ist
  fachgebietsabhängig nicht vergleichbar (z.B. Kardiologie vs. Neurologie).
- **`cannotMiss: boolean`** — unabhängiges Flag, kombinierbar mit jedem Feld der Matrix. Grund:
  Cannot-miss-Basics (Lungenembolie, Aortendissektion, Sepsis) sind Kerninhalt für Einsteiger —
  dürften nicht automatisch nur auf "Experte" landen, nur weil sie gefährlich sind. Definition:
  Diagnose, bei der eine verpasste/verzögerte Erkennung zu Tod oder schwerem, irreversiblem
  Schaden führt — unabhängig von Häufigkeit oder Erkennbarkeit.

## Sichtbarkeits-Tabelle (neu, löst den Payload-Leak)

| Feld(er) | Sichtbar für Client wann? |
|---|---|
| `id`, `difficulty`, `discipline`, `niveau`, `cannotMiss`, `patientName`, `age`, `gender`, `occupation`, `chiefComplaint`, `history`, `vorerkrankungen` | **immer** (Anamnese ist gratis) |
| `diagnosisOptions` (nur die 4 Options-Texte, ohne Markierung welche korrekt ist) | **immer**, sobald Diagnose-Auswahl angezeigt wird |
| `untersuchung`, `auskultation`, `labs`, `ekg`, `eeg`, `imaging`, `konsil` (Inhalt je Kategorie) | **erst nach Anfordern** dieser einen Kategorie (wie bisher) |
| `oberarztTipp` | **erst auf Anfrage**, frühestens nachdem ≥1 Kategorie angefordert UND angezeigt wurde (Joker-Bedingung) |
| `relevance` (alle Kategorien), `correctDiagnosis`, `differentialNotes`, `explanation`, `keyTakeaway`, `caseContext`, `sourceNotes` | **erst nach Diagnose-Abgabe** (Auflösung) |
| `verify`, `sources[]` (Provenienz/Freigabe-Metadaten) | **nie an den Client** — nur serverseitig/Admin |

Technische Konsequenz für die API-Route (Umsetzung folgt im Code-Schritt, nicht Teil dieses
Dokuments): der Server darf nicht mehr das komplette Fall-Objekt in einer Response ausliefern.
Reveal-Anfragen und die Diagnose-Abgabe müssen serverseitig behandelt werden, nicht durch
Client-seitigen Vergleich gegen ein bereits geladenes Objekt.

## Felder (Entwurf v2)

```jsonc
{
  "id": "innere-klinik-0007",             // KEIN Diagnose-Klartext mehr im id (Audit-Fund)
  "difficulty": "klinik",
  "discipline": "innere",
  "niveau": "erfahren",
  "cannotMiss": false,

  "patientName": "Bernd",
  "age": 54,
  "gender": "male",
  "occupation": { "de": "Speditionskaufmann", "en": "Freight forwarding clerk" },

  "chiefComplaint": { "de": "…", "en": "…" },
  "history": { "de": "…", "en": "…" },

  "vorerkrankungen": [
    { "text": { "de": "Z.n. Appendektomie im Kindesalter", "en": "…" },
      "relevance": "meist_irrelevant" },
    { "text": { "de": "Chronischer Alkoholabusus, >80g/Tag seit 15 Jahren", "en": "…" },
      "relevance": "tragend" }
  ],

  "untersuchung": {
    "unlockCost": 10,
    "findings": [
      { "label": { "de": "Rachen", "en": "Throat" },
        "text": { "de": "Unauffällig, keine Rötung", "en": "…" },
        "relevance": "meist_irrelevant" },
      { "label": { "de": "Extremitäten", "en": "Extremities" },
        "text": { "de": "Beinödeme beidseits", "en": "…" },
        "relevance": "tragend" }
    ]
  },

  "auskultation": { "text": { "de": "…", "en": "…" }, "relevance": "tragend" },
  "labs": [ /* wie v1: category + values[]; EINE relevance pro Labor-Kategorie insgesamt */ ],
  "ekg": { "text": { "de": "…", "en": "…" }, "relevance": "abgrenzend" },
  "eeg": { "text": { "de": "Nicht durchgeführt — klinisch nicht indiziert", "en": "…" },
           "relevance": "meist_irrelevant" },
  "imaging": { "text": { "de": "…", "en": "…" }, "relevance": "tragend" },
  "konsil": { "text": { "de": "Kardiologisches Konsil: Beschreibung ohne eigene Beurteilung/Verdachtsdiagnose", "en": "…" },
              "relevance": "stuetzend" },

  "correctDiagnosis": { "de": "…", "en": "…" },
  "diagnosisOptions": [ /* genau 4 */ ],
  "differentialNotes": [
    { "option": "…",
      "whyNotFindingRef": "untersuchung.extremitaeten",   // NEU: Referenz auf konkreten,
                                                            // im Fall anforderbaren Befund
      "whyNot": { "de": "…", "en": "…" } }
    /* genau 3 */
  ],

  "keyTakeaway": { "de": "…", "en": "…" },
  "explanation": { "de": "…", "en": "…" },
  "sourceNotes": { "de": "…", "en": "…" },       // nur Fließtext-Zusammenfassung, keine Zitate
  "sources": [                                     // NEU: maschinenlesbare Provenienz
    { "domain": "awmf.org", "sourceClass": "nur-fakten", "caseReportDerived": false }
  ],
  "wissensstand": "AWMF-Leitlinie Stand 2024",     // NEU: Sorgfaltspflicht/Aktualität
  "caseContext": { "category": "haeufig", "note": { "de": "…", "en": "…" } },

  "oberarztTipp": { "de": "…", "en": "…" },        // Grenzen siehe unten

  "verify": {                                        // NIE an den Client, nur intern
    "status": "pending",                             // "pending" | "pass" | "fail"
    "reasons": [],
    "humanApproved": false,
    "approvedBy": null,
    "approvedAt": null
  }
}
```

## Kosten-Modell (unverändert aus v1-Entwurf)

Anamnese+Vorerkrankungen gratis; Untersuchung (inkl. aller Unterpunkte) −10 Fixpreis;
Auskultation −10; Labor −10; EKG −10; EEG −10; Bildgebung −10; Konsil −10; Oberarzt-Joker −40
fix, erst nutzbar nach mind. 1 angezeigtem Befund.

## Distraktor-Regel (operationalisiert, Audit-Fix)

Die 3 falschen `diagnosisOptions`:
1. Müssen zum selben Leitsymptom/derselben Präsentation passen wie der Fall.
2. Mindestens ein Befund im Fall muss mit dem Distraktor grundsätzlich vereinbar sein.
3. Mindestens ein im Fall **anforderbarer** Befund muss ihn widerlegen — `whyNotFindingRef`
   referenziert diesen Befund konkret (nicht nur Freitext-Behauptung).
4. Optionen liegen auf derselben diagnostischen Granularitätsebene und schließen sich
   gegenseitig aus (kein Ober-/Unterbegriff-Paar wie "Kardiomyopathie" neben "Alkoholtoxische
   Kardiomyopathie").

## Oberarzt-Joker — Grenzen (neu, Audit-Fix Z1)

`oberarztTipp` darf: auf eine Befund-Kategorie oder ein Denkmuster hinweisen. Darf NICHT: die
Diagnose nennen, auf eine einzige verbleibende Option reduzieren, eine Therapie-Handlungsanweisung
oder Dosierung enthalten (Abgrenzung zur Behandlungsempfehlung, siehe Zweckbestimmung).

## Diagnose-Leak-Prüfung — jetzt explizit für ALLE Freitextfelder (Audit-Fix)

Gilt für: `chiefComplaint`, `history`, `vorerkrankungen[].text`, `occupation`,
`untersuchung.findings[].label` UND `.text`, `auskultation.text`, `labs[].category`/`values[].name`,
`ekg.text`, `eeg.text`, `imaging.text`, `konsil.text` (nur Beschreibung, KEINE eigene
Verdachtsdiagnose des Konsiliararztes), `oberarztTipp`. Für beide Sprachfassungen unabhängig
prüfen.

## Erklärungs-/Begründungsqualität (neu, Sergio-Feedback 21.09. nach erstem lokalem Test)

Beim ersten Testdurchlauf des Payload-Fixes (alter v1-Fall, Diagnose "Primärer
Hyperparathyreoidismus") fiel ein Muster auf, das für NEUE Fälle explizit verboten wird:
`caseContext.note` enthielt den Satz "Der primäre Hyperparathyreoidismus ist die häufigste
Ursache einer ambulant erworbenen Hyperkalzämie (**AWMF-Leitlinie 088-015**)." — eine
Häufigkeits-Aussage ist als FAKT zulässig (siehe Fakt-vs-Ausdruck-Prinzip), aber die
Formulierung als Zitat mit konkreter Leitlinien-Nummer im spielernahen Text ist keine
neu-formulierte eigene Aussage mehr, sondern liest sich wie eine Quellenangabe/ein
Beleg-Zitat — genau die Unterscheidung, die die Legal-Pipeline immer strikt getrennt hat
(Quellen sind Provenienz-Metadaten in `sources[]`/`sourceNotes`, nie Inline-Zitate im
Spieltext, siehe Entscheidung 2026-09-15 zu `buildSourceNotes()`).

**Regel: In KEINEM spielernahen Freitextfeld** (`explanation`, `keyTakeaway`,
`caseContext.note`, `differentialNotes[].whyNot`, `oberarztTipp`) darf eine konkrete Quelle
benannt werden — kein Leitlinien-Name, keine Leitlinien-Nummer, kein "laut AWMF/ESC/…", keine
Jahreszahl-Referenz auf eine Publikation. Der Fakt selbst (z.B. "häufigste Ursache von X")
bleibt erlaubt und erwünscht — er muss nur in eigenen Worten als Aussage über die Medizin
stehen, nicht als Zitat einer Quelle. Provenienz bleibt vollständig in `sources[]` (maschinen-
lesbar) und `sourceNotes` (Fließtext-Zusammenfassung, ebenfalls ohne wörtliches Zitat).

**Zusätzliche inhaltliche Anforderung an `explanation`** (Sergios Vorgabe, nicht nur Fix):
1. Muss die klinische/pathophysiologische Verkettung: Befund(e) → Diagnose nachvollziehbar
   begründen, nicht nur behaupten.
2. Soll, wo fachlich relevant, benennen, welche Untersuchung(en)/Diagnostik für das
   vorliegende Leitsymptom **Standard-Abklärung** ist/sind (z.B. "Bei V.a. Hyperkalzämie ist
   die PTH-Bestimmung die Standard-Stufendiagnostik nach Ausschluss laborchemischer
   Störfaktoren") — als eigene Aussage formuliert, nicht als Leitlinien-Zitat (siehe oben).

**Zusätzliche inhaltliche Anforderung an `differentialNotes[].whyNot`:** muss den Distraktor
inhaltlich-klinisch widerlegen (nicht nur "passt nicht") und sich dabei konkret auf den in
`whyNotFindingRef` referenzierten Befund beziehen — bereits als Struktur-Regel vorhanden
(Distraktor-Regel Punkt 3), hier als Qualitätsanforderung an den tatsächlichen Text verschärft.

## Harte Regeln (aktualisiert)

1. `diagnosisOptions`: exakt 4, eine davon `correctDiagnosis` (wörtlich identisch je Sprache).
2. `differentialNotes`: exakt 3, mit `whyNotFindingRef`.
3. Lab-Key bleibt `values`, niemals `parameters`.
4. `value`/`reference` bleiben Strings.
5. Kein Diagnose-Leak in JEDEM Freitextfeld (Liste oben), beide Sprachen unabhängig.
6. `id` eindeutig über alle Klinik-Dateien, KEIN Diagnose-Klartext im `id`, Kollisionsprüfung
   beim Schreiben Pflicht.
7. `ekg`/`eeg`/`imaging`/`konsil`: `text: ""` wenn nicht vorhanden, Objekt bleibt bestehen
   (kein Typwechsel zu einfachem String — behebt Widerspruch aus v1-Entwurf).
8. Ein Fall ist erst spielbar, wenn `verify.status === "pass"` UND `verify.humanApproved === true`.
9. Kein spielernahes Freitextfeld (`explanation`, `keyTakeaway`, `caseContext.note`,
   `differentialNotes[].whyNot`, `oberarztTipp`) nennt eine konkrete Quelle (Leitlinien-Name,
   -Nummer, Jahr, "laut …") — Fakten ja, Zitate nein (siehe Abschnitt oben).

## Ablage

`content/cases/klinik/<disziplin>.json`, getrennt von den alten v1-Dateien. Erste zwei Fälle:
`content/cases/klinik/innere.json`.

## Offen / nicht Teil dieses Entwurfs

- Konkreter Prüf-Skill/Agent für `verify` (setzt `status`/`reasons`).
- DSGVO-Regex-Check (Namen/Orte/Daten/Kliniken in Freitexten) als eigenes Skript — noch nicht
  gebaut, nur als Anforderung hier festgehalten.
- Konkrete API-Route-/Reveal-Mechanik für die Sichtbarkeits-Tabelle (Code-Schritt, nicht Schema).
