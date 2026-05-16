"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { scoreReadoutClass } from "@/components/ScoreSlider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemType } from "@/lib/spotify/api";
import { dispatchRatingsMutated } from "@/lib/wamRatingEvents";
import type {
  GenreTagRow,
  MomentSubcategory,
  MomentTagRow,
  MoodTagRow,
  RatingDetail,
} from "@/lib/types/ratings";
import { cn } from "@/lib/utils";

type CachedRow = {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
};

const MOMENT_GROUPS: { key: MomentSubcategory; label: string }[] = [
  { key: "place", label: "PLACE" },
  { key: "occasion", label: "OCCASION" },
  { key: "activity", label: "ACTIVITY" },
];

function toggleId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [...ids, id];
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${Number.parseInt(m[1]!, 16)},${Number.parseInt(m[2]!, 16)},${Number.parseInt(m[3]!, 16)},${alpha})`;
}

function stateFromRating(r: RatingDetail | null) {
  return {
    score: r?.score ?? 50,
    comment: r?.comment ?? "",
    genreIds: r?.genres.map((g) => g.id) ?? [],
    moodTagId: r?.mood?.id ?? null,
    momentIds: r?.moments.map((m) => m.id) ?? [],
  };
}

export type NowPlayingRatingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotifyId: string;
  itemType?: ItemType;
  displayTitle: string;
  displayArtist: string;
  displayImageUrl: string | null;
  onRatingUpdated: (rating: RatingDetail | null) => void;
};

export function NowPlayingRatingDialog({
  open,
  onOpenChange,
  spotifyId,
  itemType = "track",
  displayTitle,
  displayArtist,
  displayImageUrl,
  onRatingUpdated,
}: NowPlayingRatingDialogProps) {
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [item, setItem] = useState<CachedRow | null>(null);
  const [rating, setRating] = useState<RatingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState(50);
  const [comment, setComment] = useState("");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [moodTagId, setMoodTagId] = useState<number | null>(null);
  const [momentIds, setMomentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sortedMoods = useMemo(
    () => [...moodTags].sort((a, b) => a.level - b.level),
    [moodTags],
  );

  useEffect(() => {
    if (!open || !spotifyId) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setItem(null);
    setRating(null);

    void (async () => {
      try {
        const [itemRes, tagsRes, ratRes] = await Promise.all([
          fetch(
            `/api/spotify/item/${encodeURIComponent(spotifyId)}?type=${encodeURIComponent(itemType)}`,
            { signal: ac.signal },
          ),
          fetch("/api/tags", { signal: ac.signal }),
          fetch(`/api/ratings?spotify_id=${encodeURIComponent(spotifyId)}`, {
            signal: ac.signal,
          }),
        ]);

        if (ac.signal.aborted) return;

        const tagsBody = (await tagsRes.json().catch(() => ({}))) as {
          error?: string;
          genre_tags?: GenreTagRow[];
          mood_tags?: MoodTagRow[];
          moment_tags?: MomentTagRow[];
        };
        if (!tagsRes.ok) throw new Error(tagsBody.error ?? "Failed to load tags");
        setGenreTags(tagsBody.genre_tags ?? []);
        setMoodTags(tagsBody.mood_tags ?? []);
        setMomentTags(tagsBody.moment_tags ?? []);

        const itemBody = (await itemRes.json().catch(() => ({}))) as {
          error?: string;
          item?: CachedRow;
        };
        if (!itemRes.ok) {
          throw new Error(itemBody.error ?? "Could not load item from Spotify");
        }
        setItem(itemBody.item ?? null);

        const ratBody = (await ratRes.json().catch(() => ({}))) as {
          error?: string;
          rating?: RatingDetail | null;
        };
        if (!ratRes.ok) throw new Error(ratBody.error ?? "Failed to load rating");
        setRating(ratBody.rating ?? null);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [open, spotifyId, itemType]);

  useEffect(() => {
    if (!open) return;
    const s = stateFromRating(rating);
    setScore(s.score);
    setComment(s.comment);
    setGenreIds(s.genreIds);
    setMoodTagId(s.moodTagId);
    setMomentIds(s.momentIds);
  }, [open, rating]);

  const title = item?.name ?? displayTitle;
  const artist = item?.artist_name ?? displayArtist;
  const cover = item?.image_url ?? displayImageUrl ?? null;
  const showRatedBadge = Boolean(rating?.id);
  const isUpdate = Boolean(rating?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          moment_ids: momentIds,
          ...(moodTagId != null ? { mood_tag_id: moodTagId } : {}),
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
        setRating(body.rating);
        onRatingUpdated(body.rating);
        dispatchRatingsMutated();
        toast.success("Rating saved");
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!rating?.id) return;
    if (!window.confirm("Delete this rating? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ratings/${rating.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not delete rating");
        return;
      }
      toast.success("Rating deleted");
      setRating(null);
      onRatingUpdated(null);
      dispatchRatingsMutated();
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  function toggleMood(id: number) {
    setMoodTagId((prev) => (prev === id ? null : id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "!flex !flex-col !gap-0 overflow-hidden border border-white/10 bg-black/85 p-0 text-white shadow-2xl backdrop-blur-2xl",
          "max-h-[90dvh] md:max-h-[88dvh]",
          "max-md:top-auto max-md:right-0 max-md:bottom-0 max-md:left-0 max-md:mt-0 max-md:h-[90dvh] max-md:max-h-[90dvh] max-md:w-full max-md:max-w-none max-md:!translate-x-0 max-md:!translate-y-0 max-md:rounded-t-2xl max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:slide-in-from-bottom-full",
          "md:fixed md:top-1/2 md:left-1/2 md:h-auto md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
        )}
      >
        <DialogTitle className="sr-only">Rate in WAM</DialogTitle>
        <DialogDescription className="sr-only">
          Score, mood, genres, moments, and optional comment for this track.
        </DialogDescription>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden max-md:h-full md:h-auto">
          <DialogClose asChild>
            <button
              type="button"
              className="absolute right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </DialogClose>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="scrollbar-hide touch-scroll-y min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-4 md:pt-5">
              <div
                className="mx-auto mb-4 h-1 w-8 shrink-0 rounded-full bg-white/20 md:hidden"
                aria-hidden
              />

              <div className="flex flex-col gap-5">
                <header className="flex gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/10">
                    {cover ? (
                      <Image
                        src={cover}
                        alt=""
                        width={56}
                        height={56}
                        className="size-14 object-cover"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center text-xs text-white/40">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex-col">
                    <h2 className="truncate text-base font-semibold text-white">{title}</h2>
                    <p className="mt-0.5 truncate text-sm text-white/50">{artist}</p>
                    {showRatedBadge ? (
                      <span
                        className="mt-2 inline-flex w-fit rounded-full border border-wam/30 bg-wam/15 px-2 py-0.5 text-xs font-medium text-wam"
                        aria-live="polite"
                      >
                        Rated {rating?.score ?? ""}
                      </span>
                    ) : null}
                  </div>
                </header>

                {loading ? (
                  <Skeleton className="h-40 w-full rounded-xl bg-white/[0.06]" />
                ) : error ? (
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                ) : (
                  <>
                    <section>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-normal uppercase tracking-wider text-white/40">
                          Score
                        </span>
                        <span
                          className={cn(
                            "text-4xl font-bold tabular-nums tracking-tight transition-colors",
                            scoreReadoutClass(score),
                          )}
                        >
                          {score}
                        </span>
                      </div>
                      <Slider
                        className="mt-3 w-full py-1"
                        min={0}
                        max={100}
                        step={1}
                        value={[score]}
                        onValueChange={(v) => setScore(v[0] ?? 0)}
                        disabled={saving || deleting}
                      />
                    </section>

                    {sortedMoods.length > 0 ? (
                      <section>
                        <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
                          Mood
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sortedMoods.map((m) => {
                            const selected = moodTagId === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                disabled={saving || deleting}
                                onClick={() => toggleMood(m.id)}
                                className={cn(
                                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                                  selected
                                    ? "border"
                                    : "border border-white/10 text-white/40 hover:border-white/25 hover:text-white/70",
                                  (saving || deleting) && "pointer-events-none opacity-50",
                                )}
                                style={
                                  selected
                                    ? {
                                        borderColor: m.color,
                                        backgroundColor: hexToRgba(m.color, 0.2),
                                        color: m.color,
                                      }
                                    : undefined
                                }
                              >
                                {m.name}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
                        Genre
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {genreTags.map((g) => {
                          const on = genreIds.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              disabled={saving || deleting}
                              onClick={() => setGenreIds((prev) => toggleId(prev, g.id))}
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                on
                                  ? "border border-wam bg-wam/10 text-wam"
                                  : "border border-white/10 text-white/50 hover:border-white/25 hover:text-white/70",
                                (saving || deleting) && "pointer-events-none opacity-50",
                              )}
                            >
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section>
                      {MOMENT_GROUPS.map(({ key, label }, i) => {
                        const tags = momentTags.filter((t) => t.subcategory === key);
                        return (
                          <div key={key} className={cn(i < MOMENT_GROUPS.length - 1 && "mb-3")}>
                            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-white/30">
                              {label}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {tags.map((t) => {
                                const on = momentIds.includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    disabled={saving || deleting}
                                    onClick={() =>
                                      setMomentIds((prev) => toggleId(prev, t.id))
                                    }
                                    className={cn(
                                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                      on
                                        ? "border border-wam bg-wam/10 text-wam"
                                        : "border border-white/10 text-white/50 hover:border-white/25 hover:text-white/70",
                                      (saving || deleting) && "pointer-events-none opacity-50",
                                    )}
                                  >
                                    {t.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </section>

                    <section>
                      <label htmlFor="now-playing-rating-comment" className="sr-only">
                        Comment
                      </label>
                      <textarea
                        id="now-playing-rating-comment"
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        disabled={saving || deleting}
                        placeholder="Optional comment…"
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/25"
                      />
                    </section>
                  </>
                )}
              </div>
            </div>

            {!loading && !error ? (
              <footer className="shrink-0 border-t border-white/10 bg-black/50 px-5 pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-sm max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div
                  className={cn(
                    "flex items-center gap-3",
                    isUpdate ? "justify-between" : "justify-end",
                  )}
                >
                  {isUpdate ? (
                    <button
                      type="button"
                      disabled={saving || deleting}
                      onClick={() => void handleDelete()}
                      className="text-xs text-white/30 transition-colors hover:text-red-400 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={saving || deleting}
                    className="rounded-full bg-wam px-6 py-2 text-sm font-semibold text-black transition-colors hover:bg-wam/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </footer>
            ) : null}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
