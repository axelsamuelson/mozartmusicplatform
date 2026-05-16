"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MoodScaleSlider } from "@/components/MoodScaleSlider";
import { ScoreSlider } from "@/components/ScoreSlider";
import { TagPicker } from "@/components/TagPicker";
import { Button } from "@/components/ui/button";
import type {
  GenreTagRow,
  MomentTagRow,
  MoodTagRow,
  RatingDetail,
} from "@/lib/types/ratings";
import { moodSliderFromDbLevel, moodTagIdFromScale } from "@/lib/moodScale";
import { dispatchRatingsMutated } from "@/lib/wamRatingEvents";
import { glassPanel, sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface RatingFormProps {
  spotifyId: string;
  genreTags: GenreTagRow[];
  moodTags: MoodTagRow[];
  momentTags: MomentTagRow[];
  initialRating: RatingDetail | null;
  onSaved: (rating: RatingDetail) => void;
  onDeleted?: () => void;
  className?: string;
  /** `dialog`: compact tags / score, no outer glass panel, WAM-styled actions. */
  presentation?: "page" | "dialog";
}

function stateFromRating(r: RatingDetail | null) {
  const moodOn = Boolean(r?.mood);
  const moodLevel = r?.mood ? moodSliderFromDbLevel(r.mood.level) : 5;
  return {
    score: r?.score ?? 50,
    comment: r?.comment ?? "",
    genreIds: r?.genres.map((g) => g.id) ?? [],
    moodOn,
    moodLevel,
    momentIds: r?.moments.map((m) => m.id) ?? [],
  };
}

export function RatingForm({
  spotifyId,
  genreTags,
  moodTags,
  momentTags,
  initialRating,
  onSaved,
  onDeleted,
  className,
  presentation = "page",
}: RatingFormProps) {
  const isDialog = presentation === "dialog";
  const [score, setScore] = useState(50);
  const [comment, setComment] = useState("");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [moodOn, setMoodOn] = useState(false);
  const [moodLevel, setMoodLevel] = useState(5);
  const [momentIds, setMomentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const s = stateFromRating(initialRating);
    setScore(s.score);
    setComment(s.comment);
    setGenreIds(s.genreIds);
    setMoodOn(s.moodOn);
    setMoodLevel(s.moodLevel);
    setMomentIds(s.momentIds);
  }, [initialRating]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let moodTagId: number | null = null;
    if (moodOn) {
      moodTagId = moodTagIdFromScale(moodTags, moodLevel);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotify_id: spotifyId,
          score,
          comment: comment.trim() || null,
          genre_ids: genreIds,
          ...(moodTagId != null ? { mood_tag_id: moodTagId } : {}),
          moment_ids: momentIds,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        rating?: RatingDetail;
      };
      if (!res.ok) {
        toast.error(body.error || "Could not save rating");
        return;
      }
      if (body.rating) {
        onSaved(body.rating);
        dispatchRatingsMutated();
        toast.success("Rating saved");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialRating?.id) return;
    if (!window.confirm("Delete this rating? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/ratings/${initialRating.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not delete rating");
        return;
      }
      toast.success("Rating deleted");
      onDeleted?.();
      dispatchRatingsMutated();
    } finally {
      setDeleting(false);
    }
  }

  const isUpdate = Boolean(initialRating?.id);

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col",
        isDialog ? "gap-6" : "gap-8",
        !isDialog && glassPanel,
        className,
      )}
    >
      <ScoreSlider
        value={score}
        onChange={setScore}
        disabled={saving || deleting}
        variant={isDialog ? "dialog" : "default"}
      />

      <MoodScaleSlider
        enabled={moodOn}
        level={moodLevel}
        onEnabledChange={(on) => {
          setMoodOn(on);
          if (on) setMoodLevel((lv) => (lv < 1 || lv > 10 ? 5 : lv));
        }}
        onLevelChange={setMoodLevel}
        disabled={saving || deleting}
        variant={isDialog ? "dialog" : "default"}
      />

      <TagPicker
        genreTags={genreTags}
        momentTags={momentTags}
        selectedGenreIds={genreIds}
        selectedMomentIds={momentIds}
        onGenresChange={setGenreIds}
        onMomentsChange={setMomentIds}
        disabled={saving || deleting}
        visualVariant={isDialog ? "dialog" : "default"}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="rating-comment" className={isDialog ? "text-sm text-white/60" : sectionHeading}>
          Comment {!isDialog ? <span className="font-normal text-white/50">(optional)</span> : null}
        </label>
        <textarea
          id="rating-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={saving || deleting}
          placeholder="Notes, context, anything…"
          className={cn(
            "min-h-[5rem] w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white shadow-none transition-colors outline-none",
            "placeholder:text-white/40",
            "focus-visible:border-white/35 focus-visible:ring-[3px] focus-visible:ring-white/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      <div className={cn("flex flex-wrap items-center gap-3", isDialog && "pt-1")}>
        <Button
          type="submit"
          disabled={saving || deleting}
          size={isDialog ? "default" : "lg"}
          className={
            isDialog
              ? "rounded-full bg-wam px-6 py-2 font-medium text-black hover:bg-wam/90"
              : "rounded-full bg-white px-8 py-3 text-base font-medium text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-gray-50 hover:shadow-lg disabled:scale-100"
          }
        >
          {saving ? "Saving…" : isUpdate ? "Update rating" : "Save rating"}
        </Button>
        {isUpdate ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving || deleting}
            onClick={handleDelete}
            className={
              isDialog
                ? "rounded-full text-white/40 hover:bg-transparent hover:text-red-400"
                : "rounded-full border border-white/25 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
            }
          >
            {deleting ? "Deleting…" : "Delete rating"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
