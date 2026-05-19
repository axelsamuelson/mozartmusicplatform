"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { scoreReadoutClass } from "@/components/ScoreSlider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { normalizeJukeboxRankingMode } from "@/lib/live/jukeboxRanking";
import { liveInitials } from "@/lib/live/userDisplay";
import type { JukeboxRankingMode, LiveScoreRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type JukeboxScoreboardProps = {
  scores: LiveScoreRow[];
  rankingMode?: string | null;
  rankingVisibility?: "full" | "masked" | "end_only" | null;
  userId: string | null;
  hideAvatars?: boolean;
  className?: string;
};

type FloatBonus = { id: string; userId: string; amount: number };

function sortScores(scores: LiveScoreRow[], mode: JukeboxRankingMode): LiveScoreRow[] {
  return [...scores].sort((a, b) => {
    if (mode === "average") {
      const aAvg = a.avg_score;
      const bAvg = b.avg_score;
      if (aAvg == null && bAvg == null) {
        return b.tracks_played - a.tracks_played;
      }
      if (aAvg == null) return 1;
      if (bAvg == null) return -1;
      if (bAvg !== aAvg) return bAvg - aAvg;
      return b.tracks_played - a.tracks_played;
    }
    if (b.points !== a.points) return b.points - a.points;
    return b.tracks_played - a.tracks_played;
  });
}

export function JukeboxScoreboard({
  scores,
  rankingMode,
  rankingVisibility = "full",
  userId,
  hideAvatars,
  className,
}: JukeboxScoreboardProps) {
  const mode = normalizeJukeboxRankingMode(rankingMode);
  const visibility = rankingVisibility ?? "full";

  if (visibility === "end_only") {
    return (
      <section className={cn(glassCard, className)}>
        <h2 className="mb-2 text-center text-xs uppercase tracking-wider text-white/40">
          Ranking
        </h2>
        <p className="py-8 text-center text-sm text-white/45">
          Rankings revealed at session end
        </p>
      </section>
    );
  }
  const prevMetric = useRef<Map<string, number>>(new Map());
  const [floaters, setFloaters] = useState<FloatBonus[]>([]);

  const ranked = useMemo(() => sortScores(scores, mode), [scores, mode]);

  const displayRows = useMemo(() => {
    if (visibility !== "masked") return ranked;
    const top3 = ranked.slice(0, 3);
    const mine = ranked.find((r) => r.user_id === userId);
    if (!mine || top3.some((r) => r.user_id === userId)) return top3;
    return [...top3, mine];
  }, [ranked, visibility, userId]);

  useEffect(() => {
    if (mode !== "points") {
      prevMetric.current = new Map(
        scores.map((row) => [row.user_id, row.avg_score ?? -1]),
      );
      return;
    }

    const next: FloatBonus[] = [];
    for (const row of scores) {
      const prev = prevMetric.current.get(row.user_id);
      if (prev != null && row.points > prev) {
        const delta = row.points - prev;
        if (delta >= 10) {
          next.push({
            id: `${row.user_id}-${row.points}-${Date.now()}`,
            userId: row.user_id,
            amount: delta,
          });
        }
      }
      prevMetric.current.set(row.user_id, row.points);
    }
    if (next.length === 0) return;
    setFloaters((f) => [...f, ...next]);
    const t = window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => !next.some((n) => n.id === x.id)));
    }, 1800);
    return () => window.clearTimeout(t);
  }, [scores, mode]);

  const metricLabel = mode === "average" ? "Avg" : "Pts";

  return (
    <section className={cn(glassCard, className)}>
      <h2 className="mb-1 text-center text-xs uppercase tracking-wider text-white/40">
        Ranking
      </h2>
      <p className="mb-3 text-center text-[10px] text-white/35">
        {mode === "average" ? "By mean group rating" : "By points"}
      </p>

      {displayRows.length === 0 ? (
        <p className="py-4 text-center text-sm text-white/50">
          Everyone starts equal — queue songs to climb the board.
        </p>
      ) : null}

      {displayRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-white/35">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Player</th>
                <th className="pb-2 pr-2 text-right font-medium">{metricLabel}</th>
                <th className="pb-2 text-right font-medium">Played</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => {
                const isMe = row.user_id === userId;
                const floater = floaters.find((f) => f.userId === row.user_id);
                const avg = row.avg_score;
                return (
                  <tr
                    key={row.user_id}
                    className={cn(
                      "border-t border-white/10 transition-colors duration-500",
                      isMe && "bg-wam/10",
                    )}
                  >
                    <td className="py-2 pr-2 tabular-nums text-white/50">{index + 1}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        {!hideAvatars ? (
                          <Avatar className="size-6 border border-white/15">
                            <AvatarFallback
                              className={cn(
                                "bg-white/10 text-[10px]",
                                isMe ? "text-wam" : "text-white",
                              )}
                            >
                              {liveInitials(row.display_name ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                        ) : null}
                        <span
                          className={cn(
                            "max-w-[100px] truncate font-medium transition-colors duration-500",
                            isMe ? "text-wam" : "text-white",
                          )}
                        >
                          {row.display_name ?? "User"}
                        </span>
                        {floater ? (
                          <span className="animate-in fade-in slide-in-from-bottom-2 text-xs font-bold text-wam duration-500">
                            +{floater.amount}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {mode === "average" ? (
                        avg != null ? (
                          <span
                            className={cn(
                              "text-lg font-semibold tabular-nums transition-all duration-500",
                              scoreReadoutClass(avg),
                            )}
                          >
                            {Number(avg).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-white/40">–</span>
                        )
                      ) : (
                        <span
                          className={cn(
                            "text-lg font-semibold tabular-nums transition-all duration-500",
                            isMe ? "text-wam" : "text-white",
                          )}
                        >
                          {row.points}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-white/60 transition-all duration-500">
                      {row.tracks_played}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
