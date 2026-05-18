"use client";

import { useMemo, useState } from "react";

import { ScoreSlider } from "@/components/ScoreSlider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GenreTagRow, MoodTagRow } from "@/lib/types/ratings";

export type LiveRatingFormProps = {
  genreTags: GenreTagRow[];
  moodTags: MoodTagRow[];
  initialScore?: number;
  initialMoodId?: number | null;
  initialGenreIds?: number[];
  initialComment?: string;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (payload: {
    score: number;
    mood_tag_id: number | null;
    genre_ids: number[];
    comment: string | null;
  }) => void | Promise<void>;
};

function toggleId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [...ids, id];
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${Number.parseInt(m[1]!, 16)},${Number.parseInt(m[2]!, 16)},${Number.parseInt(m[3]!, 16)},${alpha})`;
}

export function LiveRatingForm({
  genreTags,
  moodTags,
  initialScore = 50,
  initialMoodId = null,
  initialGenreIds = [],
  initialComment = "",
  disabled,
  submitting,
  onSubmit,
}: LiveRatingFormProps) {
  const [score, setScore] = useState(initialScore);
  const [moodTagId, setMoodTagId] = useState<number | null>(initialMoodId);
  const [genreIds, setGenreIds] = useState<number[]>(initialGenreIds);
  const [comment, setComment] = useState(initialComment);

  const sortedMoods = useMemo(
    () => [...moodTags].sort((a, b) => a.level - b.level),
    [moodTags],
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          score,
          mood_tag_id: moodTagId,
          genre_ids: genreIds,
          comment: comment.trim() || null,
        });
      }}
    >
      <ScoreSlider
        value={score}
        onChange={setScore}
        disabled={disabled || submitting}
        variant="dialog"
      />

      {sortedMoods.length > 0 ? (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">Mood</p>
          <div className="flex flex-wrap gap-2">
            {sortedMoods.map((m) => {
              const selected = moodTagId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled || submitting}
                  onClick={() => setMoodTagId((prev) => (prev === m.id ? null : m.id))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected ? "border-transparent text-black" : "border-white/15 text-white/70",
                  )}
                  style={
                    selected
                      ? { backgroundColor: m.color, borderColor: m.color }
                      : { backgroundColor: hexToRgba(m.color, 0.12) }
                  }
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {genreTags.length > 0 ? (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">Genres</p>
          <div className="flex flex-wrap gap-2">
            {genreTags.map((g) => {
              const selected = genreIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={disabled || submitting}
                  onClick={() => setGenreIds((prev) => toggleId(prev, g.id))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selected
                      ? "border-wam bg-wam/20 text-wam"
                      : "border-white/15 text-white/60 hover:border-white/25",
                  )}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <label
          htmlFor="live-comment"
          className="mb-2 block text-xs uppercase tracking-wider text-white/40"
        >
          Comment
        </label>
        <textarea
          id="live-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={disabled || submitting}
          rows={2}
          placeholder="Optional note for the group…"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-wam/50 focus:outline-none focus:ring-1 focus:ring-wam/30"
        />
      </section>

      <Button
        type="submit"
        disabled={disabled || submitting}
        className="w-full rounded-full bg-wam text-black hover:bg-wam/90"
      >
        {submitting ? "Submitting…" : "Submit rating"}
      </Button>
    </form>
  );
}
