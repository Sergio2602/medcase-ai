import { KontaktPopover } from "@/app/components/KontaktPopover";
import { AppHeader } from "@/app/components/AppHeader";

export const metadata = {
  title: "Über uns & Methodik — Medcase",
  description:
    "Wer Medcase baut, wie Fälle recherchiert werden und woran sich die Auswahl orientiert — inklusive dem, was noch nicht fertig ist.",
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
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

export default function UeberUnsPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1320px]">
        <AppHeader backLabel="Zurück" backIcon="ti-arrow-left" />

        <div className="mx-auto max-w-[760px]">
          {/* ===== HERO ===== */}
          <div className="card mb-4 p-8">
            <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
              Über uns &amp; Methodik
            </h1>
            <p className="mb-6 text-sm text-muted">
              Wie Medcase entsteht, woran sich die Fallauswahl orientiert — und wo wir noch nicht fertig sind.
            </p>

            <p className="mb-4 max-w-[62ch] leading-relaxed">
              Medcase wird von <strong>Sergio Jacinto Hein</strong> entwickelt, Medizinstudent im 7. Semester
              in Mainz. Kein Team, kein Unternehmen dahinter — ein Studierender, der das Tool baut, das er
              sich selbst beim Lernen gewünscht hätte: Fälle wie im Uniklinik-Alltag, nicht nur
              Auswendiglern-Karteikarten.
            </p>

            <div className="flex items-start gap-2.5 rounded-lg border-[1.5px] border-[#d97706]/40 bg-[#fef3e2] px-4 py-3.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d97706] text-white">
                <i className="ti ti-alert-triangle text-[11px]" />
              </span>
              <p className="text-[13px] font-semibold leading-relaxed text-[#92400e]">
                Ehrlich gesagt: Sergio ist Medizinstudent, kein approbierter Arzt. Es hat bislang{" "}
                <u>kein fachärztliches Review</u> der Fälle stattgefunden. Die Fälle werden KI-gestützt
                erstellt und quellenbasiert recherchiert — das ersetzt kein Fachurteil, keine Leitlinie und
                keine ärztliche Ausbildung. Ein Review vor breiterer Bewerbung ist geplant (siehe unten).
              </p>
            </div>
          </div>

          {/* ===== METHODIK-PIPELINE ===== */}
          <div className="card mb-4 p-8">
            <SectionLabel icon="ti-route">Wie ein Fall entsteht</SectionLabel>
            <p className="mb-4 max-w-[62ch] text-sm leading-relaxed text-muted">
              Kein Fall wird &bdquo;einfach so&ldquo; von einer KI ausgegeben. Jeder quellenbasierte Fall (siehe unten,
              welche das genau sind) durchläuft denselben festen Prozess:
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
                title="Quellen ehrlich dokumentieren"
                text="Jede Diagnosekriterien-Quelle wird vermerkt — auch wenn die Quellenlage dünn ist, statt eine Quelle zu erfinden."
              />
            </div>
          </div>

          {/* ===== IMPP-HÄUFIGKEIT ===== */}
          <div className="card mb-4 p-8">
            <SectionLabel icon="ti-target-arrow">Woran sich die Fallauswahl orientiert</SectionLabel>

            <div className="mb-6 max-w-[62ch]">
              <p className="mb-3 text-sm font-bold text-foreground">Klinik-Fälle: offizieller IMPP-Blueprint (M2-Examen)</p>
              <p className="mb-4 text-[13px] leading-relaxed text-muted">
                Das IMPP veröffentlicht seit Kurzem erstmals einen offiziellen &bdquo;Blueprint&ldquo; mit der
                angestrebten Themenverteilung der 320 Prüfungsaufgaben im Zweiten Staatsexamen. Diese
                Zahlen gelten für das gesamte M2-Examen (alle Fächer) — wir nutzen sie zur{" "}
                <em>relativen</em> Gewichtung zwischen den für unsere Klinik-Fälle relevanten Organsystemen,
                nicht als exakte Fallzahl-Vorgabe pro System.
              </p>
              <div className="flex flex-col gap-2.5 rounded-lg border-[1.5px] border-card-border/10 p-4">
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
              <p className="mt-2 text-xs text-muted">
                Quelle:{" "}
                <SourceLink href="https://www.impp.de/blueprint-m2-examen.html">
                  IMPP – Blueprint Zweites Staatsexamen Medizin
                </SourceLink>
                . Werte sind laut IMPP Richtwerte, rechtlich nicht verbindlich.
              </p>
            </div>

            <Divider />

            <div className="max-w-[62ch]">
              <p className="mb-3 text-sm font-bold text-foreground">Vorklinik-Fälle: IMPP-Gegenstandskatalog 1 (GK1)</p>
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Für das Physikum (M1) gibt es keinen numerischen Blueprint wie bei M2. Geprüft wird nach dem
                IMPP-Gegenstandskatalog 1, der in Spalte 4 &bdquo;Anwendungsbeispiele&ldquo; enthält — vom IMPP selbst
                markierte Themen mit hoher klinischer Relevanz. Genau diese nutzen wir als Grundlage für
                unsere Fall-Vignetten, aus den drei praktisch übersetzbaren Teilkatalogen:
              </p>
              <div className="flex flex-wrap gap-2">
                {["Anatomie · 5 Fälle", "Physiologie · 5 Fälle", "Biochemie/Stoffwechsel · 5 Fälle"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[#eaf0fc] px-3 py-1 text-xs font-semibold text-accent"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                Quelle:{" "}
                <SourceLink href="https://www.impp.de/pruefungen/allgemein/gegenstandskataloge.html">
                  IMPP – Gegenstandskataloge
                </SourceLink>
                .
              </p>
            </div>
          </div>

          {/* ===== ARBEITSAUFWAND ===== */}
          <div className="card mb-4 p-8">
            <SectionLabel icon="ti-clipboard-check">Wie viel Arbeit in der Fallbank steckt — ehrlich aufgeschlüsselt</SectionLabel>
            <p className="mb-5 max-w-[62ch] text-sm leading-relaxed text-muted">
              Wir wollen hier keine runde, geschönte Zahl zeigen, sondern genau sagen, welcher Teil der
              Fallbank auf welchem Qualitätsniveau ist:
            </p>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-4">
                <p className="text-2xl font-extrabold text-[#15803d]">15</p>
                <p className="text-xs font-semibold text-[#15803d]">Vorklinik-Fälle</p>
                <p className="mt-1 text-[11px] leading-snug text-[#15803d]/80">
                  Vollständig quellenbasiert, mit individuellen Quellenangaben pro Fall.
                </p>
              </div>
              <div className="rounded-lg border-[1.5px] border-[#15803d]/25 bg-[#e7f6ec] p-4">
                <p className="text-2xl font-extrabold text-[#15803d]">11</p>
                <p className="text-xs font-semibold text-[#15803d]">Klinik/Innere-Fälle</p>
                <p className="mt-1 text-[11px] leading-snug text-[#15803d]/80">
                  Vollständig quellenbasiert, mit individuellen Quellenangaben pro Fall.
                </p>
              </div>
              <div className="rounded-lg border-[1.5px] border-[#d97706]/30 bg-[#fef3e2] p-4">
                <p className="text-2xl font-extrabold text-[#92400e]">40</p>
                <p className="text-xs font-semibold text-[#92400e]">Examen/PJ-Fälle</p>
                <p className="mt-1 text-[11px] leading-snug text-[#92400e]/80">
                  Ältere Fallbank, noch ohne dokumentierte Einzelquellen. Überarbeitung nach demselben
                  Standard ist geplant, aber noch nicht erfolgt.
                </p>
              </div>
            </div>

            <p className="mb-2 max-w-[62ch] text-[13px] leading-relaxed text-muted">
              Bei den 26 quellenbasierten Fällen (Vorklinik + Klinik/Innere) enthält jeder Fall zusätzlich:
            </p>
            <ul className="mb-5 flex max-w-[62ch] flex-col gap-1.5 text-[13px] leading-relaxed text-muted">
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

            <p className="max-w-[62ch] text-xs text-muted">
              Zahlen Stand dieser Seite. Die Fallbank wächst laufend — aktuelle Gesamtzahl siehe Startseite.
            </p>
          </div>

          {/* ===== QUALITÄTSSICHERUNG ===== */}
          <div className="card mb-4 p-8">
            <SectionLabel icon="ti-shield-check">Qualitätssicherung — heute und geplant</SectionLabel>
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
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
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
          </div>

          {/* Footer */}
          <footer
            className="mt-4 flex items-center justify-between border-t border-card-border/15 pt-3"
            style={{ fontSize: 11, color: "#5f5e5a" }}
          >
            <span>© 2026 Medcase</span>
            <div className="flex items-center gap-4">
              <a href="/impressum#impressum" className="hover:underline">
                Impressum
              </a>
              <a href="/impressum#datenschutz" className="hover:underline">
                Datenschutz
              </a>
              <KontaktPopover />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
