# Examen/PJ — Case-Tracking & Methodik

Lebendes Dokument, analog zu `docs/case-tracking.md` (Innere/Klinik) und
`docs/vorklinik-case-tracking.md`. Abschnitt 6 (Anti-Giveaway) und Abschnitt 7
(EKG-Platzierung) aus dem Innere-Dokument gelten **1:1 auch hier** und werden
nicht dupliziert.

## 0. Ausgangslage — warum diese Bank ersetzt wird

Die bisherigen 40 Fälle in `public/cases/pj.json` sind laut Commit-Historie
"blind generiert, ungeprüft" — kein `sourceNotes`-Feld, keine dokumentierte
Auswahllogik. Auf der `/ueber-uns`-Seite wurde das bereits offen benannt. Statt
alle 40 nachträglich zu belegen, wird die Bank durch eine kleinere, aber
vollständig quellenbasierte Fallmenge ersetzt (analog zum Vorgehen bei
Vorklinik: alte 50 → neue 15).

## 1. Warum kein eigener IMPP-Blueprint wie bei M2?

Geprüft: Das IMPP administriert laut eigener Website (`impp.de/pruefungen/medizin.html`)
ausschließlich die **schriftlichen** Prüfungen — Ersten Abschnitt (M1, GK1) und
Zweiten Abschnitt (M2, GK2), je 320 MC-Aufgaben. Der **Dritte Abschnitt der
Ärztlichen Prüfung (M3)**, der nach dem Praktischen Jahr steht, ist eine
**mündlich-praktische Prüfung**, die lokal an den Universitäten von
Prüfungskommissionen abgenommen wird — kein IMPP-Verfahren, kein bundesweiter
schriftlicher Blueprint, keine vergleichbare Prozentverteilung. Eine "IMPP-M3-
Statistik" existiert schlicht nicht.

Für diese Schwierigkeitsstufe (in der App als "PJ/Examen" gelabelt, siehe
`DIFFICULTY_LABELS.examen = "PJ"`) verwenden wir stattdessen zwei Achsen, die
tatsächlich zur Zielgruppe passen — Studierende im Praktischen Jahr, die sich
klinisch-praktisch auf M3 vorbereiten und dabei krankenhaustypische Fälle über
mehrere Fachrichtungen sehen:

## 2. Zwei Auswahl-Achsen

**Achse 1 — IMPP-GK2 als inhaltliche Grundlage.** Der Prüfungsstoff des M3
überschneidet sich inhaltlich mit dem GK2 (M2) — geprüft wird dasselbe Wissen,
nur mündlich-praktisch und in höherer Anwendungstiefe statt im MC-Format. Die
M2-Blueprint-Gewichtung (siehe `case-tracking.md`, Abschnitt "Primärquelle für
die Gewichtung") bleibt daher auch hier eine sinnvolle Richtschnur für die
Verteilung über Organsysteme — ergänzt um Fachrichtungen, die im GK2-Blueprint
nicht explizit als eigene Achse auftauchen (Chirurgie, Gynäkologie/Geburtshilfe,
Pädiatrie, Psychiatrie), aber im PJ-Alltag zentral sind.

**Achse 2 — Reale Krankenhaushäufigkeit (Destatis).** Das Statistische
Bundesamt veröffentlicht jährlich die Diagnosedaten aller vollstationären
Krankenhauspatienten nach ICD-10 ("Diagnosen der Krankenhauspatientinnen und
-patienten", zuletzt Berichtsjahr 2023, Datum 7.11.2024). Diese Zahlen bilden
ab, was PJ-Studierende in der Praxis tatsächlich am häufigsten sehen — nicht
nur was geprüft wird. Quelle: [destatis.de – Diagnosen der
Krankenhauspatienten](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Krankenhauser/Publikationen/Downloads-Krankenhaeuser/statistischer-bericht-diagnosedaten-5231301237015.html).
Bereits verifizierte Beispielzahl: Herzinsuffizienz (ICD I50) war 2023 mit
468.479 Fällen die häufigste vollstationäre Hauptdiagnose in Deutschland.

**Cannot-miss bleibt eigene, dritte Dimension** (wie bei Innere/Vorklinik),
bei PJ-Fällen tendenziell noch stärker gewichtet, weil die Zielgruppe kurz vor
eigenverantwortlichem ärztlichem Handeln steht.

## 3. Gemischte Disziplinen — Begründung

Das Praktische Jahr besteht laut Approbationsordnung aus drei Tertialen:
Chirurgie, Innere Medizin, Wahlfach. Die bestehende Klinik-Stufe deckt Innere
Medizin bereits mit 11 Fällen ab. Diese Bank fokussiert deshalb bewusst auf die
**Chirurgie- und Wahlfach-typischen Fachrichtungen**, die im Tool bislang nicht
vorkommen: Allgemein-/Viszeralchirurgie, Gefäßchirurgie, Orthopädie/Unfall­-
chirurgie, Neurologie, Gynäkologie/Geburtshilfe, Pädiatrie, Psychiatrie,
Notfallmedizin — statt weitere Innere-Diagnosen zu duplizieren.

## 4. Schema

Identisch zum Innere-/Vorklinik-Schema (siehe `docs/case-tracking.md`), keine
neuen Felder: `id`, `difficulty` (`"examen"`), `patientName`, `age`, `gender`,
`chiefComplaint`, `history`, `examination`, `labs`, `imaging`,
`correctDiagnosis`, `diagnosisOptions` (4, inkl. korrekt), `keyTakeaway`,
`differentialNotes`, `explanation`, `sourceNotes`, `caseContext`
(`{category: "haeufig" | "cannot-miss", note}`).

## 5. Prozess pro Fall

Identisch zu Abschnitt 3 in `case-tracking.md`: Diagnose nach obigem Filter
wählen → Recherche (nur AWMF/Onkopedia/RKI/PubMed/leitlinien.de/IMPP/Destatis,
kein Amboss/UpToDate) → Fall schreiben → Konsistenz-Selbstcheck → Schema-
Validierung → `sourceNotes` ehrlich befüllen.

Erhöhte Komplexität ggü. Klinik-Stufe (passend zur PJ/Hammerexamen-
Zielgruppe): mehr Differenzialdiagnosen-Tiefe, mehr atypische Verläufe
zulässig, aber Anti-Giveaway-Prinzipien (Abschnitt 6 in `case-tracking.md`)
gelten unverändert.

## 6. Workflow beim Erstellen

Gleiches Staging-Vorgehen wie bei Innere: `public/cases/pj.json` bleibt bis
zur vollständigen Freigabe aller 15 Fälle unverändert nutzbar (alte Bank live),
neue Fälle werden in einer separaten Datei gesammelt und erst am Ende
komplett getauscht — damit die App zu keinem Zeitpunkt eine leere oder
kaputte Fallbank für die Schwierigkeit "Examen" ausliefert.

## 7. Kandidaten (zur Freigabe, Stand siehe Chat-Vorschlag)

Siehe Chat — 15 Kandidaten über Chirurgie, Neurologie, Innere/Intensiv,
Gynäkologie/Geburtshilfe, Pädiatrie, Psychiatrie, Notfallmedizin vorgeschlagen,
Freigabe durch Sergio noch ausstehend.
