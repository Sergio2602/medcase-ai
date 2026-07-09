# Vorklinik — Case-Tracking & Methodik

Lebendes Dokument, analog zu `docs/case-tracking.md` (Innere/Klinik), aber
für die Vorklinik-Fallbank. Abschnitt 6 (Anti-Giveaway) und Abschnitt 7
(EKG-Platzierung) aus dem Innere-Dokument gelten **1:1 auch hier** und
werden nicht dupliziert — bei Widerspruch gilt das Innere-Dokument als
Referenz für die generellen Prinzipien, dieses Dokument ergänzt nur die
Vorklinik-spezifische Auswahl-Logik.

## 1. Warum ein eigenes Schema für Vorklinik?

Für M2 (Zweites Staatsexamen) gibt es einen offiziellen IMPP-**Blueprint**
mit numerischer Zielverteilung nach Fachgebiet/Organsystem — das war die
Grundlage für die Innere-Fallauswahl.

Für M1 (Physikum) existiert **kein** äquivalenter Blueprint. Geprüft wird
stattdessen nach dem **IMPP-Gegenstandskatalog 1 (GK1)**, sechs
fachbezogenen Teilkatalogen (nicht organsystem-gewichtet):

- Physik für Mediziner
- Physiologie
- Chemie für Mediziner und Biochemie/Molekularbiologie
- Biologie für Mediziner
- Anatomie
- Medizinische Psychologie und Medizinische Soziologie

Jeder GK1-Katalog enthält in Spalte 4 **"Anwendungsbeispiele"** — vom IMPP
selbst markierte Themen mit hoher klinischer Relevanz oder besonderem
didaktischem Modellcharakter. Das ist der Anknüpfungspunkt für dieses
Fallformat: statt einer Prozent-Tabelle wie bei Innere nutzen wir die
GK1-Anwendungsbeispiele als Signal dafür, welche vorklinischen Themen sich
sinnvoll in eine klinische Fall-Vignette übersetzen lassen.

Praktisch relevant für Fall-Vignetten sind vor allem drei der sechs
Kataloge: **Anatomie, Physiologie, Biochemie/Stoffwechsel**. Physik,
reine Biologie und Med. Psychologie/Soziologie eignen sich schlechter für
das "Patient untersuchen → Diagnose stellen"-Format und bleiben vorerst
außen vor (kann später ergänzt werden, falls gewünscht).

## 2. Drei Auswahl-Achsen

**Achse 1 — GK1-Fachabdeckung.** Fälle verteilt über Anatomie, Physiologie,
Biochemie/Stoffwechsel, damit keines der drei Kern-Fächer über- oder
unterrepräsentiert ist. Ziel für die ersten 15: ca. 5/5/5.

**Achse 2 — Erkennbarkeit & didaktischer Modellcharakter.** Deckt sich mit
dem IMPP-eigenen Auswahlkriterium für Anwendungsbeispiele. Diagnose muss
ein klares, lehrbuchhaftes Muster haben, das früh im Studium sitzen soll
(z. B. Karpaltunnelsyndrom für N.-medianus-Anatomie, Gichtanfall für
Purinstoffwechsel). Anders als bei Innere ist ein gewisses Maß an
"klassischem" Erscheinungsbild hier **gewollt** — Mustererkennung lernen
ist bei diesem Adressatenkreis explizit der Zweck (siehe Abschnitt 4 zur
Kalibrierung ggü. Anti-Giveaway).

**Achse 3 — Leichte Vorbereitung auf Klinik.** Neue, vom Nutzer explizit
geforderte Achse. Umgesetzt **nicht** als neues Schema-Feld, sondern als
Auswahlprinzip: Diagnosen werden bevorzugt, die auch in der Klinik/PJ
direkt wiederkehren (Karpaltunnelsyndrom, Gicht, Transfusionszwischenfall,
Hyperparathyreoidismus etc. sind alles Themen, die ein Kliniker ebenfalls
kennen muss — keine rein akademischen Kuriositäten ohne klinischen
Wiederkehrwert). Zusätzlich soll `keyTakeaway` möglichst den Bogen
Mechanismus → klinisches Zeichen explizit schlagen (siehe Abschnitt 5).

Cannot-miss-Fälle (Achse 3 bei Innere) spielen hier eine kleinere Rolle,
bleiben aber nicht komplett außen vor: klassische Akutbilder mit hohem
Wiedererkennungswert (z. B. Appendizitis) sind weiterhin sinnvoll, weil
"das *muss* man erkennen" auch für Vorklinik-Studierende ein legitimes
Lernziel ist.

## 3. Schema

Identisch zum Innere-Schema (siehe `docs/case-tracking.md`), keine neuen
Felder: `id`, `difficulty` (`"vorklinik"`), `patientName`, `age`, `gender`,
`chiefComplaint`, `history`, `examination`, `labs`, `imaging`,
`correctDiagnosis`, `diagnosisOptions` (4, inkl. korrekt),
`keyTakeaway`, `differentialNotes`, `explanation`, `sourceNotes`,
`caseContext` (`{category: "haeufig" | "cannot-miss", note}`).

Eine dedizierte dritte `caseContext`-Kategorie ("Klinik-Brücke" o. ä.)
wäre denkbar, würde aber eine Typ-Erweiterung + neues Badge-Styling in
`app/page.tsx` erfordern. Nicht Teil dieser Content-Planung — nur als
mögliche spätere UI-Erweiterung vermerkt, nicht jetzt umgesetzt.

## 4. Anti-Giveaway — Kalibrierung für Vorklinik

Abschnitt 6 aus `docs/case-tracking.md` gilt unverändert (keine
plakativen Extremwerte, verteilte Negativbefunde, ein sauber aufgelöster
Red Herring pro Fall, umgangssprachliche `chiefComplaint`, kompakte
2–3-Satz-`explanation`).

Eine Anpassung: Bei Innere ging es darum, zu *offensichtliche* Leitbefunde
zu entschärfen. Bei Vorklinik ist ein gewisses Maß an lehrbuchhaftem
Muster **erwünscht** (Achse 2) — Rovsing-/Psoas-/Blumberg-Zeichen bei
Appendizitis zu kennen, ist selbst das Lernziel. Der Anti-Giveaway-Effekt
wird hier nicht über "weniger klassisch" erzeugt, sondern über
**Informations-Pacing**: Befunde erscheinen nacheinander beim Aufdecken
(Anamnese → Untersuchung → Labor), nicht alle gebündelt im ersten Satz,
und die vier Antwortoptionen bleiben plausibel genug, dass die
Ausschlusslogik trotzdem etwas zu tun hat.

## 5. `keyTakeaway`-Konvention (Klinik-Brücke)

Wo passend, soll der `keyTakeaway` den Mechanismus explizit mit dem
klinischen Zeichen verknüpfen, z. B.:

> "Viszeraler Schmerz periumbilikal (Mesenterica-superior-Innervation des
> embryologischen Mitteldarms) wandert zu somatischem Schmerz rechter
> Unterbauch (Peritoneum parietale) = klassische Appendizitis-Progression."

Das ist kein Pflichtformat, aber die bevorzugte Form, wenn ein Fall einen
klaren Mechanismus-Zeichen-Zusammenhang hat — erfüllt Achse 3, ohne neue
Felder zu brauchen.

## 6. EKG / Bildgebung

Siehe Abschnitt 7 in `docs/case-tracking.md` — gilt unverändert (Befunde
als Text in `examination`, keine generierten Bilder).

## 7. Stand — Vorklinik

**Alle 15 Pilot-Fälle erstellt und live (2026-07-09).** Die alten 50
ungeprüften, blind generierten Fälle wurden vollständig ersetzt (nicht nur
ergänzt) — `public/cases/vorklinik.json` enthält jetzt ausschließlich die
15 neuen, quellenbasierten Fälle. Alle 15 durch Node-Strukturvalidierung
geprüft (Pflichtfelder, diagnosisOptions/differentialNotes 1:1, gültige
caseContext-/Flag-Werte) — alle bestanden.

| ID | Diagnose | GK1-Fach | Kategorie |
|---|---|---|---|
| `appendizitis-1` | Akute Appendizitis | Anatomie | Cannot-miss |
| `leistenhernie-1` | Indirekte Leistenhernie | Anatomie | Häufig |
| `radialisparese-1` | Sekundäre Radialisparese bei Humerusschaftfraktur | Anatomie | Häufig |
| `karpaltunnelsyndrom-1` | Karpaltunnelsyndrom | Anatomie | Häufig |
| `vkb-ruptur-1` | Vordere Kreuzbandruptur | Anatomie | Häufig |
| `diabetes-insipidus-1` | Zentraler Diabetes insipidus | Physiologie | Cannot-miss |
| `primaerer-hyperparathyreoidismus-1` | Primärer Hyperparathyreoidismus | Physiologie | Häufig |
| `myasthenia-gravis-1` | Myasthenia gravis | Physiologie | Häufig |
| `conn-syndrom-1` | Conn-Syndrom (primärer Hyperaldosteronismus) | Physiologie | Häufig |
| `asthma-exazerbation-1` | Status asthmaticus mit resp. Azidose | Physiologie | Cannot-miss |
| `gichtanfall-1` | Akuter Gichtanfall | Biochemie/Stoffwechsel | Häufig |
| `phenylketonurie-1` | Klassische Phenylketonurie | Biochemie/Stoffwechsel | Cannot-miss |
| `laktoseintoleranz-1` | Primäre Laktoseintoleranz | Biochemie/Stoffwechsel | Häufig |
| `g6pd-mangel-1` | G6PD-Mangel mit hämolytischer Krise | Biochemie/Stoffwechsel | Häufig |
| `ab0-transfusionsreaktion-1` | Akute hämolytische Transfusionsreaktion | Biochemie/Stoffwechsel | Cannot-miss |

Verteilung nach Achse 1 (Ziel 5/5/5): Anatomie 5, Physiologie 5,
Biochemie/Stoffwechsel 5 — erreicht.

Nebenbei: kleiner UI-Fix in `app/page.tsx` — Patientenalter wurde bislang
hart als „X Jahre" gerendert, was bei `phenylketonurie-1` (Neugeborenes,
`age: 0`) als „0 Jahre" angezeigt worden wäre. Jetzt zeigt `age === 0`
stattdessen „Neugeboren".

## 8. Nächste Schritte

- [x] 15 Kandidaten mit Sergio abgestimmt
- [x] Alle 15 Fälle geschrieben
- [x] Strukturvalidierung (Node-Skript, gleiches Prinzip wie bei Innere)
- [x] Alte 50 Fälle ersetzt (nicht aufgehoben — vollständig verworfen)
- [ ] Fälle in der laufenden App stichprobenartig durchspielen/gegenlesen
- [ ] Bei Bedarf Ausbau über die 15 hinaus (weitere GK1-Themen, siehe
      Abschnitt 1 — Physik, reine Biologie, Med. Psychologie/Soziologie
      bislang bewusst ausgeklammert)
