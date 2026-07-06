import Link from "next/link";
import { Logo } from "@/app/components/Logo";

export const metadata = {
  title: "Datenschutzerklärung — Medcase",
};

function SectionLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
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

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1140px]">

        {/* Nav bar */}
        <div
          className="mb-6 flex items-center gap-2.5 rounded-xl border-[1.5px] bg-card px-4 py-2.5"
          style={{ borderColor: "#d8d6cd" }}
        >
          <Logo size={30} />
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border-[1.5px] bg-card px-3.5 py-[7px] text-sm font-semibold"
            style={{ borderColor: "#d8d6cd" }}
          >
            <i className="ti ti-arrow-left text-sm" />
            Zurück
          </Link>
        </div>

        <div className="card mx-auto max-w-[820px] p-8">

          {/* Title */}
          <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-widest">
            Datenschutzerklärung
          </h1>
          <p className="mb-8 text-sm text-muted">
            Informationen zur Datenverarbeitung bei Medcase
          </p>

          {/* Verantwortlicher */}
          <section className="mb-6">
            <SectionLabel icon="ti-user-shield">Verantwortlicher</SectionLabel>
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

          <div className="mb-6 h-px bg-card-border/10" />

          {/* Cookies */}
          <section className="mb-6">
            <SectionLabel icon="ti-cookie">Cookies</SectionLabel>
            <p className="leading-relaxed text-muted">
              Diese Website verwendet ausschließlich technisch notwendige Cookies. Es werden keine Marketing-, Werbe- oder Tracking-Cookies eingesetzt.
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

          <div className="mb-6 h-px bg-card-border/10" />

          {/* E-Mail-Benachrichtigungen */}
          <section className="mb-6">
            <SectionLabel icon="ti-mail">E-Mail-Benachrichtigungen</SectionLabel>
            <p className="leading-relaxed text-muted">
              Wenn du deine E-Mail-Adresse für Release-Benachrichtigungen hinterlässt, verwenden wir sie ausschließlich dafür. Keine Weitergabe an Dritte, keine Nutzung für Marketing. Du kannst die Benachrichtigungen jederzeit per E-Mail an{" "}
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

          <div className="mb-6 h-px bg-card-border/10" />

          {/* Hosting */}
          <section className="mb-6">
            <SectionLabel icon="ti-server">Hosting</SectionLabel>
            <p className="leading-relaxed text-muted">
              Diese Website wird bei Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA gehostet. Beim Aufruf der Seite werden automatisch Server-Logdaten erfasst (IP-Adresse, Zeitstempel, aufgerufene URL). Diese Daten werden von Vercel zur Bereitstellung des Dienstes verarbeitet und nicht dauerhaft gespeichert. Weitere Informationen:{" "}
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

          <div className="mb-6 h-px bg-card-border/10" />

          {/* Upstash */}
          <section className="mb-6">
            <SectionLabel icon="ti-database">Upstash Redis (Datenspeicher)</SectionLabel>
            <p className="leading-relaxed text-muted">
              Wenn du über die Funktion &bdquo;Fall melden&ldquo; einen Fehlerhinweis absendest, wird dieser temporär in einer Upstash-Redis-Datenbank gespeichert. Gespeichert werden: Fall-ID, gewählte Schwierigkeit, optionaler Freitext und Zeitstempel — keine personenbezogenen Daten. Anbieter: Upstash, Inc. Serverstandort: [PLATZHALTER — von Sergio zu bestätigen]. Upstash ist Vercel-Marketplace-Partner. Weitere Informationen:{" "}
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

          <div className="mb-6 h-px bg-card-border/10" />

          {/* Discord */}
          <section className="mb-6">
            <SectionLabel icon="ti-message-circle">Discord-Webhook (Fall melden)</SectionLabel>
            <p className="leading-relaxed text-muted">
              Fehlermeldungen über die Funktion &bdquo;Fall melden&ldquo; werden zusätzlich per Webhook an einen internen Discord-Server übermittelt. Zweck: interne Fehlerbehebung und Qualitätssicherung. Übermittelt werden: Fall-ID, Schwierigkeit, optionaler Freitext und Zeitstempel — keine personenbezogenen Daten. Keine Weitergabe an Dritte. Anbieter: Discord Inc., 444 De Haro Street, Suite 200, San Francisco, CA 94107, USA.
            </p>
            <LegalBasis text="Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Qualitätssicherung)." />
          </section>

          <div className="mb-6 h-px bg-card-border/10" />

          {/* Betroffenenrechte */}
          <section>
            <SectionLabel icon="ti-gavel">Deine Rechte</SectionLabel>
            <p className="mb-3 leading-relaxed text-muted">
              Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung sowie Datenübertragbarkeit. Bei Fragen oder zur Ausübung deiner Rechte wende dich an{" "}
              <a
                href="mailto:kontakt.medcase@gmail.com"
                className="text-accent underline underline-offset-2"
              >
                kontakt.medcase@gmail.com
              </a>
              .
            </p>
            <p className="leading-relaxed text-muted">
              Du hast außerdem das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren, insbesondere in dem EU-Mitgliedstaat deines Wohnsitzes.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer
          className="mx-auto mt-6 max-w-[820px] border-t border-card-border/15 pt-3 text-center"
          style={{ fontSize: 11, color: "#5f5e5a" }}
        >
          © 2026 Medcase ·{" "}
          <Link href="/impressum" className="hover:underline">
            Impressum
          </Link>
          {" · "}
          <Link href="/datenschutz" className="hover:underline">
            Datenschutz
          </Link>
          {" · "}
          <span>Kontakt</span>
        </footer>

      </div>
    </div>
  );
}
