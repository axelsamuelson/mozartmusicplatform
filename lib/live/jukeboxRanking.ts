import type { JukeboxRankingMode } from "@/lib/types/live";

export function normalizeJukeboxRankingMode(
  mode?: string | null,
): JukeboxRankingMode {
  return mode === "average" ? "average" : "points";
}
