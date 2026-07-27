import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fall-Review — Medcase",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = "" } = await searchParams;
  const required = process.env.REVIEW_ACCESS_KEY;

  // Zugangs-Gate: Ist ein Key gesetzt, muss der Link-Parameter passen.
  if (required && key !== required) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
          <i className="ti ti-lock text-2xl" />
        </span>
        <h1 className="text-xl font-extrabold">Zugang nur für Reviewer</h1>
        <p className="mt-2 text-sm text-muted">
          Diese Seite ist für eingeladene Assistenzärzt:innen und Dozent:innen. Bitte
          nutze den vollständigen Link, den du erhalten hast.
        </p>
      </div>
    );
  }

  return <ReviewClient accessKey={key} />;
}
