# BASICS_SCHEMA — Praxis-Basics / Famulatur-Prep

Authoritatives Schema für den **Basics-Modus** (Arbeitstitel „Famulatur-Prep").
Analog zu `docs/CASE_SCHEMA.md`, aber ein **eigener Content-Typ**: kein
Diagnose-Fall, sondern ein **sequenzielles Situations-Quiz**, das praktische
Stations-/OP-/Labor-Basics durch Entscheidungen vermittelt.

Kern-Idee: dieselbe Engine wie die Fälle (MCQ + Erklärung + Score), aber statt
„Befunde anfordern" eine **lineare Kette von Mikro-Entscheidungen**.

---

## 1. Progression: Tracks → Levels → Steps

Drei Hierarchie-Ebenen. Die vom Nutzer gewünschte Reihenfolge („von wenig
advanced bis ich stehe am Tisch") wird über **Levels** abgebildet.

- **Track** = ein Thema (z. B. `op-verhalten`, `blutentnahme`).
- **Level** = eine Stufe innerhalb des Tracks, **aufsteigend geordnet** über
  `level` (1 = Einstieg). Ein Level ist eine abgeschlossene Lern-Einheit
  (5–8 Steps) mit eigenem Score. Höhere Levels sollten idealerweise das
  vorherige voraussetzen (UI kann sie sperren, bis das vorige bestanden ist —
  `unlockAfter`).
- **Step** = eine einzelne Situation mit Entscheidung.

Datei pro Track: `public/basics/{track}.json`. Ein Track-Objekt enthält ein
Array `levels`.

---

## 2. Track-Objekt (Top-Level)

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|:---:|-----------|
| `track` | string | ✓ | Slug, eindeutig. z. B. `"op-verhalten"`. |
| `title` | string | ✓ | Anzeigename. z. B. `"Verhalten im OP"`. |
| `discipline` | string | ✓ | Grobkategorie für Filter/Nav. z. B. `"OP"`, `"Labor/Station"`. |
| `icon` | string | ✓ | Tabler-Icon-Klasse ohne Präfix. z. B. `"ti-scalpel"`. |
| `intro` | string | ✓ | 1–2 Sätze, worum es im Track geht. |
| `levels` | Level[] | ✓ | Aufsteigend nach `level`. |
| `reviewStatus` | string | ✓ | `"draft"` \| `"reviewed"` \| `"needs-legal-review"`. Nur `"reviewed"` geht live. |
| `sourceNotes` | string | ✓ | Woran orientiert (Leitlinie/Standard/Erfahrung). Für Reviewer. |

---

## 3. Level-Objekt

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|:---:|-----------|
| `level` | number | ✓ | Reihenfolge, 1-basiert. |
| `levelLabel` | string | ✓ | Kurzname der Stufe. z. B. `"Vor dem Saal"`, `"Am Tisch"`. |
| `subtitle` | string | ✓ | Ein Satz, was diese Stufe abdeckt. |
| `estMinutes` | number | ✓ | Grobe Dauer. |
| `unlockAfter` | number \| null | ✓ | `level`, das vorher bestanden sein muss. `null` = frei. |
| `steps` | Step[] | ✓ | 5–8 Steps. |
| `keyTakeaways` | string[] | ✓ | 2–4 Merksätze, am Level-Ende angezeigt. |

---

## 4. Step-Objekt — zwei Typen

Gemeinsame Felder:

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|:---:|-----------|
| `type` | string | ✓ | `"choice"` oder `"order"`. |
| `situation` | string | ✓ | Die Situation/Frage. Präsens, „Du …". |
| `explanation` | string | ✓ | Das **Warum** (die Regel dahinter). Immer angezeigt, egal ob richtig. |
| `ruleTag` | string | ✓ | Kurzes Label der Regel. z. B. `"Steriles Feld"`. |
| `image` | string \| null | ✓ | Optionaler Bild-/SVG-Slug. `null`, wenn kein Bild. |

### 4a. `type: "choice"` — Einfachauswahl

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|:---:|-----------|
| `options` | string[] | ✓ | 3–4 Optionen. |
| `correctIndex` | number | ✓ | Index der richtigen Option (0-basiert). |

### 4b. `type: "order"` — Sortieraufgabe (z. B. Röhrchen-Reihenfolge)

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|:---:|-----------|
| `items` | Item[] | ✓ | Zu sortierende Elemente (in beliebiger Ausgangsreihenfolge speicherbar; UI mischt). |
| `correctOrder` | number[] | ✓ | `items`-Indizes in **richtiger** Reihenfolge. |

`Item`: `{ "label": string, "hint": string \| null, "color": string \| null }`
— `color` optional als Farbpunkt (z. B. Röhrchenfarbe), **immer** mit Caveat
im `explanation`-Feld, weil Farben herstellerabhängig sind (s. u.).

Scoring einer Order-Aufgabe: richtig nur bei exakter Reihenfolge (v1 keine
Teilpunkte).

---

## 5. Scoring (Engine-seitig, nicht im Content)

- Pro Level: `richtige Steps / Steps gesamt`. Optional Streak-Bonus.
- Kein „Befund-Kosten"-Modell wie bei Fällen — Basics ist linear.
- Wiederholbar; Bestwert pro Level merken (localStorage, analog Fälle).

---

## 6. Inhaltliche Leitplanken (wichtig)

- **Präzise, aber ehrlich im Anspruch:** Basics lehrt *Entscheidungen und
  Normen*, **nicht Motorik**. Kein Text ersetzt das Üben am Modell/Patienten.
- **Hersteller-/Hausabhängigkeit offenlegen.** Röhrchenfarben (Sarstedt
  S-Monovette vs. BD Vacutainer), Haus-SOPs, Zuständigkeiten variieren. Lehre
  das **Prinzip** (z. B. *Reihenfolge* und *Grund*), nicht eine Farbe als
  Dogma. Farben nur mit „häufig, je nach System" kennzeichnen.
- **Rechtliches = Sonderfall.** Was ein Famulant darf/nicht darf variiert nach
  Bundesland, Klinik und Aufsicht und ändert sich. Solche Steps bekommen
  `reviewStatus: "needs-legal-review"` und gehen **nicht** ohne juristisch/
  klinische Prüfung live. Im Zweifel weglassen.
- **Review-Pflicht.** Jeder Track wird von einer/einem Kliniker:in geprüft,
  bevor `reviewStatus: "reviewed"`. Studis erkennen Fake-Ratschläge sofort.

---

## 7. Beispiel (gekürzt)

```json
{
  "track": "blutentnahme",
  "title": "Venöse Blutentnahme",
  "discipline": "Labor/Station",
  "icon": "ti-droplet",
  "intro": "Von der Vorbereitung bis zur richtigen Röhrchen-Reihenfolge.",
  "reviewStatus": "draft",
  "sourceNotes": "Orientiert an CLSI GP41 (order of draw); Farben je nach System.",
  "levels": [
    {
      "level": 3,
      "levelLabel": "Röhrchen-Reihenfolge",
      "subtitle": "Warum die Abnahmereihenfolge zählt.",
      "estMinutes": 4,
      "unlockAfter": 2,
      "steps": [
        {
          "type": "order",
          "situation": "Bring die Röhrchen in die empfohlene Abnahmereihenfolge.",
          "items": [
            { "label": "Blutkultur", "hint": "steril zuerst", "color": null },
            { "label": "Citrat (Gerinnung)", "hint": "Verhältnis kritisch", "color": null }
          ],
          "correctOrder": [0, 1],
          "explanation": "Reihenfolge verhindert Additiv-Verschleppung ...",
          "ruleTag": "Order of draw",
          "image": null
        }
      ],
      "keyTakeaways": ["Steril zuerst", "Citrat vor EDTA"]
    }
  ]
}
```

---

## 8. Wiring (später, nicht Teil dieses Docs)

- Loader analog `public/cases/*` → `public/basics/{track}.json`.
- Neue Route/Modus `/basics` + Linear-Stepper-Komponente (State: Level, Step,
  gewählt, Order-Anordnung). Order-Step braucht Drag-/Tap-to-reorder.
- Wiederverwenden: A/B/C-Options-Buttons, Result-/Feedback-Screen, StatPill,
  Header-Band.
