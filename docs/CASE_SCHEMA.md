# MedCase — Fall-Schema (autoritativ)

Verbindliches Schema zur Erstellung neuer klinischer Fälle. Grundlage jeder
manuellen oder automatisierten Generierung. Abgeleitet direkt aus dem
bestehenden Bestand (`public/cases/*.json`, Stand: 70 Fälle, alle Felder
konsistent). Bei Konflikt gilt dieses Dokument.

## Ablage & Dateien

- Ein JSON-**Array** pro Disziplin unter `public/cases/{disziplin}.json`.
- Aktuell: `innere.json` (40), `vorklinik.json` (15), `pj.json` (15).
- Neue Disziplinen = neue Datei nach demselben Muster (z.B. `chirurgie.json`,
  `paediatrie.json`, `dermatologie.json`, `neurologie.json`, `gynaekologie.json`).
- **Disziplin-Trennung über die Datei/Ordnerstruktur**, nicht über ein Feld im JSON.
- Neu generierte Fälle zuerst in eine `*-staging.json` schreiben (z.B.
  `chirurgie-staging.json`) — Promotion in die Live-Datei erst nach Review.

## `difficulty` ist an die Datei gekoppelt

| Datei            | `difficulty` | Zielgruppe                          |
|------------------|--------------|-------------------------------------|
| `vorklinik.json` | `"vorklinik"`| Grundlagenfächer (Physikum)         |
| `{fach}.json`    | `"klinik"`   | Klinik-Standard (Regelfall)         |
| `pj.json`        | `"examen"`   | PJ / Staatsexamen (komplexer)       |

Ein Fach kann später mehrere Schwierigkeitsstufen führen — dann bleibt das
Feld die Wahrheit, aber innerhalb einer Datei einheitlich halten.

## Felder (alle 17 Pflicht, exakt diese Keys, exakt diese Reihenfolge)

```jsonc
{
  "id": "kebab-case-diagnose-N",          // eindeutig, kleingeschrieben, Suffix -1, -2 …
  "difficulty": "klinik",                  // "vorklinik" | "klinik" | "examen" (s.o.)
  "patientName": "Bernd",                  // deutscher Vorname, zum Alter passend
  "age": 54,                               // Zahl
  "gender": "male",                        // "male" | "female"
  "chiefComplaint": "Mir geht seit ein paar Wochen ständig die Luft aus …",
                                           // ICH-Perspektive, gesprochenes Alltagsdeutsch,
                                           // KEINE Fachbegriffe, kein Diagnose-Leak
  "history": "54-jähriger Patient stellt sich mit …",
                                           // Uniklinik-Anamnese-Stil, 3. Person, vollständig:
                                           // Verlauf, gezielte Nachfragen, Sozial-/Nikotin-/
                                           // Alkohol-/Medikamenten-/Allergie-Anamnese
  "examination": "AZ reduziert, EZ normal (BMI 24 kg/m²). RR 118/76 mmHg …",
                                           // Vitalparameter + Organsysteme, mit \n gegliedert
                                           // (Kopf/Hals, Herz, Lunge, Abdomen, Extremitäten, Neuro)
  "labs": [
    {
      "category": "Herzmarker",            // sinnvolle klinische Gruppierung
      "values": [                          // WICHTIG: Key heißt "values" (nicht "parameters")
        { "name": "NT-proBNP", "value": "3850", "unit": "pg/ml",
          "reference": "< 125", "flag": "high" }   // value/reference sind STRINGS
      ]
    }
  ],
  "imaging": "Transthorakale Echokardiographie: …",   // narrativer Befund; "" wenn keine
  "correctDiagnosis": "Alkoholtoxische dilatative Kardiomyopathie",
  "diagnosisOptions": [                    // GENAU 4, enthält die korrekte, plausible Differentiale
    "Alkoholtoxische dilatative Kardiomyopathie",
    "Akute virale Myokarditis",
    "Ischämische Kardiomyopathie bei koronarer Herzkrankheit",
    "Tachykardiomyopathie bei Vorhofflimmern"
  ],
  "keyTakeaway": "Chronischer Alkoholkonsum (>80 g/Tag über Jahre) plus … = Diagnose, bis zum Beweis des Gegenteils.",
                                           // EIN Merksatz, Muster: "Befund A + Befund B = Diagnose"
  "differentialNotes": [                   // GENAU 3 — je ein Eintrag pro FALSCHER Option
    { "option": "Akute virale Myokarditis",
      "whyNot": "Gegen eine Myokarditis sprechen der schleichende Verlauf …" }
  ],
  "explanation": "Die globale, biventrikuläre Hypokinesie … ergibt sich die … als wahrscheinlichste Diagnose.",
                                           // Fließtext-Herleitung: warum korrekt, wie abgegrenzt
  "sourceNotes": "NT-proBNP-Grenzwert 125 pg/ml gemäß ESC-Leitlinie / NVL …",
                                           // ECHTE Quellen/Leitlinien (AWMF, ESC, NVL, Thieme …),
                                           // ehrlich dokumentiert inkl. Lücken ("keine eigene AWMF-LL")
  "caseContext": {
    "category": "haeufig",                 // "haeufig" | "cannot-miss"
    "note": "Alkoholabusus ist die häufigste Ursache einer sekundären Kardiomyopathie (Quelle)."
  }
}
```

## Enums (fix)

- `gender`: `male` | `female`
- `difficulty`: `vorklinik` | `klinik` | `examen`
- `labs[].values[].flag`: `high` | `low` | `normal`
- `caseContext.category`: `haeufig` | `cannot-miss`

## Harte Regeln (nicht verhandelbar)

1. **`diagnosisOptions`: exakt 4**, eine davon ist `correctDiagnosis` (wörtlich identisch).
2. **`differentialNotes`: exakt 3** — genau die 3 falschen Optionen, jede mit `whyNot`.
3. **Lab-Key ist `values`**, niemals `parameters` (sonst rendern leere Tabellen).
4. **`value` und `reference` sind Strings** (deutsche Dezimalkomma erlaubt: `"0,9"`).
5. **Kein Diagnose-Leak:** weder `chiefComplaint`, `history`, `examination` noch ein
   Befund-Name dürfen die Diagnose vorwegnehmen. Der Reiz ist das Kombinieren.
6. **`imaging`: leerer String `""`**, wenn der Fall keine Bildgebung hat (nicht weglassen).
7. **Authentisches Deutsch**, Uniklinik-Dokumentationsstil — nicht aus dem Englischen übersetzt.
8. **`id` eindeutig** über die gesamte Datei; Muster `diagnose-kebab-N`.
9. **`sourceNotes` mit echten Leitlinien** (AWMF/ESC/NVL/etc.); Lücken ehrlich benennen,
   nichts erfinden. Das ist die Grundlage des ärztlichen Reviews.

## Stil-Anker (aus dem Bestand)

- `chiefComplaint`: wie ein realer Patient spricht („abends passen meine Schuhe kaum
  noch, die Söckchen hinterlassen tiefe Abdrücke"), 1–2 Sätze.
- `history`: dicht, differenzialdiagnostisch relevant, mit den negativen Angaben, die
  ein:e gute:r Untersucher:in aktiv erfragt.
- `examination`: immer mit vollständigem Vitalparameter-Block beginnen.
- `labs`: nur klinisch plausible Werte, Referenzbereiche realistisch, Flags korrekt.
- Werte sollen **die Diagnose stützen**, aber nicht alleine beweisen — Kombination zählt.

## Generierungs-Checkliste (vor dem Schreiben in Staging)

- [ ] Datei = Zieldisziplin, `difficulty` passt zur Datei
- [ ] Alle 17 Felder vorhanden, korrekte Reihenfolge
- [ ] 4 `diagnosisOptions`, korrekte enthalten; 3 `differentialNotes` = die 3 Falschen
- [ ] `labs[].values` (nicht `parameters`), Flags/Referenzen konsistent
- [ ] Kein Diagnose-Leak in Freitextfeldern
- [ ] `imaging` gesetzt oder bewusst `""`
- [ ] `sourceNotes` mit realen Quellen
- [ ] `id` eindeutig
- [ ] JSON valide (Array-Element korrekt eingehängt)

## Skripte

- `scripts/generate-cases.ts` — Bulk-Generierung (API, `present_case`-Toolschema),
  feste Diagnoseliste, Batches à 5, inkrementelles Schreiben.
- `scripts/generate-reviewed-cases.ts` — neuere Pipeline (Review-Variante).
- `scripts/backfill-keytakeaway.ts` — Feld-Backfill-Vorlage für nachträgliche Felder.

> Für den Ausbau neuer Disziplinen: pro Fach eine Diagnoseliste definieren
> (häufige + cannot-miss Krankheitsbilder der Famulatur), nach Staging generieren,
> reviewen, dann promoten.
