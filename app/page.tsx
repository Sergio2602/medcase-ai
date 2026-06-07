"use client";

import { useState } from "react";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGenerate() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setError("Please enter a medical topic.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/generate-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmedTopic }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      setResult(data.case);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/40 dark:from-slate-950 dark:to-slate-900">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16 sm:py-24">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            MedCase AI
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Generate realistic medical cases for study and practice
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <label htmlFor="topic" className="sr-only">
            Medical topic
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleGenerate();
            }}
            disabled={isLoading}
            placeholder="Enter a medical topic (e.g. acute appendicitis, heart failure)"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
          >
            {isLoading ? "Generating..." : "Generate Case"}
          </button>
        </div>

        <section
          aria-label="Generated case result"
          aria-busy={isLoading}
          className="mt-8 min-h-[280px] flex-1 rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 dark:border-slate-600 dark:bg-slate-800/40"
        >
          {isLoading ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generating clinical case...
              </p>
            </div>
          ) : error ? (
            <p className="text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : result ? (
            <div className="prose prose-slate max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
              {result}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500">
              Your generated case will appear here
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
