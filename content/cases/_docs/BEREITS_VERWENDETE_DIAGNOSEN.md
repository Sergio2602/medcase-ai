---
name: bereits-verwendete-diagnosen
description: Liste bereits verwendeter v3-Diagnosen, strukturiert nach Schwierigkeitslevel (Häufigkeit × Erkennbarkeit) — Basis für den Bestandsaufnahme-Schritt im Fallerstellungs-Chat. Enthält bewusst NICHT die alten 70 Legacy-Fälle (werden laut ROADMAP.md Punkt 13 komplett gelöscht).
---

# Bereits verwendete Diagnosen (v3-Workflow)

**Wichtig (unverändert seit 21.09.):** Diese Liste enthält bewusst NICHT die alten 70
Legacy-Fälle (`content/cases/{innere,pj,vorklinik}.json`) — die werden laut ROADMAP.md
Punkt 13 komplett gelöscht, nicht weitergeführt. Referenzpunkt ist ausschließlich der neue
v3-Fallbestand.

**Regel: keine exakte/sinngleiche Diagnose-Dopplung** innerhalb der gesamten v3-Bank,
unabhängig von Level/Disziplin.

**Struktur (Update 30.09.):** Nach Schwierigkeitslevel sortiert (siehe CASE_SCHEMA_V3.md,
Abschnitt "Niveau, Häufigkeit, Cannot-miss"), damit der Fallerstellungs-Chat in Schritt 0 den
aktuellen Stand pro Kategorie einfach durch Abzählen nennen kann.

**Ablage (Update 30.09.):** Liegt lokal im Repo unter `content/cases/_docs/`, wie die
Fallakten — NICHT als claude.ai-Projekt-Doc (dort nur die Prompts, siehe
`claude/FALLGENERIERUNG_V3_PROMPTS.md` im Casolvo-V2-Projekt).

**Aktualisierung:** Sobald ein neuer v3-Fall Sergios finale Freigabe (`verify.humanApproved:
true`) erreicht, wird seine Diagnose hier in der passenden Kategorie ergänzt. Da das separate
Fallgenerierungs-Projekt (anderes claude.ai-Konto/-Projekt) diese Datei nicht direkt aus dem
Repo lesen kann, muss die aktuelle Version nach jeder Änderung weiterhin manuell dort als
Projekt-Wissen hochgeladen werden.

## Übersicht (aktueller Stand)

- Med-Student — häufig, leicht zu erkennen: **1**
- Assistenzarzt — häufig, schwer zu erkennen: **0**
- Assistenzarzt — selten, leicht zu erkennen: **0**
- Facharzt — selten, schwer zu erkennen: **0**
- davon Cannot-miss (beliebiges Level): **1**

## Med-Student — häufig, leicht zu erkennen

- Diabetische Ketoazidose (Innere, Cannot-miss: ja, freigegeben: 2026-09-30) [innere-klinik-0001]

## Assistenzarzt — häufig, schwer zu erkennen

(noch keine)

## Assistenzarzt — selten, leicht zu erkennen

(noch keine)

## Facharzt — selten, schwer zu erkennen

(noch keine)

---

Format je Eintrag, sobald befüllt:
`- <Diagnose> (Disziplin, Cannot-miss: ja/nein, freigegeben: <Datum>)`
