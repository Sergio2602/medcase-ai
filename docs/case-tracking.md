# Case Tracking — MedCase.AI

Lebendes Dokument. Wird bei jedem neuen/ersetzten Fall aktualisiert — so lässt
sich jederzeit nachlesen, was schon quellenbasiert überarbeitet ist, was noch
aussteht, und ob die Diagnose-Auswahl über Organsysteme/Kategorien balanciert
bleibt statt zufällig zu driften.

## Auswahl- und Erstellungs-Schema — verbindlich für jeden neuen Fall

Das ist die feste Vorgabe (das "Skript" im Sinne von Vorgehen, nicht Code) für
jede zukünftige Fall-Erstellung, egal ob hier im Chat oder in einer späteren
Claude-Code-Session. Wird ergänzt, wenn wir Neues lernen — nicht stillschweigend
umgangen.

### 1. Diagnose-Auswahl — drei Achsen, nicht eine

- **IMPP-Prüfungshäufigkeit** — Zielexamen je Schwierigkeitsstufe: Vorklinik →
  Physikum (M1), Klinik → siehe Blueprint unten (M2-Ausrichtung, da "Klinik"
  in diesem Tool die Semester-5-8-/Famulatur-Stufe mit Fachterminologie ist),
  Examen → Hammerexamen (M2/M3).
- **Reale Prävalenz/Versorgungshäufigkeit (RKI)** — was Studierende in
  Famulatur/PJ tatsächlich sehen, nicht nur was geprüft wird.
- **Cannot-miss** — selten, aber zeitkritisch/lebensbedrohlich (Aortendissektion,
  Lungenembolie, Meningitis). Eigene, dritte Kategorie, nicht optional —
  gestützt durch IMPP-Blueprint-Achse 2 ("Notfallmaßnahmen" 5–20 %, siehe unten).

Zusätzlich beim Auswählen mitdenken:

- Breite über Organsysteme (Kardio, Pneumo, Gastro, Nephro, Endokrin,
  Hämato/Onko, Rheuma/Immunologie) — nicht 5× Herzinsuffizienz-Varianten.
  Gewichtung zwischen den Systemen richtet sich nach dem IMPP-Blueprint unten.
- Jede Diagnose braucht natürliche, lehrreiche Verwechslungskandidaten — sonst
  bleibt `differentialNotes` leer/erzwungen. Diagnose ohne plausible
  DDx-Nachbarn ist eine schlechte Wahl fürs Tool.
- Passung zur Schwierigkeitsstufe (lehrbuchhaft vs. atypisch, wie in
  `DIFFICULTY_INSTRUCTIONS` in `app/page.tsx`/Generierungs-Prompt definiert).

### 2. Daten-Konsistenz pro Fall — das eigentliche Korrektheits-Risiko

- Nicht nur "ist der Laborwert einzeln plausibel", sondern: passen ALLE Werte
  im Panel physiologisch zueinander (z. B. bei Sepsis müssen CRP/PCT/Leukos
  gemeinsam ins Bild passen, bei Niereninsuffizienz Kreatinin↑ mit ggf.
  Kalium↑ korrelieren) — genau die Fehlerklasse, die einem LLM am ehesten
  unbemerkt passiert.
- Demografie (Alter/Geschlecht) muss zur echten Epidemiologie der Diagnose
  passen, außer bei Examen-Stufe bewusst atypisch.
- Bildgebungsbefund muss zum realen Befundmuster der Diagnose passen, gleiche
  Sorgfalt wie Labor.
- Die Werte/Klinik der Distraktor-Diagnosen mitdenken, damit die
  `differentialNotes`-Begründung fachlich stimmt.

### 3. Prozess pro Fall

Diagnose nach obigem Filter wählen → Recherche (Diagnosekriterien +
Referenzwerte + die 3 Differenzialdiagnosen samt Unterscheidungsmerkmalen,
nur AWMF/Onkopedia/RKI/PubMed/leitlinien.de/IMPP, kein Amboss/UpToDate) →
Fall schreiben → Konsistenz-Selbstcheck (Labor/Bildgebung/Anamnese
widerspruchsfrei) → Schema-Validierung (automatisiert) → `sourceNotes`
ehrlich befüllen, auch wenn Quellenlage dünn ist — dann so vermerken statt
eine Quelle zu erfinden.

**`keyTakeaway` ist Pflicht, kein Nice-to-have.** Ein Satz, der die
Diagnose auf den entscheidenden Befund-Cluster verdichtet (Muster:
"Befund A + Befund B + Ausschluss C = Diagnose, bis zum Beweis des
Gegenteils"). Bei Fall 1 zuerst vergessen worden — dadurch fehlte auch das
`caseContext`-Badge im UI, weil beide im selben bedingten Block hingen. Fix:
Code rendert `keyTakeaway` und `caseContext` jetzt unabhängig voneinander,
aber `keyTakeaway` trotzdem ab jetzt bei jedem Fall aktiv mitschreiben, nicht
nur wenn's "so nebenbei passt".

### 4. Über die Zeit

Abdeckungs-Matrix (unten) nach jedem Fall aktualisieren, damit die Erweiterung
über die Wochen nicht zufällig driftet, sondern Lücken bewusst gefüllt werden.

### 5. Case-Kontext-Badge (UI, ab jetzt Pflichtfeld pro Fall)

Jeder Fall bekommt einen kurzen, belegten Kontext-Satz, WARUM diese Diagnose
in der Auswahl ist — reine Anzeige, kein Score-Faktor. Neues optionales
Case-Feld (additiv, wie `differentialNotes`), Arbeitsname `caseContext`:

```
caseContext: {
  category: "haeufig" | "cannot-miss";
  note: string; // 1 Satz, mit Quelle/Zahl, z. B.
                // "Häufigste Hauptdiagnose in deutschen Krankenhäusern 2023
                //  (Destatis, 468.479 Fälle)."
}
```

Anzeige-Regeln (UX-Entscheidung von heute):
- Sitzt NICHT in der rechten Sidebar (die bleibt schlank, Fall-Score-fokussiert),
  sondern als kleines Pill-Badge direkt am „Worauf es ankam"/keyTakeaway-Block
  im Ergebnis-Screen — dort schaut der Nutzer nach der Aufdeckung ohnehin hin.
- Wird **erst nach Diagnose-Aufdeckung** angezeigt (Ergebnis-Phase), nie
  während des Spielens — sonst Spoiler-Risiko (Häufigkeit/Kategorie würde die
  Diagnose verraten, bevor der Nutzer entschieden hat).
- Nur `category: "cannot-miss"` bekommt den Marker-Highlight-Effekt (dezenter
  schräger Farbstreifen hinter Icon+Text, warme Akzentfarbe, kein grelles
  Gelb) — bewusst nicht bei `"haeufig"`, sonst nutzt sich die visuelle
  Betonung ab (Banner-Blindheit) und der Cannot-miss-Signalwert geht verloren.
- Noch offen: Umsetzung im Code (`app/page.tsx`, `ResultIsland`) — bislang nur
  Design-Entscheidung, noch nicht implementiert.

### 6. Diagnostische Spannung — Anti-Giveaway-Prinzipien (ab 2026-07-09, Pflicht)

Ausgelöst durch Sergio's Review von Fall 1: der ursprüngliche Fall verriet die
Diagnose faktisch schon in der Anamnese (150 g Alkohol/Tag + alle relevanten
DDx-Negativa gebündelt im ersten Absatz), dadurch kein echtes diagnostisches
Rätsel mehr. Ab jetzt verbindlich für jeden Fall:

- **Den entscheidenden Risikofaktor/Befund nicht extrem/plakativ machen.**
  Menge/Ausprägung so wählen, dass sie knapp über der diagnostischen Schwelle
  liegt (z. B. 80–100 g Alkohol/Tag statt 150 g), nicht so extrem, dass die
  Diagnose beim ersten Lesen schon feststeht.
- **Pertinente Negativa nicht bündeln.** Nicht alle DDx-ausschließenden
  Angaben ("kein Fieber, keine Thoraxschmerzen, keine Palpitationen") direkt
  hintereinander in einem Satz — das eliminiert mehrere Differenzialdiagnosen
  gleichzeitig und nimmt dem Fall die Spannung. Über den Anamnese-Text
  verteilen.
- **Ein leichter Red Herring pro Fall, wo medizinisch plausibel.** Ein
  unspezifisches, atypisches Symptom, das eine naheliegende Differenzialdiagnose
  suggeriert, aber durch Untersuchung/Bildgebung/Labor korrekt entkräftet wird
  (Beispiel Fall 1: untypisches Brustdruckgefühl ohne Ausstrahlung, das die
  Ischämie-Verdachtsdiagnose testet, aber durch die fehlende regionale
  Wandbewegungsstörung im Echo ausgeschlossen wird). Kein Widerspruch zur
  Korrektheit — der Red Herring muss selbst medizinisch stimmig und im
  `differentialNotes`-Eintrag der jeweiligen Option sauber entkräftet sein.
- **Patientenzitat (`chiefComplaint`) umgangssprachlich, nicht lehrbuchhaft.**
  Konkrete Alltagsmarker statt klinischer Umschreibung — "die Schuhe passen
  abends kaum noch"/"die Söckchen schneiden ein" statt "meine Beine sind dick
  geworden". Reale Patienten beschreiben Befunde über Alltagsgegenstände
  (Schuhe, Ringe, Hosenbund), nicht anatomisch.
- **`explanation` (Vollständige Begründung) führt über Ausschlusslogik zur
  Diagnose, nicht nur Bestätigung — aber maximal 2–3 kompakte Sätze.** Nicht
  jede DDx in einem eigenen Satz einzeln ausschließen (macht die Result-Insel
  zu hoch, siehe UI-Lehre unten) — die volle Einzel-Begründung pro Option
  steht ohnehin in `differentialNotes` und ist per Klick abrufbar.
  `explanation` ist die kurze Zusammenschau, nicht die Wiederholung aller
  `differentialNotes` in Fließtext. `keyTakeaway` bleibt davon unberührt — der
  ist bewusst ein kurzer, merkbarer Leitsatz im Muster "Befund A + Befund B +
  Ausschluss C = Diagnose" (siehe Abschnitt 3) und soll NICHT zur
  Ausschluss-Erzählung umgebaut werden, sonst verliert er seine
  Kürze/Merkbarkeit. Die drei Felder haben unterschiedliche Jobs: `keyTakeaway`
  = Merksatz fürs Examen, `explanation` = kurzer Denkweg dorthin,
  `differentialNotes` = volle Einzel-Begründung pro falscher Option on-demand.

Fall 1 (`dilatative-kardiomyopathie-1`) am 2026-07-09 nach diesen Prinzipien
überarbeitet: Alkohol 150 g → 90 g/Tag, Negativa entzerrt, atypisches
Brustdruckgefühl als Red Herring ergänzt (inkl. passendem
`differentialNotes`-Eintrag), Zitat auf "Schuhe passen kaum noch" geändert,
`explanation` auf Ausschlusslogik umgeschrieben. `keyTakeaway` unverändert.

### 7. EKG-Befunde (ab Fall 2, Pflicht wo relevant)

Das Schema hat kein eigenes EKG-Feld (nur Anamnese/Untersuchung/Bildgebung/
Labor). Entscheidung vom 2026-07-09: EKG-Befund wird als eigener, klar
abgesetzter Absatz **innerhalb von `examination`** untergebracht (Überschrift
"EKG (bei Aufnahme, 12-Kanal):" im Fließtext), nicht in `imaging` — das Label
"Bildgebung" passt semantisch nicht zu einem EKG. Keine echte Bild-Generierung
(SVG/Grafik) — ein pixelgenaues, medizinisch korrektes EKG-Bild lässt sich
nicht zuverlässig erzeugen, gerade bei Cannot-miss-Diagnosen wäre ein subtil
falsches EKG-Bild gefährlicher als keins. Stattdessen präzise Text-Beschreibung
(Ableitungen, ST-Streckenausmaß in mV, Morphologie) — konsistent damit, dass
auch `imaging` (z. B. Echo in Fall 1) reiner Text ist, nirgends in der App
echte Bilder vorkommen. Bei Bedarf für viele künftige Kardio-/Pneumo-Fälle
später eine eigene EKG-Kategorie im Schema erwägen (mehr Code-Aufwand: neues
Feld, neuer Reveal-Button, Anpassungen in mehreren UI-Stellen) — aktuell nicht
gemacht, da Aufwand für einen Fall nicht gerechtfertigt.

### Primärquelle für die Gewichtung: IMPP-Blueprint M2

Das IMPP veröffentlicht offiziell einen "Blueprint" für das M2-Examen (320
Prüfungsaufgaben), der die Ziel-Verteilung nach Organsystem angibt (Quelle:
[Blueprint M2-Examen.pdf](https://www.impp.de/files/PDF/Allgemein/Blueprint%20M2-Examen.pdf),
abgerufen über [impp.de/blueprint-m2-examen.html](https://www.impp.de/blueprint-m2-examen.html)).
Relevante Systeme für Innere Medizin, mit offiziellem Zielanteil (Achse 1):

| Organsystem (IMPP-Blueprint) | Zielanteil M2 gesamt |
|---|---|
| Kardiovaskuläres System | 10–20 % |
| Muskuloskelettales System und Weichgewebe | 10–15 % (Innere/Rheuma-Anteil daran nicht separat ausgewiesen) |
| Respiratorisches System | 5–15 % |
| Verdauungssystem | 5–15 % |
| Urogenitales System | 5–15 % |
| Hormone und Stoffwechsel | 5–10 % |
| Blut und Immunologie | 2–10 % |

Zusätzlich Achse 2 des Blueprints (Diagnose 35–60 %, Notfallmaßnahmen 5–20 %)
bestätigt unabhängig, dass Notfall-/Cannot-miss-Inhalte einen substantiellen,
eigenständigen Anteil verdienen — nicht nur "wenn Zeit bleibt".

**Wichtige Einschränkung, ehrlich benannt:** Diese Prozentzahlen gelten für das
gesamte M2-Examen (alle Fächer), nicht exklusiv für Innere Medizin — ein Teil
z. B. von "Kardiovaskulär" oder "Muskuloskelettal" entfällt auf Chirurgie/
Orthopädie, nicht auf Innere. Ich nutze die Zahlen daher für die *relative*
Gewichtung zwischen den Innere-relevanten Organsystemen (Kardio vor
Pneumo/Gastro/Nephro vor Endokrin vor Hämato/Immun), nicht als exakte
Fallzahl-Vorgabe. Infektiologie ist im Blueprint keine eigene Achse, sondern
über alle Organsysteme verteilt (Sepsis unter Kardio/Blut, Pneumonie unter
Respiratorisch, Meningitis eher Neuro) — deshalb unten in die Organsysteme
integriert statt als eigene Zeile.

Der volle IMPP-Gegenstandskatalog (GK2, Krankheitsbilder-Ebene) liegt nur als
Bild-/Layout-PDF vor, das sich nicht sauber als Text extrahieren ließ (Versuch
dokumentiert, Ergebnis unbrauchbar) — für die einzelne Diagnose-Auswahl bleibt
daher die Kombination aus Blueprint-Gewichtung + RKI-Prävalenz + Cannot-miss-
Urteil die Grundlage, nicht eine vollständige IMPP-Krankheitsliste.

## Innere (Klinik) — Stand

| ID | Diagnose | Organsystem | Kategorie | Status | Hinzugefügt |
|---|---|---|---|---|---|
| `dilatative-kardiomyopathie-1` | Alkoholtoxische dilatative Kardiomyopathie | Kardiologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt, 2026-07-09 überarbeitet (Anti-Giveaway, s. Abschnitt 6) | 2026-07-08 |
| `nstemi-1` | Nicht-ST-Hebungsinfarkt (NSTEMI) | Kardiologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (Anti-Giveaway + EKG-Regel von Anfang an angewendet) | 2026-07-09 |
| `pneumonie-1` | Ambulant erworbene Pneumonie | Pneumologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `lungenembolie-1` | Akute Lungenembolie | Pneumologie/Kardiologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `pankreatitis-1` | Akute Pankreatitis (biliär) | Gastroenterologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `obere-gi-blutung-1` | Blutendes gastroduodenales Ulkus | Gastroenterologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `praerenales-anv-1` | Prärenales akutes Nierenversagen | Nephrologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `dka-1` | Diabetische Ketoazidose | Endokrinologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `eisenmangelanaemie-1` | Eisenmangelanämie bei okkultem GI-Blutverlust | Hämatologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `riesenzellarteriitis-1` | Riesenzellarteriitis (Arteriitis temporalis) | Rheumatologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-09 |
| `adhf-1` | Akut dekompensierte Herzinsuffizienz | Kardiologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt (Extra-Fall) | 2026-07-09 |
| `perikardtamponade-1` | Perikardtamponade bei malignem Perikarderguss | Kardiologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `vorhofflimmern-1` | Vorhofflimmern mit tachykarder Überleitung (Erstdiagnose) | Kardiologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-13 |
| `infektioese-endokarditis-1` | Infektiöse Endokarditis der Trikuspidalklappe bei i.v. Drogenabusus | Kardiologie/Infektiologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `copd-exazerbation-globalinsuffizienz-1` | Akute Exazerbation der COPD mit respiratorischer Globalinsuffizienz | Pneumologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt (mittel-schwierig) | 2026-07-13 |
| `spontanpneumothorax-1` | Primärer Spontanpneumothorax | Pneumologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-13 |
| `leberzirrhose-hepatische-enzephalopathie-1` | Dekompensierte Leberzirrhose mit hepatischer Enzephalopathie | Gastroenterologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `akute-cholangitis-1` | Akute Cholangitis bei Choledocholithiasis | Gastroenterologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `colitis-ulcerosa-erstmanifestation-1` | Colitis ulcerosa (Erstmanifestation) | Gastroenterologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-13 |
| `nephrotisches-syndrom-1` | Nephrotisches Syndrom (V. a. membranöse Nephropathie) | Nephrologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `tiefe-beinvenenthrombose-1` | Tiefe Beinvenenthrombose | Nephrologie/Angiologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-13 |
| `hyperosmolares-hyperglykaemisches-syndrom-1` | Hyperosmolares hyperglykämisches Syndrom (HHS) | Endokrinologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `addison-krise-1` | Addison-Krise (primäre NNR-Insuffizienz) | Endokrinologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `akute-myeloische-leukaemie-1` | Akute myeloische Leukämie (AML), Erstdiagnose | Hämatologie/Onkologie | Cannot-miss + DDx-tauglich | ✅ quellenbasiert erstellt (schwierig) | 2026-07-13 |
| `rheumatoide-arthritis-frueherkennung-1` | Rheumatoide Arthritis (Früh-/Erstmanifestation) | Rheumatologie | Häufig + DDx-tauglich | ✅ quellenbasiert erstellt | 2026-07-13 |

**Hinweis zur Abgrenzung von Allgemeinmedizin:** Zwischen `adhf-1` und
`perikardtamponade-1` liegen in `innere.json` physisch 15 Allgemeinmedizin-
Fälle (siehe `docs/allgemeinmedizin-case-tracking.md`, 2026-07-11 hinzugefügt,
Hausarzt-/Famulatur-Perspektive). Die 14 Fälle ab `perikardtamponade-1` sind
bewusst wieder klassische Innere-Subspezialitäten-Fälle (Klinik-/Stations-
Perspektive statt Hausarztpraxis) — Nutzer-Zählung: 11 ursprüngliche Innere-
Fälle + 14 neue = 25 "Innere" Fälle, plus separat 15 Allgemeinmedizin-Fälle,
alle technisch im selben `innere.json`-Pool. Diese Erweiterung enthält
bewusst mehrere schwierige/seltene Cannot-miss-Fälle (Perikardtamponade,
Endokarditis, hepatische Enzephalopathie, Cholangitis, nephrotisches
Syndrom, HHS, Addison-Krise, AML) statt nur lehrbuchhafter Standardfälle —
auf expliziten Wunsch, um das Schwierigkeitsspektrum zu verbreitern.

## Abdeckungs-Matrix (Organsystem × Kategorie)

Ziel: relative Gewichtung nach IMPP-Blueprint (Kardio > Pneumo≈Gastro≈Nephro >
Endokrin > Hämato/Immun), nicht Gleichverteilung über alle Systeme. Zählt nur
die 25 "Innere"-Fälle (11 ursprüngliche + 14 neue), nicht die 15
Allgemeinmedizin-Fälle (eigene Matrix in
`docs/allgemeinmedizin-case-tracking.md`).

| Organsystem | IMPP-Zielanteil (relativ) | Häufig | Cannot-miss | DDx-tauglich abgedeckt |
|---|---|---|---|---|
| Kardiologie | hoch (10–20 %) | 3 | 3 | 6 |
| Pneumologie | mittel-hoch (5–15 %) | 2 | 2 | 4 |
| Gastroenterologie | mittel-hoch (5–15 %) | 2 | 3 | 5 |
| Nephrologie/Angiologie | mittel-hoch (5–15 %) | 2 | 1 | 3 |
| Endokrinologie/Stoffwechsel | mittel (5–10 %) | 0 | 3 | 3 |
| Hämatologie/Onkologie | mittel-niedrig (2–10 %) | 1 | 1 | 2 |
| Rheumatologie | unklar (Anteil an Muskuloskelettal 10–15 % nicht trennscharf) | 1 | 1 | 2 |

**Alle 25 geplanten Innere-Fälle sind erstellt (Stand 2026-07-13).** Zweiter
Batch (14 Fälle, davon 8 cannot-miss/schwierig) abgeschlossen — deckt zuvor
dünne Bereiche (Endokrinologie, Hämatologie, Rheumatologie, Nephrologie) ab
und ergänzt Kardiologie/Pneumologie/Gastroenterologie um komplexere,
seltenere Präsentationen. Weitere Erweiterung folgt bei Bedarf der gleichen
Methode (Abschnitt 1–7).

## Nächste Kandidaten — überarbeiteter Vorschlag (noch nicht erstellt, zur Freigabe)

Ersetzt die alte, unausgewogene Liste aus den kaputten IDs. Nach Blueprint-
Gewichtung + Cannot-miss + DDx-Reichtum ausgewählt, deckt jetzt alle
Innere-relevanten Organsysteme ab:

1. ~~Akutes Koronarsyndrom (NSTEMI)~~ — ✅ erstellt als `nstemi-1` (2026-07-09), DDx: Perikarditis, Aortendissektion, Lungenembolie
2. ~~Ambulant erworbene Pneumonie~~ — ✅ erstellt als `pneumonie-1` (2026-07-09), DDx: Lungenembolie, COPD-Exazerbation, Tuberkulose
3. ~~Akute Lungenembolie~~ — ✅ erstellt als `lungenembolie-1` (2026-07-09), DDx: ACS, Pneumonie, Pneumothorax
4. ~~Akute Pankreatitis~~ — ✅ erstellt als `pankreatitis-1` (2026-07-09), DDx: Cholezystitis, perforiertes Ulkus, Mesenterialischämie
5. ~~Obere gastrointestinale Blutung~~ — ✅ erstellt als `obere-gi-blutung-1` (2026-07-09), DDx: Ösophagusvarizenblutung, Mallory-Weiss-Läsion, Angiodysplasie
6. ~~Akutes Nierenversagen (prärenal)~~ — ✅ erstellt als `praerenales-anv-1` (2026-07-09), DDx: intrarenales ANV, postrenales ANV, akut-auf-chronische Niereninsuffizienz
7. ~~Diabetische Ketoazidose~~ — ✅ erstellt als `dka-1` (2026-07-09), DDx: HHS, Laktatazidose, Alkoholketoazidose
8. ~~Eisenmangelanämie bei okkultem GI-Blutverlust~~ — ✅ erstellt als `eisenmangelanaemie-1` (2026-07-09), DDx: Tumoranämie/ACD, Hämolyse, Thalassämie
9. ~~Riesenzellarteriitis (Arteriitis temporalis)~~ — ✅ erstellt als `riesenzellarteriitis-1` (2026-07-09), DDx: Migräne, Trigeminusneuralgie, TIA
10. ~~Akut dekompensierte Herzinsuffizienz~~ — ✅ erstellt als `adhf-1` (2026-07-09), DDx: Pneumonie, COPD-Exazerbation, ACS — Extra-Fall

**Freigegeben und erstellt (2026-07-09):** alle 11 Fälle fertig. `innere.json` wurde final durch den vollen Inhalt von `innere-pilot-staging.json` ersetzt (11 Fälle live).

## Workflow beim Erstellen (statt caseId-Route-Feature)

Damit sich jeder neue Fall auf localhost zuverlässig testen lässt, ohne die
Zufallsauswahl der API-Route anzufassen:

- `public/cases/innere-pilot-staging.json` sammelt ALLE bereits freigegebenen
  Fälle (Master-Kopie, wächst mit jedem Fall).
- `public/cases/innere.json` (die live vom Loader gelesene Datei) enthält
  während der Erstellungsphase immer nur GENAU EINEN Fall — den, der gerade
  getestet wird — damit die zufällige Fall-Auswahl der API-Route ihn
  garantiert liefert.
- Nach Freigabe eines Falls: in die Staging-Datei übernehmen, dann den
  nächsten Fall research/schreiben und allein in `innere.json` setzen.
- Ganz am Ende (alle 11 freigegeben): `innere.json` einmalig durch den vollen
  Inhalt der Staging-Datei ersetzen (finaler Schritt, entspricht Task 7).

## Sonstige Case-Banken (noch nicht angefasst)

- `vorklinik.json` (50 Fälle, ungeprüft, blind generiert)
- `pj.json` (40 Fälle, ungeprüft, blind generiert)
