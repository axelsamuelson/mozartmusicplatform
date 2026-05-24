"use client";

import { useState } from "react";

import { ScoreSlider } from "@/components/ScoreSlider";
import { TagPicker } from "@/components/TagPicker";
import { Button } from "@/components/ui/button";

export type LiveRatingFormProps = {
  genreTags: import("@/lib/types/ratings").GenreTagRow[];
  momentTags: import("@/lib/types/ratings").MomentTagRow[];
  initialScore?: number;
  initialTempo?: number | null;
  initialIntensity?: number | null;
  initialGenreIds?: number[];
  initialMomentIds?: number[];
  initialComment?: string;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (payload: {
    score: number;
    tempo: number | null;
    intensity: number | null;
    genre_ids: number[];
    moment_ids: number[];
    comment: string | null;
  }) => void | Promise<void>;
};

export function LiveRatingForm({
  genreTags,
  momentTags,
  initialScore = 50,
  initialTempo = null,
  initialIntensity = null,
  initialGenreIds = [],
  initialMomentIds = [],
  initialComment = "",
  disabled,
  submitting,
  onSubmit,
}: LiveRatingFormProps) {
  const [score, setScore] = useState(initialScore);
  const [tempo, setTempo] = useState<number | null>(initialTempo);
  const [intensity, setIntensity] = useState<number | null>(initialIntensity);
  const [genreIds, setGenreIds] = useState<number[]>(initialGenreIds);
  const [momentIds, setMomentIds] = useState<number[]>(initialMomentIds);
  const [comment, setComment] = useState(initialComment);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          score,
          tempo,
          intensity,
          genre_ids: genreIds,
          moment_ids: momentIds,
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

      <TagPicker
        genreTags={genreTags}
        momentTags={momentTags}
        selectedGenreIds={genreIds}
        selectedMomentIds={momentIds}
        onGenresChange={setGenreIds}
        onMomentsChange={setMomentIds}
        tempo={tempo}
        intensity={intensity}
        onTempoIntensityChange={(t, i) => {
          setTempo(t);
          setIntensity(i);
        }}
        disabled={disabled || submitting}
        visualVariant="dialog"
        showTempoIntensity
      />

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
