import { KontaktPopover } from "@/app/components/KontaktPopover";
import { CenteredNav } from "@/app/components/CenteredNav";
import { FadeInUp } from "@/app/components/FadeInUp";

export const metadata = {
  title: "Fragen & Antworten — Medcase",
  description:
    "Wofür Medcase gedacht ist, wie die Fälle entstehen und was du sonst noch wissen solltest.",
};

function SectionLabel({ icon, id, children }: { icon: string; id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mb-2 scroll-mt-24 flex items-center gap-1.5 text-[15px] font-bold text-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eaf0fc] text-accent">
        <i className={`ti ${icon} text-[13px]`} />
      </span>
      {children}
    </p>
  );
}

function Divider() {
  return <div className="mb-6 h-px bg-card-border/10" />;
}

const TOC = [
  {
    id: "nutzung",
    label: "Nutzung",
    items: [
      { id: "wofuer", label: "Wofür nutzen?" },
      { id: "kostenlos", label: "Kostenlos & Account" },
      { id: "niveau", label: "Für welches Semester?" },
    ],
  },
  {
    id: "inhalte-qualitaet",
    label: "Inhalte & Qualität",
    items: [
      { id: "ki-faelle", label: "Wie entstehen die Fälle?" },
      { id: "amboss-ersatz", label: "Ersetzt das AMBOSS?" },
    ],
  },
  {
    id: "feedback",
    label: "Feedback",
    items: [{ id: "fehler-melden", label: "Fehler gefunden?" }],
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

export default function QAPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1560px]">
        <CenteredNav active="qa" />

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <TocSidebar />

          <div>
            {/* ===== GRUPPE 1: NUTZUNG ===== */}
            <FadeInUp>
              <div id="nutzung" className="card scroll-mt-6 p-8">
                <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
                  Fragen &amp; Antworten
                </h1>
                <p className="mb-8 text-sm text-muted">
                  Die wichtigsten Fragen zu Medcase — kurz und ehrlich beantwortet.
                </p>

                <section className="mb-6 max-w-[70ch]">
                  <SectionLabel icon="ti-target-arrow" id="wofuer">
                    Wofür soll ich Medcase nutzen?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    Um dich vor einer Famulatur oder Klausur auf die häufigsten klinischen
                    Fälle vorzubereiten: Du forderst Anamnese, Untersuchung und Labor selbst an
                    und lernst so, welche Befundkombination zu welcher Diagnose passt —
                    unabhängig von Anki-Karten.
                  </p>
                </section>

                <Divider />

                <section className="mb-6 max-w-[70ch]">
                  <SectionLabel icon="ti-wallet" id="kostenlos">
                    Ist Medcase kostenlos und brauche ich einen Account?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    Ja, komplett kostenlos und ohne Account — du kannst direkt loslegen.
                    Aktuell stehen 5 Fälle pro Tag zur Verfügung.
                  </p>
                </section>

                <Divider />

                <section className="max-w-[70ch]">
                  <SectionLabel icon="ti-school" id="niveau">
                    Für welches Semester ist Medcase geeignet?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    Drei Schwierigkeitsstufen — Vorklinik, Klinik und Examen/PJ — mit aktuell
                    41 Fällen insgesamt (15 Vorklinik, 11 Klinik/Innere, 15 Examen/PJ).
                  </p>
                </section>
              </div>
            </FadeInUp>

            {/* ===== GRUPPE 2: INHALTE & QUALITÄT ===== */}
            <FadeInUp>
              <div id="inhalte-qualitaet" className="card mt-4 scroll-mt-6 p-8">
                <h2 className="mb-1 text-xl font-extrabold uppercase tracking-widest">
                  Inhalte &amp; Qualität
                </h2>
                <p className="mb-8 text-sm text-muted">
                  Wie die Fälle entstehen und wie wir es damit halten.
                </p>

                <section className="mb-6 max-w-[70ch]">
                  <SectionLabel icon="ti-robot" id="ki-faelle">
                    Wie entstehen die Fälle — ist das seriös?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    KI-generiert, aber jeder Fall wird gegen AWMF-Leitlinien,
                    IMPP-Gegenstandskataloge und offizielle Versorgungsdaten geprüft, nicht
                    frei erfunden. Ein unabhängiges fachärztliches Review ist geplant, hat aber
                    noch nicht stattgefunden — die Quellenangaben ersetzen kein fachliches
                    Urteil.{" "}
                    <a
                      href="/ueber-uns#methodik"
                      className="text-accent underline underline-offset-2"
                    >
                      Mehr zur Methodik
                    </a>
                    .
                  </p>
                </section>

                <Divider />

                <section className="max-w-[70ch]">
                  <SectionLabel icon="ti-scale" id="amboss-ersatz">
                    Ersetzt Medcase AMBOSS oder andere Lernressourcen?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    Nein. Medcase ersetzt kein Fakten-Nachschlagewerk, sondern trainiert
                    gezielt das klinische Denken: selbst entscheiden, welche Befunde du
                    brauchst, statt sie vorgelegt zu bekommen.
                  </p>
                </section>
              </div>
            </FadeInUp>

            {/* ===== GRUPPE 3: FEEDBACK ===== */}
            <FadeInUp>
              <div id="feedback" className="card mt-4 scroll-mt-6 p-8">
                <h2 className="mb-1 text-xl font-extrabold uppercase tracking-widest">
                  Feedback
                </h2>
                <p className="mb-8 text-sm text-muted">
                  Fehler passieren — so meldest du sie.
                </p>

                <section className="max-w-[70ch]">
                  <SectionLabel icon="ti-flag" id="fehler-melden">
                    Ich finde einen Fall fehlerhaft — was jetzt?
                  </SectionLabel>
                  <p className="text-sm leading-relaxed text-muted">
                    Direkt im Ergebnis-Screen über die &bdquo;Fall melden&ldquo;-Funktion — ein
                    echter Feedback-Kanal, kein leeres Versprechen. Alternativ per Mail an{" "}
                    <a
                      href="mailto:kontakt.medcase@gmail.com"
                      className="text-accent underline underline-offset-2"
                    >
                      kontakt.medcase@gmail.com
                    </a>
                    .
                  </p>
                </section>
              </div>
            </FadeInUp>

            {/* Footer */}
            <footer
              className="mt-4 flex items-center justify-between border-t border-card-border/15 pt-3"
              style={{ fontSize: 11, color: "#5f5e5a" }}
            >
              <span>© 2026 Medcase</span>
              <div className="flex items-center gap-4">
                <a href="/news" className="hover:underline">
                  News
                </a>
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
    </div>
  );
}
