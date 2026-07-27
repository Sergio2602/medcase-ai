"use client";

import type { ReviewSession } from "@/lib/reviewMode";

// Schlanke Leiste, die im Review-Modus dauerhaft oben sitzt: zeigt an, dass
// gerade bewertet wird, und bietet "Feedback abschließen" (Produktfragen) +
// "Beenden".
export function ReviewModeBar({
  session,
  onFeedback,
  onEnd,
}: {
  session: ReviewSession;
  onFeedback: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-[1.5px] border-accent/30 bg-[#ecf0f9] px-4 py-2.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-accent">
        <i className="ti ti-clipboard-check text-base" />
        Review-Modus · {session.reviewer.name}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onFeedback}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-bold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Feedback abschließen
        </button>
        <button
          onClick={onEnd}
          className="rounded-lg border-[1.5px] border-accent/30 px-3 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:bg-white/50"
        >
          Beenden
        </button>
      </div>
    </div>
  );
}
