# Glaubwürdigkeits-/Vertrauens-Plan gegenüber Ärzten

Lebendes Dokument (analog zu `case-tracking.md`/`agenda.md`). Zweck: Ärzte,
Dozenten und andere fachlich kritische Beobachter sollen unsere Fälle als
seriös einstufen können — nicht nur "vertrau mir", sondern nachprüfbar.

## Fakten vs. Annahmen (Ausgangslage ehrlich benannt)

**Fakten:**
- Alle 26 Fälle (11 Innere, 15 Vorklinik) haben ein `sourceNotes`-Feld mit
  Quellenangaben (AWMF, ESC, RKI, Endocrine Society, BÄK, IMPP etc.) und ein
  `caseContext`-Feld mit Auswahlbegründung.
- **`sourceNotes` wird aktuell nirgends im UI angezeigt** — geprüft in
  `app/page.tsx`, das Feld existiert nur in der JSON. Die ganze Recherche-
  Arbeit ist für Nutzer/Kritiker unsichtbar.
- `caseContext.note` (1 Satz Auswahlbegründung) wird angezeigt, aber ohne
  Quellenverweis im UI selbst.
- Die Methodik (Anti-Giveaway-Prinzipien, Auswahl-Achsen, Quellendisziplin)
  ist nur in internen Docs (`case-tracking.md`, `vorklinik-case-tracking.md`)
  dokumentiert, nicht öffentlich.
- Sergio ist Medizinstudent (7. Semester), kein approbierter Arzt. Kein
  fachärztliches Review der Fälle hat bislang stattgefunden.
- Kein Feedback-/Fehlermelde-Mechanismus im Tool vorhanden (offener Punkt,
  bereits in `agenda.md` vermerkt), obwohl das Welcome-Modal um Feedback bittet.

**Annahmen (nicht belegt, zur Diskussion):**
- Ärzte/Dozenten sind primär Gatekeeper/Multiplikatoren, nicht Hauptnutzer —
  ihre Kritik trifft aber die Kernnutzergruppe (Medizinstudierende) indirekt,
  weil sie empfehlen oder abraten können.
- "Vermarktung" heißt hier eher Vertrauensaufbau bei einer fachlich kritischen
  Zielgruppe, nicht klassisches Paid-Marketing.

## Risiko, wenn nichts passiert

Ein Arzt/Dozent findet einen fachlich angreifbaren Punkt in einem Fall (bei
LLM-gestützter Erstellung nie ganz ausschließbar) — und findet **keine
sichtbare Quelle, keine Methodik-Erklärung, kein Review-Vermerk**. Das wirkt
dann wie unseriöse KI-Halluzination, selbst wenn die Recherche eigentlich
sauber war. Ohne sichtbare Transparenz ist die App im Kritikfall nicht
verteidigbar — die ganze bisherige Sorgfalt bringt nichts, wenn sie niemand
sehen kann.

## Plan — drei Phasen

### Phase 1: Transparenz im Produkt selbst (sofort, geringer Aufwand)

- `sourceNotes` im UI sichtbar machen — z. B. als aufklappbarer "Quellen"-
  Block im Result-Screen, gleiches Muster wie `caseContext`-Badge. Macht aus
  einem internen Dokufeld ein Vertrauenssignal für jeden, der genau hinschaut.
- Öffentliche "Methodik"-Seite (oder Unterseite/Footer-Link): erklärt in
  einfachen Worten die Quellendisziplin (AWMF/ESC/RKI/IMPP/Onkopedia, explizit
  kein Amboss/UpToDate), die Anti-Giveaway-Prinzipien und die Auswahl-Logik
  (IMPP-Blueprint für Klinik, GK1-Anwendungsbeispiele für Vorklinik). Inhalt
  existiert bereits in `case-tracking.md`/`vorklinik-case-tracking.md`, muss
  nur für ein externes Publikum umformuliert werden.
- Transparente "Über"-Seite: Sergio als Medizinstudent im 7. Semester, klar
  benannt — das ist ehrlich ein Vertrauensfaktor (Peer-Perspektive statt
  anonymer Firma), aber nur, wenn direkt daneben steht, dass kein
  fachärztliches Review stattgefunden hat. Verschweigen wäre riskanter als
  offen zu benennen.

### Phase 2: Externe Absicherung (mittelfristig, vor breiterer Bewerbung)

- **Kritischster Punkt:** Stichprobenartiges Review durch mindestens einen
  Assistenz- oder Facharzt, bevor aktiv um ärztliche Aufmerksamkeit geworben
  wird. Quellenangaben ersetzen kein fachliches Review — sie zeigen nur, dass
  sauber recherchiert wurde, nicht, dass nichts übersehen wurde. Realistischer
  Weg: Kommilitonen im PJ/Assistenzarztjahr, Dozentenkontakte aus dem Studium.
- Feedback-/Fehlermelde-Funktion im Tool selbst nachrüsten (siehe
  `agenda.md`) — kostengünstiger Zwischenschritt zum vollen Review, gibt
  Kritikern einen direkten, sichtbaren Kanal statt stiller Frustration.
- Expliziter Disclaimer im Tool: KI-gestützt erstellt, quellenbasiert
  recherchiert, kein Ersatz für Leitlinien/Lehrbücher. Diese Offenheit von
  Anfang an ist besser, als später als "versteckte KI" enttarnt zu werden.

### Phase 3: Aktive Ansprache (nach Phase 1+2, nicht vorher)

- Zielgruppen trennen: Medizinstudierende (Nutzer) wollen "macht Spaß, hilft
  fürs Examen"; Ärzte/Dozenten (Kritiker/Multiplikatoren) wollen "ist das
  medizinisch vertretbar, wer steht dafür gerade". Zwei unterschiedliche
  Botschaften, nicht eine.
- Konkrete Kanäle: Fachschaft, Uni-interne Kanäle, ggf. gezielter Kontakt zu
  1–2 Ärzten für Direktfeedback, bevor öffentlich (z. B. LinkedIn) beworben
  wird — Reihenfolge wichtig, nicht umgekehrt.

## Risiken des Plans selbst

- Methodik-Seite + Review-Prozess kosten Zeit, die sonst in mehr Fälle
  fließen würde — Priorisierungsentscheidung, kein Nice-to-have nebenbei.
- Ein echtes fachärztliches Review kann Fehler aufdecken. Unangenehm, aber
  deutlich besser jetzt intern als später öffentlich.
- Ohne Review bleibt jede Transparenz-Maßnahme nur "wir haben sauber
  recherchiert", nicht "das wurde geprüft" — beides ist nicht dasselbe
  Vertrauensniveau, sollte nicht vermischt beworben werden.

## Empfehlung (Reihenfolge)

1. Phase 1 zuerst umsetzen (`sourceNotes` sichtbar, Methodik-Seite) — kleiner
   Aufwand, sofort wirksam, kein Abhängigkeit von Dritten.
2. Vor jeder aktiven Bewerbung bei Ärzten: mindestens ein echtes Review
   organisieren. Ohne das ist Phase 3 verfrüht.
3. Feedback-Mechanismus nicht aufschieben — er ist gleichzeitig
   Vertrauenssignal und Frühwarnsystem für genau die Fehler, die sonst erst
   durch öffentliche Kritik auffallen.
