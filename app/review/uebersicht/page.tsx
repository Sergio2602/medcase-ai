import { Redis } from "@upstash/redis";
import {
  UebersichtClient,
  type CaseReview,
  type SessionFeedback,
  type StudentFeedback,
  type WaitlistEntry,
} from "./UebersichtClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review-Übersicht — Medcase",
  robots: { index: false, follow: false },
};

async function loadAll() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN)
    return { cases: [], sessions: [], students: [], waitlist: [], ok: false };
  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  try {
    const [caseKeys, sessionKeys, studentKeys, waitlistKeys] = await Promise.all([
      redis.keys("caseReviews:*"),
      redis.keys("sessionFeedback:*"),
      redis.keys("studentFeedback:*"),
      redis.keys("waitlist:*"),
    ]);
    const cases = caseKeys.length ? ((await redis.mget(...caseKeys)) as CaseReview[]) : [];
    const sessions = sessionKeys.length
      ? ((await redis.mget(...sessionKeys)) as SessionFeedback[])
      : [];
    const students = studentKeys.length
      ? ((await redis.mget(...studentKeys)) as StudentFeedback[])
      : [];
    const waitlist = waitlistKeys.length
      ? ((await redis.mget(...waitlistKeys)) as WaitlistEntry[])
      : [];
    cases.sort((a, b) => (b?.timestamp ?? "").localeCompare(a?.timestamp ?? ""));
    sessions.sort((a, b) => (b?.timestamp ?? "").localeCompare(a?.timestamp ?? ""));
    return {
      cases: cases.filter(Boolean),
      sessions: sessions.filter(Boolean),
      students: students.filter(Boolean),
      waitlist: waitlist.filter(Boolean),
      ok: true,
    };
  } catch {
    return { cases: [], sessions: [], students: [], waitlist: [], ok: false };
  }
}

export default async function UebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = "" } = await searchParams;
  const required = process.env.REVIEW_ACCESS_KEY;

  if (required && key !== required) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
          <i className="ti ti-lock text-2xl" />
        </span>
        <h1 className="text-xl font-extrabold">Zugang nur mit Schlüssel</h1>
        <p className="mt-2 text-sm text-muted">Bitte nutze den vollständigen Übersichts-Link.</p>
      </div>
    );
  }

  const { cases, sessions, students, waitlist } = await loadAll();
  return (
    <UebersichtClient
      cases={cases}
      sessions={sessions}
      students={students}
      waitlist={waitlist}
    />
  );
}
