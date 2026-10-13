---
name: innere-klinik-0001
description: Fallakte zum ersten freigegebenen v3-Fall (Diabetische Ketoazidose, Innere, Niveau einfach/cannot-miss) — Quellenhergang, Gegenprüfungs-Änderungen, Regelcheck.
---

# Fallakte — innere-klinik-0001 (Diabetische Ketoazidose)

**Disziplin:** Innere · **Niveau:** einfach (häufig, leicht zu erkennen) · **Cannot-miss:** ja
**Status:** `verify.status: pass` · `humanApproved: true` (Sergio, 30.09.2026)
**Quellenklasse aller Belege:** nur-fakten · kein Case Report als Vorlage · keine gesperrte Quelle
(Amboss, UpToDate, IMPP) verwendet.

## 1. Quellen aus Chat "Fallerstellung"

1. AWMF S3-Leitlinie "Therapie des Typ-1-Diabetes", Registernummer 057-013, Version 5.1,
   Stand 09/2023 — https://register.awmf.org/assets/guidelines/057-013l_S3-Therapie-Typ-1-Diabetes_2023-09_1.pdf
   Genutzt für: Häufigkeit der Entgleisung bei Erstmanifestation (ursprünglich ca. 15–30 %,
   in der Gegenprüfung auf 6–21 % nach Konsensusbericht korrigiert), Inselautoantikörper
   (GAD65, IA-2, ZnT8), C-Peptid (in der Gegenprüfung gestrichen, s.u.).
2. Umpierrez GE et al., "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report"
   (ADA/EASD/JBDS/AACE/DTS), 2024 — PMC Volltext: https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/
   Genutzt für: Diagnosekriterien, Schweregradeinteilung, Laborkonstellation, EKG-Hinweise,
   Differentialdiagnosen ketotischer Zustände, Mortalität/Komplikationen.

## 2. Beleg je Aussage (aus Chat "Gegencheck")

| # | Aussage | Feld(er) im Fall | Quelle | Link | Geprüft von / am |
|---|---|---|---|---|---|
| 1 | DKA-Diagnosekriterien: Glukose ≥ 200 mg/dl oder bekannter Diabetes, β-HB ≥ 3,0 mmol/l, pH < 7,30 bzw. HCO₃⁻ < 18 mmol/l | explanation | Konsensusbericht Hyperglycaemic Crises in Adults (ADA/EASD/JBDS/AACE/DTS, Diabetologia 2024) | https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/ | Claude, 30.09.2026 |
| 2 | Schweregrad mittelschwer: pH 7,0–7,25, HCO₃⁻ 10–<15, wach/somnolent | explanation | wie 1 | wie 1 | Claude, 30.09.2026 |
| 3 | HHS-Abgrenzung: pH ≥ 7,30, HCO₃⁻ ≥ 18 mmol/l, Osmolalität > 320 mosmol/kg | differentialNotes (HHS) | wie 1 | wie 1 | Claude, 30.09.2026 |
| 4 | Kalium initial hoch durch Insulinmangel und Azidose trotz Gesamtkörperdefizit | explanation | wie 1 | wie 1 | Claude, 30.09.2026 |
| 5 | Alkoholische Ketoazidose: chronischer Konsum + kürzlicher Exzess, Erbrechen, Hungern; mit oder ohne Hyperglykämie | differentialNotes (AKA) | wie 1 | wie 1 | Claude, 30.09.2026 |
| 6 | DKA als Erstmanifestation bei 6–21 % der Erwachsenen mit neuem Typ-1-Diabetes | caseContext.note | wie 1 | wie 1 | Claude, 30.09.2026 |
| 7 | Kussmaul-Atmung, Acetongeruch, Bauchschmerz (> 50 %) | explanation, untersuchung | wie 1 | wie 1 | Claude, 30.09.2026 |
| 8 | Pathophysiologie: Insulinmangel + gegenregulatorische Hormone, hepatische Ketogenese | explanation | wie 1 | wie 1 | Claude, 30.09.2026 |
| 9 | Erstdiagnostik: Glukose, Elektrolyte, Blutgase, Blutbild, Ketone, EKG; Auslösersuche (Infekt, Herzinfarkt) | explanation | wie 1 | wie 1 | Claude, 30.09.2026 |
| 10 | Komplikationen: akutes Nierenversagen, Rhythmusstörungen durch Kalium, Hirnödem | caseContext.note | wie 1 | wie 1 | Claude, 30.09.2026 |
| 11 | Akute Pankreatitis: ≥ 2 von 3 Kriterien (typischer Schmerz, Lipase ≥ 3-fach, Bildgebung) | differentialNotes (Pankreatitis) | DGVS S3-Leitlinie Pankreatitis (AWMF 021-003), Version 2.0, 09/2021, Empfehlung 3.14 | https://www.dgvs.de/leitlinien/leber-galle-pankreas/pankreatitis/ | Claude, 30.09.2026 |
| 12 | Lipase bis zum 3-Fachen kann unspezifisch erhöht sein | differentialNotes (Pankreatitis) | PMID 11095328 – Nonspecific hyperamylasemia and hyperlipasemia in diabetic ketoacidosis | https://pubmed.ncbi.nlm.nih.gov/11095328/ | Sergio, 30.09.2026 |
| 13 | Leukozytenzahl bei DKA häufig erhöht | explanation | PMC3638300 – Int J Med Sci 2013;10(6):758–765 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3638300/ | Sergio, 30.09.2026 |
| 14 | Serologische Marker Typ-1-Diabetes: GAD65, IA-2, ZnT8 (IAA nur Kinder/Jugendliche) | explanation | AWMF S3-Leitlinie Therapie des Typ-1-Diabetes (057-013), Langfassung 09/2023 | https://register.awmf.org/assets/guidelines/057-013l_S3-Therapie-Typ-1-Diabetes_2023-09_1.pdf | Sergio, 30.09.2026 |
| 15 | Gehäufte Autoimmunthyreoiditis bei Typ-1-Diabetes | explanation, vorerkrankungen | wie 14 | wie 14 | Sergio, 30.09.2026 |

Punkte 12, 13, 14, 15 waren initial technisch nicht prüfbar (PMC/PubMed-Bot-Sperre, siehe
DECISION_LOG.md 30.09.) und wurden von Sergio manuell im Browser bestätigt — Präzedenzfall für
die ab jetzt formalisierte Max-4-Regel im Gegencheck-Prompt.

## 3. Berechnete Werte (rechnerisch geprüft, keine externe Quelle nötig)

- Henderson-Hasselbalch: pCO₂ 29 mmHg, HCO₃⁻ 11 mmol/l → pH 7,19 ≈ 7,20 ✓
- Base Excess (Van Slyke) ≈ −15,2 mmol/l ✓
- Anionenlücke: 131 − (97 + 11) = 23 mmol/l ✓
- Osmolalität berechnet: 2×131 + 512/18 + Harnstoff 10,2 = 300,6 vs. gemessen 302 ✓; effektiv 290 (< HHS-Schwelle) ✓
- Korrigiertes Natrium ≈ 137,6 mmol/l (Verdünnungseffekt) ✓
- BMI 64 kg / 1,82² = 19,3 ✓ · HbA1c 11,6 % = 103 mmol/mol ✓ · Glukose 512 mg/dl = 28,4 mmol/l ✓ · Lipase 92/60 = 1,5-fach ✓

## 4. Änderungsprotokoll der Gegenprüfung (30.09.2026)

1. Blutgasanalyse rechnerisch korrigiert: pH 7,14 → 7,20, pCO₂ 25 → 29 mmHg, BE −16 → −15
   (alte Kombination war nach Henderson-Hasselbalch unmöglich).
2. HHS-Grenzwerte an den Konsensus angepasst (HCO₃⁻ ≥ 18 statt > 15; Osmolalität „über 320"
   statt „deutlich über 320").
3. Kaliummechanismus ergänzt: Insulinmangel und Azidose statt nur H⁺-Austausch.
4. Alkoholische Ketoazidose: falsches Gegenargument „Ethanol nicht nachweisbar" entfernt;
   Blutzucker „mit oder ohne Hyperglykämie"; Widerlegung jetzt über HbA1c und Anamnese.
5. Pankreatitis-Kriterien präzisiert (2 von 3).
6. DKA-Anteil bei Erstmanifestation korrigiert: „Sechstel bis knapp Drittel" → 6–21 % bei
   Erwachsenen; Quelle von S3-Leitlinie auf Konsensus umgestellt.
7. „Häufigste hyperglykämische Notfallsituation" → „typische hyperglykämische Krise bei
   jüngeren Menschen mit Typ-1-Diabetes".
8. keyTakeaway: „oft" → „nicht selten" (Anteil 6–21 %).
9. C-Peptid gestrichen (nicht durch die bestätigte Leitlinienstelle gedeckt).
10. Leukozyten- und Lipase-Aussage auf den bestätigten Beleg-Umfang reduziert.
11. sourceNotes, sources[] und wissensstand an die tatsächliche Herkunft angepasst.

## 5. Regelprüfung

- Diagnose-Leak (de + en, alle vorab sichtbaren Felder): keiner
- Harte Regel 9 (keine Quellennennung im Spieltext): eingehalten
- Distraktor-Regel 1–3: erfüllt für alle 3 Distraktoren; Regel 4 mit Anmerkung
  (HHS/DKA-Mischformen, Pankreatitis als möglicher Auslöser)
- Diagnose-Dopplung: keine (erster v3-Fall) — Eintrag in `BEREITS_VERWENDETE_DIAGNOSEN.md` erfolgt
- Level-Einstufung: häufig / leicht zu erkennen / cannotMiss = true, bestätigt
