import Link from "next/link";
import { KontaktPopover } from "@/app/components/KontaktPopover";
import { CenteredNav } from "@/app/components/CenteredNav";
import { FadeInUp } from "@/app/components/FadeInUp";

export const metadata = {
  title: "Über uns & Methodik — Medcase",
  description:
    "Wer hinter Medcase steht, wie Fälle recherchiert werden und woran sich die Auswahl orientiert.",
};

function SectionLabel({ icon, id, children }: { icon: string; id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mb-3 scroll-mt-24 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
      <i className={`ti ${icon} text-sm`} />
      {children}
    </p>
  );
}

function Divider() {
  return <div className="mb-6 h-px bg-card-border/10" />;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  );
}

// Ein Balken für die IMPP-Blueprint-Prozentbereiche — dieselbe visuelle
// Sprache wie die Trefferquote-Balken auf /statistik (Konsistenz).
function RangeBar({ label, min, max, max100 = 30 }: { label: string; min: number; max: number; max100?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[188px] shrink-0 text-[13px] font-semibold text-foreground/85">{label}</span>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-card-border/10">
        <div
          className="absolute h-full rounded-full bg-accent/70"
          style={{ left: `${(min / max100) * 100}%`, width: `${((max - min) / max100) * 100}%` }}
        />
      </div>
      <span className="w-[64px] shrink-0 text-right text-[13px] font-bold text-accent">
        {min}–{max}%
      </span>
    </div>
  );
}

function StepChip({ n, icon, title, text }: { n: number; icon: string; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border-[1.5px] border-card-border/10 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecf0f9] text-accent">
        <i className={`ti ${icon} text-[15px]`} />
      </div>
      <div>
        <p className="mb-0.5 text-[13px] font-bold text-foreground">
          {n}. {title}
        </p>
        <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

const TOC = [
  {
    id: "ueber-medcase",
    label: "Über Medcase",
    items: [
      { id: "team-hintergrund", label: "Team & Hintergrund" },
      { id: "wie-ein-fall-entsteht", label: "Wie ein Fall entsteht" },
    ],
  },
  {
    id: "fallauswahl",
    label: "Fallauswahl",
    items: [
      { id: "impp-haeufigkeit", label: "IMPP-Häufigkeit" },
      { id: "cannot-miss", label: "Cannot-miss" },
    ],
  },
  {
    id: "qualitaet",
    label: "Qualität",
    items: [
      { id: "arbeitsaufwand", label: "Arbeitsaufwand" },
      { id: "qualitaetssicherung", label: "Qualitätssicherung" },
    ],
  },
];

function TocSidebar() {
  return (
    <nav className="hidden lg:block">
      <div className="sticky top-6 flex flex-col gap-5">
        {TOC.map((group) => (
          <div key={group.id}>
            <a
              href={`#${group.id}`}
              className="mb-2 block text-xs font-bold uppercase tracking-wide text-foreground hover:text-accent"
            >
              {group.label}
            </a>
            <ul className="flex flex-col gap-0.5 border-l-[1.5px] border-card-border/10 pl-3">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block rounded-md py-1 text-[13px] leading-snug text-muted transition-colors hover:text-accent"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

export default function UeberUnsPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1560px]">
        <CenteredNav active="ueber-uns" />

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <TocSidebar />

          <div>
            {/* ===== GRUPPE 1: ÜBER MEDCASE ===== */}
            <FadeInUp>
            <div id="ueber-medcase" className="card scroll-mt-6 p-8">
              <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
                Über uns &amp; Methodik
              </h1>
              <p className="mb-8 text-sm text-muted">
                Wer Medcase baut, wie Fälle entstehen und woran sich die Auswahl orientiert.
              </p>

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-users" id="team-hintergrund">Team &amp; Hintergrund</SectionLabel>
                <p className="mb-4 leading-relaxed">
                  Medcase ist ein Projekt mit medizinischem Hintergrund: Wir entwickeln KI-gestützte,
                  quellenbasierte Klinikfälle, mit denen Medizinstudierende klinisches Denken trainieren
                  können — echte diagnostische Situationen statt reiner Auswendiglern-Karteikarten.
                </p>
                <p className="mb-4 leading-relaxed">
                  Gegründet und entwickelt wird Medcase von Sergio Jacinto Hein, Medizinstudent im 7.
                  Semester in Mainz. Medizinisches Fachwissen und Produktentwicklung liegen damit aktuell in
                  einer Hand — ein Vorteil für schnelle Iteration in der frühen Phase, gleichzeitig der Grund,
                  warum ein unabhängiges fachärztliches Review vor einer breiteren Bewerbung fest eingeplant
                  ist (siehe Qualitätssicherung).
                </p>
              </section>

              <Divider />

              <section className="max-w-[70ch]">
                <SectionLabel icon="ti-route" id="wie-ein-fall-entsteht">Wie ein Fall entsteht</SectionLabel>
                <p className="mb-4 text-sm leading-relaxed text-muted">
                  Kein Fall wird &bdquo;einfach so&ldquo; von einer KI ausgegeben. Jeder quellenbasierte Fall
                  durchläuft denselben festen Prozess:
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <StepChip
                    n={1}
                    icon="ti-list-search"
                    title="Diagnose auswählen"
                    text="Nach IMPP-Prüfungshäufigkeit, realer Prävalenz (RKI) und Cannot-miss-Kriterium — nicht zufällig."
                  />
                  <StepChip
                    n={2}
                    icon="ti-books"
                    title="Recherche"
                    text="Nur Primärquellen: AWMF-Leitlinien, ESC, RKI, Onkopedia, IMPP, PubMed, leitlinien.de. Bewusst kein Amboss oder UpToDate."
                  />
                  <StepChip
                    n={3}
                    icon="ti-pencil"
                    title="Fall schreiben"
                    text="Anamnese, Untersuchung, Labor/Bildgebung, 4 Antwortoptionen mit plausiblen Differenzialdiagnosen."
                  />
                  <StepChip
                    n={4}
                    icon="ti-checkup-list"
                    title="Konsistenz-Check"
                    text="Passen alle Laborwerte, Demografie und Bildgebung physiologisch zueinander? Größte Fehlerquelle bei KI-Fällen."
                  />
                  <StepChip
                    n={5}
                    icon="ti-shield-check"
                    title="Strukturvalidierung"
                    text="Automatisiertes Skript prüft Pflichtfelder, Antwortoptionen und Datenformat vor Veröffentlichung."
                  />
                  <StepChip
                    n={6}
                    icon="ti-quote"
                    title="Quellen dokumentieren"
                    text="Jede Diagnosekriterien-Quelle wird vermerkt — auch wenn die Quellenlage dünn ist, statt eine Quelle zu erfinden."
                  />
                </div>
              </section>
            </div>
            </FadeInUp>

            {/* ===== GRUPPE 2: FALLAUSWAHL ===== */}
            <FadeInUp>
            <div id="fallauswahl" className="card mt-4 scroll-mt-6 p-8">
              <h2 className="mb-1 text-xl font-extrabold tracking-tight">
                Fallauswahl
              </h2>
              <p className="mb-8 text-sm text-muted">
                Woran sich die Fallauswahl orientiert — und wie wir mit Cannot-miss-Diagnosen umgehen.
              </p>

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-target-arrow" id="impp-haeufigkeit">IMPP-Häufigkeit</SectionLabel>

                <p className="mb-3 text-sm font-bold text-foreground">Klinik-Fälle: offizieller IMPP-Blueprint (M2-Examen)</p>
                <p className="mb-4 text-[13px] leading-relaxed text-muted">
                  Das IMPP veröffentlicht seit Kurzem erstmals einen offiziellen &bdquo;Blueprint&ldquo; mit der
                  angestrebten Themenverteilung der 320 Prüfungsaufgaben im Zweiten Staatsexamen. Diese
                  Zahlen gelten für das gesamte M2-Examen (alle Fächer) — wir nutzen sie zur{" "}
                  <em>relativen</em> Gewichtung zwischen den für unsere Klinik-Fälle relevanten Organsystemen,
                  nicht als exakte Fallzahl-Vorgabe pro System.
                </p>
                <div className="mb-2 flex flex-col gap-2.5 rounded-lg border-[1.5px] border-card-border/10 p-4">
                  <RangeBar label="Nervensystem &amp; Psyche" min={20} max={30} />
                  <RangeBar label="Kardiovaskuläres System" min={10} max={20} />
                  <RangeBar label="Muskuloskelettal &amp; Weichgewebe" min={10} max={15} />
                  <RangeBar label="Respiratorisches System" min={5} max={15} />
                  <RangeBar label="Verdauungssystem" min={5} max={15} />
                  <RangeBar label="Urogenitales System" min={5} max={15} />
                  <RangeBar label="Haut, Hautanhang, Schleimhaut" min={5} max={15} />
                  <RangeBar label="Hormone &amp; Stoffwechsel" min={5} max={10} />
                  <RangeBar label="Blut &amp; Immunologie" min={2} max={10} />
                  <RangeBar label="Notfallmaßnahmen (Achse 2)" min={5} max={20} />
                </div>
                <p className="mb-6 text-xs text-muted">
                  Quelle:{" "}
                  <SourceLink href="https://www.impp.de/blueprint-m2-examen.html">
                    IMPP – Blueprint Zweites Staatsexamen Medizin
                  </SourceLink>
                  . Werte sind laut IMPP Richtwerte, rechtlich nicht verbindlich.
                </p>

                <p className="mb-3 text-sm font-bold text-foreground">Vorklinik-Fälle: IMPP-Gegenstandskatalog 1 (GK1)</p>
                <p className="mb-3 text-[13px] leading-relaxed text-muted">
                  Für das Physikum (M1) gibt es keinen numerischen Blueprint wie bei M2. Geprüft wird nach dem
                  IMPP-Gegenstandskatalog 1, der in Spalte 4 &bdquo;Anwendungsbeispiele&ldquo; enthält — vom IMPP selbst
                  markierte Themen mit hoher klinischer Relevanz. Genau diese nutzen wir als Grundlage für
                  unsere Fall-Vignetten, aus den drei praktisch übersetzbaren Teilkatalogen:
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {["Anatomie · 5 Fälle", "Physiologie · 5 Fälle", "Biochemie/Stoffwechsel · 5 Fälle"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[#ecf0f9] px-3 py-1 text-xs font-semibold text-accent"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mb-6 text-xs text-muted">
                  Quelle:{" "}
                  <SourceLink href="https://www.impp.de/pruefungen/allgemein/gegenstandskataloge.html">
                    IMPP – Gegenstandskataloge
                  </SourceLink>
                  .
                </p>

                <p className="mb-3 text-sm font-bold text-foreground">Examen/PJ-Fälle: kein IMPP-M3-Blueprint — deshalb zwei andere Achsen</p>
                <p className="mb-3 text-[13px] leading-relaxed text-muted">
                  Geprüft (verifiziert direkt auf impp.de): Das IMPP führt ausschließlich die schriftlichen
                  Prüfungen M1 und M2 durch. Der Dritte Abschnitt (M3, nach dem Praktischen Jahr) ist eine
                  mündlich-praktische Prüfung, lokal an den Universitäten abgenommen — kein bundesweiter
                  Blueprint, keine IMPP-Statistik dazu. Eine &bdquo;IMPP-M3-Häufigkeit&ldquo; existiert schlicht nicht, wir
                  erfinden hier keine. Stattdessen zwei reale Achsen: die GK2/M2-Gewichtung als inhaltliche
                  Grundlage (M3 prüft denselben Stoff, nur mündlich-praktisch) plus echte
                  Krankenhaushäufigkeit nach Destatis.
                </p>
                <p className="text-[13px] leading-relaxed text-muted">
                  Quelle für Krankenhaushäufigkeit:{" "}
                  <SourceLink href="https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Krankenhauser/Publikationen/Downloads-Krankenhaeuser/statistischer-bericht-diagnosedaten-5231301237015.html">
                    Destatis – Diagnosen der Krankenhauspatientinnen und -patienten
                  </SourceLink>
                  , jährliche amtliche Statistik aller vollstationären ICD-10-Diagnosen in Deutschland.
                </p>
              </section>

              <Divider />

              <section className="max-w-[70ch]">
                <SectionLabel icon="ti-alert-triangle" id="cannot-miss">Cannot-miss</SectionLabel>
                <p className="mb-4 text-[13px] leading-relaxed text-muted">
                  Häufigkeit allein reicht als Auswahlkriterium nicht. Manche Diagnosen sind selten, aber
                  zeitkritisch und lebensbedrohlich — wer sie übersieht, riskiert den Patienten. Deshalb ist
                  &bdquo;cannot-miss&ldquo; keine Randnotiz, sondern eine eigene, dritte Auswahl-Achse neben
                  Prüfungshäufigkeit und Prävalenz — gestützt durch den IMPP-Blueprint selbst: Achse 2 weist
                  &bdquo;Notfallmaßnahmen&ldquo; mit 5–20 % einen eigenständigen, substanziellen Anteil zu,
                  nicht nur &bdquo;wenn Zeit bleibt&ldquo;.
                </p>

                <div className="mb-4 rounded-lg border-[1.5px] border-accent/25 bg-[#ecf0f9] p-4">
                  <p className="text-sm font-semibold text-accent">
                    <span className="text-xl font-extrabold">38</span> von 70 quellenbasierten Fällen (rund
                    54 %) sind aktuell als cannot-miss markiert — bewusst kein kleiner Anteil.
                  </p>
                </div>

                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Alle aktuell live</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Akute Appendizitis",
                    "Zentraler Diabetes insipidus",
                    "Status asthmaticus (resp. Azidose)",
                    "Phenylketonurie",
                    "AB0-Transfusionsreaktion",
                    "NSTEMI",
                    "Akute Lungenembolie",
                    "Obere GI-Blutung",
                    "Diabetische Ketoazidose",
                    "Riesenzellarteriitis",
                    "Sigmadivertikulitis mit Perforation",
                    "Aortendissektion Typ A",
                    "Kompartmentsyndrom",
                    "Ischämischer Mediainfarkt",
                    "Status epilepticus",
                    "Urosepsis / septischer Schock",
                    "Thyreotoxische Krise",
                    "Rupturierte Extrauteringravidität",
                    "HELLP-Syndrom",
                    "Invagination (Kleinkind)",
                    "Alkoholentzugsdelir",
                    "Anaphylaktischer Schock",
                    "Cauda-equina-Syndrom",
                    "Akute Pyelonephritis (Hausarzt)",
                    "Bronchialkarzinom (Hausarzt-Erstdiagnose)",
                    "TIA (Hausarztpraxis)",
                    "Kolonkarzinom bei Eisenmangelanämie",
                    "Akute Appendizitis (Hausarzt-Erstpräsentation)",
                    "Instabile Angina pectoris (Hausarztpraxis)",
                    "Perikardtamponade (maligner Perikarderguss)",
                    "Infektiöse Endokarditis (Trikuspidalklappe)",
                    "Primärer Spontanpneumothorax",
                    "Dekompensierte Leberzirrhose mit hepatischer Enzephalopathie",
                    "Akute Cholangitis",
                    "Nephrotisches Syndrom",
                    "Hyperosmolares hyperglykämisches Syndrom (HHS)",
                    "Addison-Krise",
                    "Akute myeloische Leukämie (AML)",
                  ].map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-accent/25 bg-[#ecf0f9] px-2.5 py-1 text-[11.5px] font-semibold text-accent"
                    >
                      <i className="ti ti-alert-triangle text-[9px]" />
                      {d}
                    </span>
                  ))}
                </div>
              </section>
            </div>
            </FadeInUp>

            {/* ===== GRUPPE 3: QUALITÄT ===== */}
            <FadeInUp>
            <div id="qualitaet" className="card mt-4 scroll-mt-6 p-8">
              <h2 className="mb-1 text-xl font-extrabold tracking-tight">
                Qualität
              </h2>
              <p className="mb-8 text-sm text-muted">
                Wie viel Arbeit in der Fallbank steckt und wie Qualitätssicherung heute und künftig aussieht.
              </p>

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-clipboard-check" id="arbeitsaufwand">Arbeitsaufwand</SectionLabel>
                <p className="mb-5 text-sm leading-relaxed text-muted">
                  Wir zeigen hier keine runde, geschönte Zahl, sondern genau, welcher Teil der Fallbank auf
                  welchem Qualitätsniveau ist:
                </p>

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-4">
                    <p className="text-2xl font-extrabold text-[#15803d]">15</p>
                    <p className="text-xs font-semibold text-[#15803d]">Vorklinik-Fälle</p>
                    <p className="mt-1 text-[11px] leading-snug text-[#15803d]">
                      Vollständig quellenbasiert, mit individuellen Quellenangaben pro Fall.
                    </p>
                  </div>
                  <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-4">
                    <p className="text-2xl font-extrabold text-[#15803d]">40</p>
                    <p className="text-xs font-semibold text-[#15803d]">Klinik-Fälle</p>
                    <p className="mt-1 text-[11px] leading-snug text-[#15803d]">
                      Innere + Allgemeinmedizin, vollständig quellenbasiert mit individuellen Quellenangaben pro Fall.
                    </p>
                  </div>
                  <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-4">
                    <p className="text-2xl font-extrabold text-[#15803d]">15</p>
                    <p className="text-xs font-semibold text-[#15803d]">Examen/PJ-Fälle</p>
                    <p className="mt-1 text-[11px] leading-snug text-[#15803d]">
                      Vollständig neu erstellt, quellenbasiert (AWMF/Destatis), ersetzt die alte ungeprüfte
                      40-Fälle-Bank vollständig.
                    </p>
                  </div>
                </div>

                <p className="mb-2 text-[13px] leading-relaxed text-muted">
                  Alle 70 Fälle (Vorklinik + Klinik + Examen/PJ) sind mittlerweile quellenbasiert. Jeder
                  Fall enthält zusätzlich:
                </p>
                <ul className="mb-3 flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted">
                  <li className="flex items-start gap-2">
                    <i className="ti ti-point mt-1 shrink-0 text-[8px] text-accent" />
                    Eine begründete Auswahl (Kategorie &bdquo;häufig&ldquo; oder &bdquo;cannot-miss&ldquo;) mit Quellenbeleg.
                  </li>
                  <li className="flex items-start gap-2">
                    <i className="ti ti-point mt-1 shrink-0 text-[8px] text-accent" />
                    Bis zu drei plausible Differenzialdiagnosen mit individueller Ausschluss-Begründung.
                  </li>
                  <li className="flex items-start gap-2">
                    <i className="ti ti-point mt-1 shrink-0 text-[8px] text-accent" />
                    Anti-Giveaway-Prinzipien: kein plakativer Leitbefund im ersten Satz, verteilte
                    Ausschlussbefunde, ein medizinisch stimmiger Red Herring pro Fall.
                  </li>
                </ul>

                <p className="text-xs text-muted">
                  Zahlen Stand dieser Seite. Die Fallbank wächst laufend — aktuelle Gesamtzahl siehe Startseite.
                </p>
              </section>

              <Divider />

              <section className="max-w-[70ch]">
                <SectionLabel icon="ti-shield-check" id="qualitaetssicherung">Qualitätssicherung — heute und geplant</SectionLabel>
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e7f6ec] text-[#15803d]">
                      <i className="ti ti-check text-[13px]" />
                    </span>
                    <p className="text-[13px] leading-relaxed text-muted">
                      <strong className="text-foreground">&bdquo;Fall melden&ldquo;-Funktion ist live:</strong> Direkt im
                      Ergebnis-Screen kann jeder Fall gemeldet werden. Meldungen laufen intern zusammen und
                      werden gesichtet — ein echter, sofort nutzbarer Feedback-Kanal, kein bloßes Versprechen.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fef3e2] text-[#92400e]">
                      <i className="ti ti-clock text-[13px]" />
                    </span>
                    <p className="text-[13px] leading-relaxed text-muted">
                      <strong className="text-foreground">Fachärztliches Review ist geplant, aber noch nicht erfolgt.</strong>{" "}
                      Quellenangaben zeigen sauberes Recherchieren — sie ersetzen kein fachliches Review. Ein
                      Review durch mindestens einen Assistenz- oder Facharzt ist die Voraussetzung, bevor wir
                      aktiv um ärztliche Aufmerksamkeit werben.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ecf0f9] text-accent">
                      <i className="ti ti-mail" style={{ fontSize: 13 }} />
                    </span>
                    <p className="text-[13px] leading-relaxed text-muted">
                      Fachlichen Fehler gefunden? Schreib uns direkt an{" "}
                      <a href="mailto:kontakt.medcase@gmail.com" className="text-accent underline underline-offset-2">
                        kontakt.medcase@gmail.com
                      </a>{" "}
                      — jeder konkrete Hinweis wird geprüft.
                    </p>
                  </div>
                </div>
              </section>
            </div>
            </FadeInUp>

            {/* Abschluss-CTA: Wer die Methodik komplett liest, ist überzeugt —
                hier den Weg ins Produkt öffnen statt im Footer zu enden. */}
            <FadeInUp>
              <div className="card mt-4 flex flex-col items-center gap-3 p-8 text-center">
                <p className="text-xl font-extrabold tracking-tight">Überzeugt? Probier&apos;s aus.</p>
                <p className="max-w-md text-sm text-muted">
                  Kostenlos, kein Account — dein erster Fall wartet.
                </p>
                <Link
                  href="/"
                  className="group mt-1 inline-flex items-center gap-1.5 rounded-xl bg-accent px-8 py-4 text-lg font-bold text-accent-foreground transition-transform duration-[80ms] active:scale-[0.98]"
                >
                  Ersten Fall lösen
                  <i className="ti ti-arrow-right transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </div>
            </FadeInUp>

            {/* Footer */}
            <footer
              className="mt-4 flex items-center justify-between border-t border-card-border/15 pt-3"
              style={{ fontSize: 11, color: "#5f5e5a" }}
            >
              <span>© 2026 Medcase</span>
              <div className="flex items-center gap-4">
                <Link href="/news" className="hover:underline">
                  News
                </Link>
                <Link href="/impressum#impressum" className="hover:underline">
                  Impressum
                </Link>
                <Link href="/impressum#datenschutz" className="hover:underline">
                  Datenschutz
                </Link>
                <KontaktPopover />
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
