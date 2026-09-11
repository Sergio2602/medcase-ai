# Übergabe-Briefing: Rechtssichere Fallgenerierung v2 (Casolvo)

**Stand:** 08.09.2026 · **Quelle:** Legal-Audit-Chat (Phase 0 + 1 abgeschlossen)
**Zweck:** Vollständiger Kontext für einen neuen Chat, der (a) das Generierungsskript v2 baut und (b) die Bildstrategie entscheidet.
**Wichtig:** Alles hier ist Einschätzung, keine Rechtsberatung. Verbindliche Klärung durch Fachanwalt vor Kommerzialisierung.

---

## 1. Ausgangslage — drei Annahmen, die falsch waren

Der ursprüngliche Legal-Audit-Master-Prompt enthielt drei Fehlannahmen. Sie sind korrigiert; der neue Chat darf sie nicht wieder einführen.

**(a) Es gibt keine Laufzeit-KI-Generierung mehr.**
`app/api/generate-case/route.ts` ruft Anthropic **nicht** mehr auf. Die Route liest nur statisches JSON aus `public/cases/`, wählt zufällig einen Fall, mit CORS-Allowlist und In-Memory-Rate-Limit (60/min/IP). Kein `topic`-Parameter mehr, nur `difficulty`. Commit `24185a8` (03.09.2026).
→ Keine Nutzereingaben gehen an Anthropic. Keine unkontrollierten Live-Fälle. Der „offene Laufzeit-Endpunkt" ist **kein** Risiko mehr.

**(b) `sourceNotes` taugt nicht als Herkunfts-Indiz.**
Alle 95 Fälle (70 live + 25 Staging) haben gefüllte `sourceNotes`. Die Unterscheidung „grounded = sourceNotes vorhanden" existiert nicht.

**(c) Das Grounding-Skript hat die Live-Bank nicht erzeugt.**
`scripts/generate-reviewed-cases.ts` ist **nicht in Git getrackt**, enthält nur eine 10-Fall-Pilotliste und schreibt nach `innere-reviewed.json` / `vorklinik-reviewed.json` — beide Dateien **existieren nicht**. Die Overlay-Logik in route.ts ist toter Code.

Woher die 70 Fälle wirklich stammen, sagt route.ts selbst: *„content is authored offline (Claude/Claude Code chat, added to these files by hand)"*.

---

## 2. Der zentrale Befund: keine Prozess-Beweiskette

Git belegt die Chronologie sauber:

| Datum | Ereignis |
|---|---|
| 15.06.2026 | 140 Fälle via `generate-cases.ts` — ungegroundet, reines Modellwissen |
| 30.06.2026 | +30 Innere-Fälle, Herkunft unklar |
| 09.07.2026 | „Rebuild Innere case bank (11 sourced cases)" — Bruch |
| 09.07.2026 | Vorklinik neu (15) |
| 11.07.2026 | Examen/PJ ersetzt: 15 neue statt 40 ungeprüfte |
| 13.07.2026 | +15 Allgemeinmedizin, +14 Innere → innere.json = 40 |

11 + 15 + 14 = 40. **Alle 70 Live-Fälle stammen aus der Post-Rebuild-Phase** — kein ungegroundeter Altfall ist mehr live. Gut. Aber:

Für **keinen einzigen** Live-Fall existiert:
- Prompt-Version oder -Hash
- Modellversion zum Erzeugungszeitpunkt
- Protokoll der tatsächlich abgerufenen Quellen (URL, Datum, Abschnitt)
- Trennung „recherchiert" vs. „aus Modellwissen ergänzt"
- dokumentierte menschliche Eigenleistung

**Doppelte Folge:** Im Streitfall gibt es nichts vorzulegen. Und es fehlt der Nachweis der „wesentlichen Investition" für ein eigenes Datenbankherstellerrecht (§ 87a UrhG) — die einzige realistische eigene Schutzposition, weil KI-generierte Texte mangels menschlicher Schöpfung voraussichtlich **nicht** urheberrechtlich geschützt sind (§ 2 Abs. 2 UrhG).

Nebenbefund: `sourceNotes` ist unstrukturierter Fließtext. Ein Teil nennt AWMF-Registernummern (053-013, 043-044), ein Teil nur Fachgesellschaften (DGVS, DGK, DGN, DGGG, DEGAM), ein Teil vermerkt ehrlich „keine belastbare Leitlinie" oder Herleitung „aus allgemeiner kardiologischer Physiologie". Zusätzlich genannt werden Springer, MSD Manual, Deximed, GPnotebook — also **nicht nur** die beworbenen Primärquellen.

---

## 3. Rechtliche Kernlogik — das Drei-Schichten-Modell

Die entscheidende Frage ist nicht *ob Quellen genutzt wurden*, sondern **ob geschützter Ausdruck im Output gelandet ist**.

| Schicht | Beispiel | Geschützt? |
|---|---|---|
| **Fakt** | Anti-tTG-IgA bei Zöliakie erhöht; NT-proBNP < 125 pg/ml schließt chron. HI aus; Marsh-Klassifikation existiert | **Nein.** Frei, auch kommerziell, auch ohne Quellenangabe. „Die wissenschaftliche Lehre ist frei" (st. Rspr. BGH). |
| **Ausdruck** | Der Satz der Leitlinie; ihre Tabelle; ihre Algorithmus-Grafik; Auswahl + Anordnung einer Kriteriensammlung | **Ja.** §§ 2, 4 UrhG. Auch enge Paraphrase (§ 23 UrhG). |
| **Fallgestaltung** | Ein *veröffentlichter* Case Report: Patientenkonstellation, Symptomabfolge, Wendepunkt, Distraktoren | **Ja**, wenn individuell gestaltet. Ein *neu erfundener* Patient ist unser. |

**Merksatz für den neuen Chat:**
> Ein Fall, der aus **Fakten** neu konstruiert wird — erfundener Patient, selbst gewürfelte Demografie, selbst gerechnete Laborwerte, eigene Formulierung — verletzt kein Urheberrecht, egal wie viele geschützte Leitlinien dafür gelesen wurden. Lesen ist frei. Übernehmen nicht.

**Zwei häufige Irrtümer:**
- „Ungeschützte Quellen suchen" ist die falsche Achse. Es gibt praktisch keine brauchbaren (§ 5 UrhG deckt nur Gesetze/amtliche Erlasse — medizinisch wertlos). Richtig ist: exzellente, geschützte Quellen nutzen, aber **nur Schicht 1** entnehmen.
- Quellenangabe heilt nichts. § 51 UrhG (Zitat) verlangt einen Zitatzweck; §§ 60a ff. (Unterricht/Wissenschaft) tragen kein kommerzielles B2C-Produkt.

**Risikoleiter, nach Erwartungsschaden:**
1. Wörtliche/eng paraphrasierte Übernahme aus Leitlinientexten — vollständig kontrollierbar (Architektur unten).
2. Reproduktion einer echten IMPP-Prüfungsfrage — IMPP verfolgt das aktiv. *Der Gegenstandskatalog als Themenliste ist eine Idee und frei*; die konkrete Frage nicht.
3. **Unbewusste Reproduktion trainierter Inhalte** (Amboss, Thieme, Case Reports) — nicht auf null reduzierbar, nur auf „vernachlässigbar + detektierbar + vertraglich abgesichert". Das ist das eigentliche Ziel der Architektur.
4. Übernahme von Tabellen/Referenzwertsammlungen — §§ 87a ff. UrhG, unabhängig vom Urheberrecht.
5. Lizenzbruch bei **CC-BY-NC**-Quellen im kommerziellen Betrieb.

**Wichtig:** Der Unterlassungsanspruch ist verschuldensunabhängig. Guter Glaube schützt nur vor Schadensersatz (§ 97 Abs. 2 UrhG), nicht vor Abmahnung. Deshalb ist **Detektion vor Veröffentlichung** wichtiger als guter Glaube.

**Vertraglicher Hebel — hohe Priorität:**
Anthropic gewährt API-Kunden unter den **Commercial Terms** eine erweiterte Copyright-Indemnification (Verteidigung + Zahlung genehmigter Vergleiche/Urteile bei autorisierter Nutzung der Dienste und ihrer Outputs). Für Claude-Pro-/Chat-Nutzung ist das nicht ausgewiesen. Die bisherigen 70 Fälle entstanden im **Chat** — also außerhalb dieser Absicherung. Fälle über die **API** stehen darin.
→ *Zu verifizieren durch den neuen Chat:* Volltext der Commercial Terms, konkrete Ausschlüsse, und ob die Nutzung des gehosteten `web_search`-Tools erfasst ist.

---

## 4. Entscheidung: Fallbank wird komplett neu erzeugt

**Begründung (nicht: „die alten Fälle sind rechtswidrig" — das ist unbelegt):**
1. Der Prozess ist nicht rekonstruierbar → nicht verteidigbar, unabhängig von der Sauberkeit.
2. Entstanden außerhalb der Anthropic-Indemnification.
3. Keine wahre Werbeaussage möglich („quellenbasiert" ist mit Chat-Historie nicht belegbar).
4. Neuerzeugung ist billig: 70 Fälle × ~1 Sonnet-Call mit Websuche. Schätzung mittlerer zweistelliger Euro-Betrag + ein Wochenende Review.

**Reihenfolge ist zwingend — nicht zuerst löschen:**
> Pipeline bauen → 3 Testfälle → Detektion validieren → 70 Fälle neu erzeugen → Review → neue Bank live → **dann** alte Bank löschen.

Bis dahin bleiben die 70 online (seit Juli öffentlich; zwei weitere Wochen ändern das Risiko nicht, und die Retention-Daten der Validierungsphase gehen sonst verloren).

---

## 5. Spezifikation Pipeline v2

Sieben Stufen. Jede ist ein juristisch wirksamer Schnitt, nicht nur Qualitätssicherung.

**Stufe 0 — Themenauswahl durch Sergio, nicht durch das Modell.**
Diagnose, Setting, Lernziel, Schwierigkeitsgrad, Kategorie (`haeufig` / `cannot-miss`) werden in `data/case-topics.json` von Hand gepflegt. Orientierung an IMPP-Blueprint/GK als **Ideenquelle** (zulässig). Das ist der dokumentierte menschliche Schöpfungsbeitrag.

**Stufe 1 — Faktenextraktion, isoliert.**
Eigener API-Call. Einziger erlaubter Output: strukturiertes Faktenblatt.
Prompt-Regeln, hart:
- nur Stichpunkte, **keine** zusammenhängende Prosa
- keine Passage länger als ~12 Wörter aus einer Quelle
- keine Tabellen- oder Grafikübernahme
- jede Zeile mit URL + Abrufdatum
- Modellwissen ausdrücklich als `modelKnowledge: true` markieren
- bei fehlender Quelle: Unsicherheit vermerken, **keine Zahl erfinden**

**Stufe 2 — Fallkonstruktion in frischem Kontext.**
Zweiter Call. Die Quelltexte sind **nicht** mehr im Kontext — nur das Faktenblatt aus Stufe 1.
→ Wirksamster Einzelschritt: der Pfad, über den geschützter Ausdruck fließen könnte, ist physisch gekappt. Was nicht im Kontext ist, kann nicht kopiert werden.

**Stufe 3 — Patient und Zahlen kommen von uns, nicht vom Modell.**
- Alter, Geschlecht, Komorbiditäten aus eigenem Randomizer (`scripts/lib/patient.ts`), Seed gespeichert.
- Laborwerte aus eigenem Skript (`scripts/lib/labs.ts`), das aus `data/reference-ranges.json` plus einem diagnosespezifischen Abweichungsprofil würfelt.
Drei Effekte: keine Ähnlichkeit zu publizierten Fällen; die Referenzwerttabelle ist **unsere eigene Zusammenstellung** statt einer übernommenen Datenbank; die häufigste medizinische Fehlerquelle (inkonsistente Werte) ist systematisch behoben.

**Stufe 4 — Automatisierte Detektion vor Veröffentlichung.**
n-Gramm-Phrasensuche (gleitendes Fenster, 8–10 Wörter) über alle Freitextfelder gegen eine Websuche. Jeder wörtliche Treffer = Flag = Neuformulierung. Ergebnis wird im Provenienz-Record gespeichert.
→ Das ist gleichzeitig das **Beweismittel**: belegt, dass jeder Fall vor Veröffentlichung geprüft wurde.

**Stufe 5 — Dokumentiertes menschliches Review.**
Sergio liest, korrigiert, gibt frei. Änderungen werden als Diff gespeichert.
Drei Effekte: medizinische Qualität; Nachweis der Eigenleistung; **Ausnahme von der Kennzeichnungspflicht nach Art. 50 Abs. 4 UAbs. 2 KI-VO** (entfällt bei menschlicher Überprüfung / redaktioneller Kontrolle mit benannter verantwortlicher Person).

**Stufe 6 — Strukturierter Provenienz-Record** (Schema unten).

**Stufe 7 — API statt Chat.** Generierung ausschließlich über die Anthropic API unter Commercial Terms.

### Dateistruktur

```
data/
  case-topics.json          # Stufe 0, von Hand gepflegt
  reference-ranges.json     # eigene Referenzwert-Zusammenstellung
scripts/
  lib/provenance.ts         # Record-Typ + Writer
  lib/factsheet.ts          # Stufe 1
  lib/construct.ts          # Stufe 2
  lib/patient.ts            # Stufe 3 Demografie
  lib/labs.ts               # Stufe 3 Laborwerte
  lib/detect.ts             # Stufe 4
  prompts/                  # versionierte Prompt-Dateien, gehasht
  generate-case-v2.ts       # Orchestrierung
provenance/<caseId>.json    # ein Record pro Fall, in Git
public/cases/v2/*.json      # neue Bank
```

**Alles in Git.** Der Hauptfehler der v1 war ein ungetracktes Skript.

---

## 6. Provenienz-Record — Schema

Ein Objekt pro Fall, versioniert in Git. Ersetzt den Fließtext-`sourceNotes`.

```jsonc
{
  "caseId": "zoeliakie-9",
  "schemaVersion": "2.0",
  "createdAt": "2026-09-15T10:22:00Z",
  "generator": {
    "script": "generate-case-v2.ts",
    "scriptGitSha": "abc1234",
    "model": "claude-sonnet-4-6",
    "apiTier": "commercial",
    "promptFactsheet": { "file": "prompts/factsheet.v3.md", "sha256": "..." },
    "promptConstruct": { "file": "prompts/construct.v3.md", "sha256": "..." },
    "seeds": { "patient": 481923, "labs": 77120 }
  },
  "topic": {
    "diagnosis": "Zöliakie",
    "difficulty": "klinik",
    "category": "haeufig",
    "selectedBy": "human",
    "rationale": "IMPP-Blueprint Achse Verdauungssystem, hohe Prävalenz"
  },
  "sources": [
    {
      "id": "s1",
      "type": "guideline",
      "title": "S2k-Leitlinie Zöliakie",
      "publisher": "DGVS",
      "identifier": "AWMF-Register-Nr. 021-021",
      "url": "https://register.awmf.org/...",
      "retrievedAt": "2026-09-15T10:20:11Z",
      "license": "unverified",
      "licenseNote": "Rechte bei DGVS; nur Faktenentnahme",
      "archived": { "method": "pdf", "path": "provenance/archive/s1.pdf" },
      "usedFor": ["diagnosticCriteria", "labParameters"]
    }
  ],
  "modelKnowledge": [
    { "claim": "typische Altersverteilung zweigipflig", "confidence": "high", "noSourceFound": true }
  ],
  "componentAttribution": {
    "history": "constructed",
    "examination": "constructed",
    "labs": "computed",
    "imaging": "constructed",
    "diagnosisOptions": "constructed",
    "explanation": "constructed",
    "differentialNotes": "constructed",
    "keyTakeaway": "constructed"
  },
  "detection": {
    "runAt": "2026-09-15T10:25:00Z",
    "method": "ngram-websearch",
    "ngramSize": 9,
    "fieldsChecked": ["history", "examination", "imaging", "explanation", "differentialNotes", "keyTakeaway"],
    "hits": [],
    "verdict": "clean"
  },
  "review": {
    "status": "approved",
    "reviewedBy": "Sergio Jacinto Hein",
    "reviewedAt": "2026-09-16T18:00:00Z",
    "editorialResponsibility": true,
    "edits": [{ "field": "labs", "note": "Ferritin von 8 auf 6 µg/l korrigiert" }]
  },
  "riskClass": "GRUEN",
  "release": { "approved": true, "approvedAt": "2026-09-16T18:05:00Z" }
}
```

**Warum jedes Feld:** `generator` + `seeds` = Reproduzierbarkeit. `sources` + `archived` = Verteidigung gegen Übernahmevorwurf. `modelKnowledge` = Ehrlichkeit statt erfundener Quellen. `componentAttribution` = Zuordnung Quelle → Bestandteil. `detection` = Beweis der Vorabprüfung. `review.editorialResponsibility` = Art. 50 KI-VO. Alles zusammen = Nachweis der wesentlichen Investition für § 87a UrhG.

### Quellenhierarchie für Stufe 1

| Stufe | Quellen | Nutzung |
|---|---|---|
| **Frei, auch im Ausdruck** | Gesetze/Verordnungen (§ 5 UrhG), CC0, CC-BY (mit Namensnennung) | volle Nutzung möglich |
| **Nur als Faktenquelle** | AWMF, ESC, DGVS/DGK/DGN, RKI, Onkopedia, PubMed, leitlinien.de, Destatis | lesen, Fakten entnehmen, nie Ausdruck übernehmen |
| **Nur als Faktenquelle, nicht bewerben** | Springer, MSD Manual, Deximed, GPnotebook, Lehrbücher | dito — aber nicht als „Primärquelle" auf der Website nennen |
| **Vermeiden** | CC-BY-**NC** (schließt kommerzielle Nutzung aus), CC-**ND** | nicht verwenden |
| **Nicht verwenden** | Amboss, UpToDate (Login + Vertragsbindung), IMPP-Prüfungsfragen, veröffentlichte Case Reports als Fallvorlage | gesperrt |

Domain-Allowlist erweitern um: `dgvs.de`, `dgn.org`, `escardio.org`, `destatis.de`, `awmf.org` (bereits), `pmc.ncbi.nlm.nih.gov`.

---

## 7. Zur Diskussion: Bilder in den Fällen

Sergio erwägt ein zusätzliches Abo (z. B. ChatGPT) für generierte Bilder zu körperlicher Untersuchung, Bildgebung o. Ä. **Meine Einschätzung: das ist die falsche Lösung — aber die richtige Frage.** Der neue Chat soll das durchdiskutieren; hier die Ausgangsposition.

**Drei Bildarten, drei völlig verschiedene Antworten:**

**(a) EKG, Kurven, Vitalparameter-Verläufe → selbst rendern. Klare Empfehlung.**
Ein EKG ist ein Signal, kein Bild. Ein Generator, der aus Parametern (Frequenz, Lagetyp, PQ/QRS/QT, ST-Hebung je Ableitung, Rhythmus) ein SVG rendert, ist:
- zu 100 % unser eigenes Werk → volles Urheberrecht, kein Fremdrisiko
- medizinisch exakt kontrollierbar (kein Halluzinationsrisiko)
- kostenlos und unendlich variierbar
- perfekt konsistent mit den in Stufe 3 gewürfelten Laborwerten

Das ist der größte didaktische Zugewinn pro investiertem Euro im ganzen Produkt. Aufwand-Schätzung: 3–5 Tage für einen brauchbaren 12-Kanal-Renderer.

**(b) Radiologie und Dermatologie → generative KI ist medizinisch inakzeptabel.**
Ein generiertes Röntgenbild hat halluzinierte Anatomie: falsche Rippenzahl, unmögliche Herzsilhouette, erfundene Verschattungsmuster. Studierende trainieren dann auf Mustern, die es nicht gibt. Das ist ein **medizinisches Qualitätsproblem, das direkt zum Haftungsproblem wird** — und es zerstört genau die Glaubwürdigkeit, die das Produkt aufbauen soll. Zusätzlich: ein generiertes Bild ist mangels menschlicher Schöpfung vermutlich nicht schutzfähig, und die Trainingsdaten-Reproduktion ist bei Bildern schlechter detektierbar als bei Text.

Richtiger Weg: **kuratierte Realbilder unter CC-BY oder CC0** (PMC Open Access Subset, Wikimedia Commons), mit gespeicherter Lizenz, Urheberangabe und Abrufdatum im Provenienz-Record. Zwingend: **CC-BY-NC und CC-ND ausschließen** — NC verbietet die kommerzielle Nutzung, und Casolvo soll kommerziell werden. Bei Realbildern von Patienten zusätzlich prüfen, dass der Publisher die Einwilligung dokumentiert hat (Art. 9 DSGVO, Persönlichkeitsrecht).

**(c) Illustration (Patientenavatar, Szene, Icons) → generative KI ist hier unproblematisch.**
Kein medizinischer Informationsgehalt, kein Haftungsrisiko, keine Reproduktionsgefahr für Fachinhalte. Falls überhaupt gewünscht.

**Zum Abo konkret:** Ein ChatGPT-Plus-Abo löst (a) nicht (Renderer ist besser), löst (b) nicht (medizinisch unbrauchbar) und ist für (c) Overkill. **Empfehlung: kein zusätzliches Abo.** Wenn generative Bilder je gebraucht werden, dann über eine API unter kommerziellen Bedingungen mit geklärter Rechtelage — nicht über ein Consumer-Abo. *Nicht verifiziert:* die genaue Rechte- und Indemnification-Lage bei OpenAI-Bildoutputs; der neue Chat soll das prüfen, falls die Option weiterverfolgt wird.

**MDR-Hinweis:** Bilder zum Interpretieren bleiben Lernsoftware, kein Medizinprodukt — solange die Zweckbestimmung Lernen ist. Formulierungen wie „Befundung", „Diagnoseunterstützung" oder „klinische Entscheidungshilfe" strikt vermeiden, auch im späteren B2B-Vertrieb an Kliniken/Unis.

---

## 8. Sofortmaßnahmen — unabhängig von der Pipeline, höhere Priorität

Diese vier Punkte sind **billiger und wirksamer** als die gesamte Neuerzeugung. Ein Wettbewerber oder eine Aufsichtsbehörde weist sie in fünf Minuten nach; einen Paraphrasenvorwurf nicht.

1. **„100 % quellenbasiert" von der Startseite entfernen** (`app/page.tsx:920`). Wird durch die eigenen `sourceNotes` widerlegt. § 5 UWG. Ersatz z. B. „Jeder Fall mit dokumentierter Quellenlage". Ebenso „70+ Fälle" (es sind exakt 70) und „Nur Primärquellen: AWMF, ESC, RKI, Onkopedia, IMPP, PubMed" (unvollständig — Springer/MSD/Deximed fehlen).
2. **PostHog in die Datenschutzerklärung aufnehmen.** PostHog läuft (`lib/analytics.ts`, EU-Cloud, `persistence: "localStorage"`), wird in der Datenschutzerklärung **nirgends genannt**, und die Erklärung behauptet „ausschließlich technisch notwendige Cookies … keine Tracking-Cookies". Der Code-Kommentar *„localStorage → kein Consent-Banner nötig"* ist rechtlich falsch: **§ 25 TDDDG ist technologieneutral** und erfasst Speichern in und Zugriff auf die Endeinrichtung, nicht nur Cookies; Reichweitenmessung ist nach Auffassung der Aufsichtsbehörden nicht „unbedingt erforderlich". → Consent-Lösung oder Analytics vorübergehend deaktivieren.
3. **Warteliste**: `WaitlistSignup.tsx` erhebt E-Mail-Adressen ohne Einwilligungs-Checkbox, ohne Datenschutzhinweis am Formular, ohne Double-Opt-in, ohne Löschfrist. Art. 6/7/13 DSGVO; beim Launch-Mailing zusätzlich § 7 Abs. 2 Nr. 2 UWG.
4. **Discord**: Die Datenschutzerklärung behauptet „keine personenbezogenen Daten" — übertragen werden aber Freitextfelder (`reason`, `anmerkung`, `freitext`). Drittlandtransfer USA ohne genannte Rechtsgrundlage (Art. 44 ff.). Positiv: serverseitiger Aufruf, die Nutzer-IP erreicht Discord nicht.

Weiter offen: `casolvo.de` / `.com` sind **nicht registriert** (~20 €/Jahr, Risiko sonst unbegrenzt). Branding-Altlasten „Medcase" in Impressum-Titel, Datenschutz-Titel, Footer, localStorage-Keys, Kontaktadresse, Deploy-Domain — Kollisionsrisiko mit der Istanbuler App „MedCase – Medical Simulation" besteht live weiter. `REVIEW_ACCESS_KEY` schützt `/review` nur, wenn in Vercel gesetzt (`if (REVIEW_ACCESS_KEY && ...)`) — verifizieren.

---

## 9. Was der neue Chat NICHT tun soll

- **Nicht die alte Bank löschen**, bevor die neue live ist.
- **Nicht** die Behauptung übernehmen, die 70 Fälle seien rechtswidrig — das ist unbelegt.
- **Nicht** von einer Laufzeit-KI-Generierung ausgehen (existiert nicht mehr).
- **Nicht** nach „urheberrechtsfreien medizinischen Quellen" suchen — falsche Achse.
- **Nicht** Quellen wörtlich zitieren lassen und das mit einer Quellenangabe für geheilt halten.
- **Nicht** die vorhandene § 25-TDDDG-Analyse in `claude/hero-erstbesucher-wiederkehrer.md` ungeprüft übernehmen.

## 10. Offene Fragen an Sergio

1. Ist `REVIEW_ACCESS_KEY` in Vercel gesetzt?
2. Bestehen AVVs mit PostHog, Upstash, Vercel? Läuft der Anthropic-Key unter Consumer- oder Commercial Terms?
3. Sollen die 25 Staging-Fälle (`innere-pilot-staging.json`, `innere-batch2-staging.json`) live gehen oder entfallen?
4. Budget und Zeitfenster für die Neuerzeugung?
