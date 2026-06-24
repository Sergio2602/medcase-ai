import Link from "next/link";
import { Logo } from "@/app/components/Logo";

export const metadata = {
  title: "Impressum — Medcase",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1140px]">
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

        <div className="card mx-auto max-w-2xl p-8">
          <h1 className="mb-6 text-3xl font-extrabold tracking-tight">
            Impressum
          </h1>

          <section className="mb-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
              Angaben gemäß § 5 DDG
            </p>
            <p className="leading-relaxed">
              Sergio Jacinto Hein
              <br />
              Anni-Eisler-Lehmann-Str. 2, Apartment 25
              <br />
              55122 Mainz
            </p>
          </section>

          <div className="mb-6 h-px bg-card-border/10" />

          <section className="mb-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
              Kontakt
            </p>
            <p className="leading-relaxed">
              E-Mail:{" "}
              <a
                href="mailto:sergio.medbuilds@gmail.com"
                className="text-accent underline underline-offset-2"
              >
                sergio.medbuilds@gmail.com
              </a>
            </p>
          </section>

          <div className="mb-6 h-px bg-card-border/10" />

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
              Verbraucherstreitbeilegung
            </p>
            <p className="leading-relaxed text-muted">
              Wir sind nicht bereit oder verpflichtet, an
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen.
            </p>
          </section>
        </div>

        <footer
          className="mx-auto mt-4 max-w-2xl border-t border-card-border/15 pt-3 text-center"
          style={{ fontSize: 11, color: "#5f5e5a" }}
        >
          © 2026 Medcase
        </footer>
      </div>
    </div>
  );
}
