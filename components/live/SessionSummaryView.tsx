"use client";

import { useEffect, useState } from "react";

import type { SessionSummaryPayload } from "@/lib/live/sessionSummary";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

const TITLE_CARDS: {
  key: keyof SessionSummaryPayload;
  emoji: string;
  label: string;
}[] = [
  { key: "crowdPleaser", emoji: "🏆", label: "Crowd Pleaser" },
  { key: "worstDj", emoji: "💀", label: "Worst DJ" },
  { key: "hotTake", emoji: "🔥", label: "Hot Take" },
  { key: "mindReader", emoji: "🎯", label: "Mind Reader" },
  { key: "speedRater", emoji: "⚡", label: "Speed Rater" },
  { key: "mostControversial", emoji: "💥", label: "Most Controversial" },
];

export function SessionSummaryView({
  summary,
  revealRanking,
}: {
  summary: SessionSummaryPayload;
  revealRanking: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (visibleCount >= TITLE_CARDS.length) return;
    const t = window.setTimeout(() => setVisibleCount((c) => c + 1), 500);
    return () => window.clearTimeout(t);
  }, [visibleCount]);

  useEffect(() => {
    if (!revealRanking || countdown === null) return;
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, revealRanking]);

  const mins = Math.floor(summary.durationMs / 60000);

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h2 className="text-3xl font-bold text-white">Session complete 🎵</h2>
        <p className="mt-2 text-sm text-white/50">
          {mins} min · {summary.tracksPlayed} tracks · {summary.ratingsCount} ratings
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {TITLE_CARDS.map((card, i) => {
          if (i >= visibleCount) return null;
          const data = summary[card.key];
          const name =
            data && typeof data === "object" && "displayName" in data
              ? (data as { displayName: string }).displayName
              : data && typeof data === "object" && "trackName" in data
                ? (data as { trackName: string }).trackName
                : "—";
          return (
            <div
              key={card.key}
              className={cn(glassCard, "animate-in fade-in slide-in-from-bottom-4 duration-500")}
            >
              <span className="text-2xl">{card.emoji}</span>
              <p className="mt-2 text-xs uppercase tracking-wider text-white/40">{card.label}</p>
              <p className="mt-1 font-medium text-white">{name}</p>
            </div>
          );
        })}
      </div>

      {summary.bestTrack ? (
        <section className={cn(glassCard, "text-center")}>
          <p className="text-xs uppercase tracking-wider text-white/40">Best track</p>
          <p className="mt-2 text-xl font-semibold text-white">{summary.bestTrack.trackName}</p>
          <p className="text-sm text-white/50">{summary.bestTrack.artistName}</p>
          <p className="mt-2 text-2xl font-bold text-wam">
            {summary.bestTrack.avg.toFixed(0)} avg
          </p>
        </section>
      ) : null}

      {revealRanking && countdown !== null && countdown > 0 ? (
        <p className="text-center text-lg text-amber-300">
          Revealing rankings in {countdown}…
        </p>
      ) : null}

      <button
        type="button"
        className="mx-auto block text-sm text-wam hover:underline"
        onClick={() => setCountdown(3)}
      >
        {revealRanking && countdown === null ? "Reveal rankings" : null}
      </button>
    </div>
  );
}
