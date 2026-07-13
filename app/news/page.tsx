import Link from "next/link";
import { KontaktPopover } from "@/app/components/KontaktPopover";
import { CenteredNav } from "@/app/components/CenteredNav";
import { FadeInUp } from "@/app/components/FadeInUp";

export const metadata = {
  title: "News — Medcase",
  description: "Was sich bei Medcase gerade tut — neue Fälle, Updates, Aufrufe.",
};

// Neueste zuerst. Einfach oben ergänzen, wenn's was Neues gibt — der erste
// Eintrag wird automatisch groß/featured dargestellt, der Rest im kompakten
// Grid darunter. Keine Struktur-Änderung nötig, damit das über Zeit mitwächst.
const NEWS_ITEMS: { date: string; icon: string; tag: string; title: string; text: string }[] = [
  {
    date: "13. Juli 2026",
    icon: "ti-flask",
    tag: "Ankündigung",
    title: "Wir starten die Validierungsphase",
    text: "Medcase ist komplett kostenlos nutzbar. Wir sammeln jetzt aktiv Feedback von echten Medizinstudierenden — nutze die „Fall melden“-Funktion im Ergebnis-Screen oder schreib uns direkt, was gut funktioniert und was nicht.",
  },
  {
    date: "13. Juli 2026",
    icon: "ti-stack-2",
    tag: "Produkt",
    title: "41 Fälle in drei Schwierigkeitsstufen live",
    text: "Vorklinik, Klinik und Examen/PJ — ausgewählt nach IMPP-Prüfungshäufigkeit und Cannot-miss-Kriterium. Wird laufend erweitert.",
  },
  {
    date: "13. Juli 2026",
    icon: "ti-users-plus",
    tag: "Team",
    title: "Wir suchen Verstärkung",
    text: "Medcase wächst weiter. Bei Interesse an einer Zusammenarbeit schreib uns an kontakt.medcase@gmail.com.",
  },
];

function Tag({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <span
      className="line-pop inline-flex w-fit items-center rounded-full bg-[#ecf0f9] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </span>
  );
}

export default function NewsPage() {
  const [featured, ...rest] = NEWS_ITEMS;

  return (
    <div className="min-h-screen px-4 pt-5 pb-8 md:px-10">
      <div className="mx-auto max-w-[1560px]">
        <CenteredNav active={null} />

        <div className="mx-auto max-w-[820px]">
          <FadeInUp>
            <div className="mb-4">
              <h1 className="text-2xl font-extrabold uppercase tracking-widest">News</h1>
              <p className="mt-1 text-sm font-normal text-muted">
                Was sich bei Medcase gerade tut — kurz und unaufgeregt.
              </p>
            </div>
          </FadeInUp>

          {/* Featured — neuester Eintrag, deutlich größer als der Rest */}
          <FadeInUp>
            <div className="card p-7 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Tag>Neuestes Update</Tag>
                <span className="line-pop text-[11px] font-semibold uppercase tracking-wide text-muted/70" style={{ animationDelay: "80ms" }}>
                  {featured.date}
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ecf0f9] text-accent">
                  <i className={`ti ${featured.icon} text-xl`} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1.5 text-xl font-extrabold leading-snug tracking-tight text-foreground sm:text-2xl">
                    {featured.title}
                  </p>
                  <p className="max-w-[60ch] text-[15px] font-normal leading-relaxed text-muted">
                    {featured.text}
                  </p>
                </div>
              </div>
            </div>
          </FadeInUp>

          {/* Weitere Updates — kompaktes, gestaffelt animiertes Grid */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {rest.map((item, i) => (
              <FadeInUp key={item.title} delay={90 + i * 90}>
                <div className="card flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecf0f9] text-accent">
                        <i className={`ti ${item.icon} text-sm`} />
                      </div>
                      <Tag delay={i * 90}>{item.tag}</Tag>
                    </div>
                  </div>
                  <p className="text-[15px] font-bold leading-snug text-foreground">{item.title}</p>
                  <p className="text-[13px] font-normal leading-relaxed text-muted">{item.text}</p>
                  <span className="mt-auto text-[10.5px] font-semibold uppercase tracking-wide text-muted/60">
                    {item.date}
                  </span>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Footer */}
          <footer
            className="mt-4 flex items-center justify-between border-t border-card-border/15 pt-3"
            style={{ fontSize: 11, color: "#5f5e5a" }}
          >
            <span>© 2026 Medcase</span>
            <div className="flex items-center gap-4">
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
  );
}
