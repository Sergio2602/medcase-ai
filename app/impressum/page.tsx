import { KontaktPopover } from "@/app/components/KontaktPopover";
import { AppHeader } from "@/app/components/AppHeader";

export const metadata = {
  title: "Impressum & Datenschutz — Medcase",
};

function SectionLabel({ icon, id, children }: { icon: string; id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mb-3 scroll-mt-24 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
      <i className={`ti ${icon} text-sm`} />
      {children}
    </p>
  );
}

function LegalBasis({ text }: { text: string }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
      <i className="ti ti-scale mt-[1px] shrink-0 text-[11px]" />
      {text}
    </p>
  );
}

function Divider() {
  return <div className="mb-6 h-px bg-card-border/10" />;
}

const TOC = [
  {
    id: "impressum",
    label: "Impressum",
    items: [
      { id: "anbieter", label: "Anbieter" },
      { id: "kontakt", label: "Kontakt" },
      { id: "verantwortlich-inhalt", label: "Verantwortlich für den Inhalt" },
      { id: "haftung-inhalte", label: "Haftung für Inhalte" },
      { id: "haftung-links", label: "Haftung für Links" },
      { id: "urheberrecht", label: "Urheberrecht" },
      { id: "streitbeilegung", label: "Verbraucherstreitbeilegung" },
    ],
  },
  {
    id: "datenschutz",
    label: "Datenschutz",
    items: [
      { id: "verantwortlicher", label: "Verantwortlicher" },
      { id: "cookies", label: "Cookies" },
      { id: "localstorage", label: "Lokaler Speicher" },
      { id: "email-benachrichtigungen", label: "E-Mail-Benachrichtigungen" },
      { id: "hosting", label: "Hosting" },
      { id: "upstash", label: "Upstash Redis" },
      { id: "discord", label: "Discord-Webhook" },
      { id: "rechte", label: "Deine Rechte" },
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

export default function ImpressumPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1560px]">
        <AppHeader
          backLabel="Zurück"
          backIcon="ti-arrow-left"
          secondaryLink={{ href: "/ueber-uns", label: "Über uns", icon: "ti-info-circle" }}
          right={
            <div className="hidden items-center gap-1.5 text-sm font-semibold sm:flex">
              <a
                href="#impressum"
                className="rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-[#eaf0fc] hover:text-accent"
              >
                Impressum
              </a>
              <a
                href="#datenschutz"
                className="rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-[#eaf0fc] hover:text-accent"
              >
                Datenschutz
              </a>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <TocSidebar />

          <div>
            {/* ===== IMPRESSUM ===== */}
            <div id="impressum" className="card scroll-mt-6 p-8">
              <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
                Impressum
              </h1>
              <p className="mb-8 text-sm text-muted">
                Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)
              </p>

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-user-shield" id="anbieter">Anbieter</SectionLabel>
                <p className="leading-relaxed">
                  Sergio Jacinto Hein
                  <br />
                  Anni-Eisler-Lehmann-Str. 2, Apartment 25
                  <br />
                  55122 Mainz
                  <br />
                  Deutschland
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-mail" id="kontakt">Kontakt</SectionLabel>
                <p className="leading-relaxed">
                  E-Mail:{" "}
                  <a
                    href="mailto:kontakt.medcase@gmail.com"
                    className="text-accent underline underline-offset-2"
                  >
                    kontakt.medcase@gmail.com
                  </a>
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-info-circle" id="verantwortlich-inhalt">
                  Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
                </SectionLabel>
                <p className="leading-relaxed text-muted">
                  Sergio Jacinto Hein (Anschrift wie oben).
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-shield-check" id="haftung-inhalte">Haftung für Inhalte</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen
                  Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir
                  als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte
                  fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
                  rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der
                  Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
                  Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer
                  konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
                  Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-link" id="haftung-links">Haftung für Links</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir
                  keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine
                  Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige
                  Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum
                  Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige
                  Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente
                  inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer
                  Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden
                  wir derartige Links umgehend entfernen.
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-copyright" id="urheberrecht">Urheberrecht</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
                  unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung,
                  Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes
                  bedürfen der schriftlichen Zustimmung des jeweiligen Erstellers. Downloads und
                  Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch
                  gestattet.
                </p>
              </section>

              <Divider />

              <section className="max-w-[70ch]">
                <SectionLabel icon="ti-scale" id="streitbeilegung">Verbraucherstreitbeilegung</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                  Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </section>
            </div>

            {/* ===== DATENSCHUTZ ===== */}
            <div id="datenschutz" className="card mt-4 scroll-mt-6 p-8">
              <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
                Datenschutzerklärung
              </h1>
              <p className="mb-8 text-sm text-muted">
                Informationen zur Datenverarbeitung bei Medcase
              </p>

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-user-shield" id="verantwortlicher">Verantwortlicher</SectionLabel>
                <p className="leading-relaxed">
                  Sergio Jacinto Hein
                  <br />
                  Anni-Eisler-Lehmann-Str. 2, Apartment 25
                  <br />
                  55122 Mainz
                  <br />
                  E-Mail:{" "}
                  <a
                    href="mailto:kontakt.medcase@gmail.com"
                    className="text-accent underline underline-offset-2"
                  >
                    kontakt.medcase@gmail.com
                  </a>
                </p>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-cookie" id="cookies">Cookies</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Diese Website verwendet ausschließlich technisch notwendige Cookies. Es werden
                  keine Marketing-, Werbe- oder Tracking-Cookies eingesetzt.
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  <div className="rounded-lg border-[1.5px] border-card-border/15 p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <i className="ti ti-cookie text-xs text-muted" />
                      disclaimerSeen
                    </p>
                    <p className="text-sm leading-relaxed text-muted">
                      Speichert, ob du den Hinweis zur Nutzung gelesen hast. Laufzeit: 1 Jahr.
                    </p>
                    <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an fehlerfreier Darstellung)." />
                  </div>
                  <div className="rounded-lg border-[1.5px] border-card-border/15 p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <i className="ti ti-cookie text-xs text-muted" />
                      medcase_onboarding_seen
                    </p>
                    <p className="text-sm leading-relaxed text-muted">
                      Speichert, ob du die Einführungstour bereits gesehen hast. Laufzeit: 1 Jahr.
                    </p>
                    <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an fehlerfreier Darstellung)." />
                  </div>
                </div>
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-device-floppy" id="localstorage">Lokaler Speicher (localStorage)</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Zusätzlich zu den oben genannten Cookies speichert diese Website deinen
                  Lernfortschritt (gelöste Fälle, Fachbereich, Schwierigkeit, Ergebnis,
                  Bearbeitungszeit, Zeitpunkt) lokal in deinem Browser — technisch als{" "}
                  <span className="clinical-data">localStorage</span> (Schlüssel{" "}
                  <span className="clinical-data">medcase_stats_v1</span>), nicht als Cookie. Der
                  Unterschied: localStorage wird nicht bei jedem Seitenaufruf automatisch
                  übertragen und hat kein festes Ablaufdatum. Diese Daten verlassen deinen Browser
                  nie, werden nicht an uns oder Dritte übermittelt und dienen ausschließlich der
                  Anzeige deiner persönlichen Statistik auf der Seite{" "}
                  <span className="clinical-data">/statistik</span>. Du kannst sie jederzeit über
                  den Button &bdquo;Statistik zurücksetzen&ldquo; dort oder durch Löschen deiner
                  Browserdaten entfernen.
                </p>
                <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Bereitstellung der Lernfortschritts-Funktion)." />
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-mail" id="email-benachrichtigungen">E-Mail-Benachrichtigungen</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Wenn du deine E-Mail-Adresse für Release-Benachrichtigungen hinterlässt,
                  verwenden wir sie ausschließlich dafür. Keine Weitergabe an Dritte, keine Nutzung
                  für Marketing. Du kannst die Benachrichtigungen jederzeit per E-Mail an{" "}
                  <a
                    href="mailto:kontakt.medcase@gmail.com"
                    className="text-accent underline underline-offset-2"
                  >
                    kontakt.medcase@gmail.com
                  </a>{" "}
                  abbestellen.
                </p>
                <LegalBasis text="Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)." />
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-server" id="hosting">Hosting</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Diese Website wird bei Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723,
                  USA gehostet. Beim Aufruf der Seite werden automatisch Server-Logdaten erfasst
                  (IP-Adresse, Zeitstempel, aufgerufene URL). Diese Daten werden von Vercel zur
                  Bereitstellung des Dienstes verarbeitet und nicht dauerhaft gespeichert. Weitere
                  Informationen:{" "}
                  <a
                    href="https://vercel.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    Vercel Privacy Policy
                  </a>
                  .
                </p>
                <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Bereitstellung des Dienstes)." />
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-database" id="upstash">Upstash Redis (Datenspeicher)</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Wenn du über die Funktion &bdquo;Fall melden&ldquo; einen Fehlerhinweis absendest,
                  wird dieser temporär in einer Upstash-Redis-Datenbank gespeichert. Gespeichert
                  werden: Fall-ID, gewählte Schwierigkeit, optionaler Freitext und Zeitstempel —
                  keine personenbezogenen Daten. Anbieter: Upstash, Inc. Serverstandort: [PLATZHALTER
                  — von Sergio zu bestätigen]. Upstash ist Vercel-Marketplace-Partner. Weitere
                  Informationen:{" "}
                  <a
                    href="https://upstash.com/trust/privacy.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    Upstash Privacy Policy
                  </a>
                  .
                </p>
                <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Qualitätssicherung)." />
              </section>

              <Divider />

              <section className="mb-6 max-w-[70ch]">
                <SectionLabel icon="ti-message-circle" id="discord">Discord-Webhook (Fall melden)</SectionLabel>
                <p className="leading-relaxed text-muted">
                  Fehlermeldungen über die Funktion &bdquo;Fall melden&ldquo; werden zusätzlich per
                  Webhook an einen internen Discord-Server übermittelt. Zweck: interne
                  Fehlerbehebung und Qualitätssicherung. Übermittelt werden: Fall-ID, Schwierigkeit,
                  optionaler Freitext und Zeitstempel — keine personenbezogenen Daten. Keine
                  Weitergabe an Dritte. Anbieter: Discord Inc., 444 De Haro Street, Suite 200, San
                  Francisco, CA 94107, USA.
                </p>
                <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Qualitätssicherung)." />
              </section>

              <Divider />

              <section className="max-w-[70ch]">
                <SectionLabel icon="ti-gavel" id="rechte">Deine Rechte</SectionLabel>
                <p className="mb-3 leading-relaxed text-muted">
                  Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
                  Verarbeitung sowie Datenübertragbarkeit. Bei Fragen oder zur Ausübung deiner
                  Rechte wende dich an{" "}
                  <a
                    href="mailto:kontakt.medcase@gmail.com"
                    className="text-accent underline underline-offset-2"
                  >
                    kontakt.medcase@gmail.com
                  </a>
                  .
                </p>
                <p className="leading-relaxed text-muted">
                  Du hast außerdem das Recht, dich bei einer Datenschutzaufsichtsbehörde zu
                  beschweren, insbesondere in dem EU-Mitgliedstaat deines Wohnsitzes.
                </p>
              </section>
            </div>

            {/* Footer */}
            <footer
              className="mt-4 flex items-center justify-between border-t border-card-border/15 pt-3"
              style={{ fontSize: 11, color: "#5f5e5a" }}
            >
              <span>© 2026 Medcase</span>
              <div className="flex items-center gap-4">
                <a href="#impressum" className="hover:underline">
                  Impressum
                </a>
                <a href="#datenschutz" className="hover:underline">
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
