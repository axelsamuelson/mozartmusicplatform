"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { scoreReadoutClass } from "@/components/ScoreSlider";
import { TagPicker } from "@/components/TagPicker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { ItemType } from "@/lib/spotify/api";
import { fetchWithRetry, userFacingFetchError } from "@/lib/http/fetchRetry";
import { loadTagsCatalog, peekCachedTags } from "@/lib/ratings/tagsCache";
import { dispatchRatingsMutated } from "@/lib/wamRatingEvents";
import type {
  GenreTagRow,
  MomentTagRow,
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

function stateFromRating(r: RatingDetail | null) {
  return {
    score: r?.score ?? 50,
    comment: r?.comment ?? "",
    genreIds: r?.genres.map((g) => g.id) ?? [],
    tempo: r?.tempo ?? null,
    intensity: r?.intensity ?? null,
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
  const cachedTags = peekCachedTags();
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>(
    () => cachedTags?.genre_tags ?? [],
  );
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>(
    () => cachedTags?.moment_tags ?? [],
  );
  const [item, setItem] = useState<CachedRow | null>(null);
  const [rating, setRating] = useState<RatingDetail | null>(null);
  const [loadingRating, setLoadingRating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const [score, setScore] = useState(50);
  const [comment, setComment] = useState("");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [tempo, setTempo] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [momentIds, setMomentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !spotifyId) return;
    const ac = new AbortController();
    dirtyRef.current = false;
    setError(null);
    setItem(null);
    setRating(null);
    setLoadingRating(true);

    void (async () => {
      try {
        const [itemRes, catalog, ratRes] = await Promise.all([
          fetchWithRetry(
            `/api/spotify/item/${encodeURIComponent(spotifyId)}?type=${encodeURIComponent(itemType)}`,
            { signal: ac.signal },
          ),
          loadTagsCatalog(),
          fetchWithRetry(
            `/api/ratings?spotify_id=${encodeURIComponent(spotifyId)}&lite=1`,
            { signal: ac.signal },
          ),
        ]);

        if (ac.signal.aborted) return;

        setGenreTags(catalog.genre_tags);
        setMomentTags(catalog.moment_tags);

        const itemBody = (await itemRes.json().catch(() => ({}))) as {
          error?: string;
          item?: CachedRow;
        };
        if (itemRes.ok && itemBody.item) setItem(itemBody.item);

        const ratBody = (await ratRes.json().catch(() => ({}))) as {
          error?: string;
          rating?: RatingDetail | null;
        };
        if (!ratRes.ok) throw new Error(ratBody.error ?? "Failed to load rating");
        const nextRating = ratBody.rating ?? null;
        setRating(nextRating);
        if (!dirtyRef.current) {
          const s = stateFromRating(nextRating);
          setScore(s.score);
          setComment(s.comment);
          setGenreIds(s.genreIds);
          setTempo(s.tempo);
          setIntensity(s.intensity);
          setMomentIds(s.momentIds);
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(userFacingFetchError(e, "Could not load rating. You can still save."));
      } finally {
        if (!ac.signal.aborted) setLoadingRating(false);
      }
    })();

    return () => ac.abort();
  }, [open, spotifyId, itemType]);

  useEffect(() => {
    if (!open) dirtyRef.current = false;
  }, [open]);

  const title = item?.name ?? displayTitle;
  const artist = item?.artist_name ?? displayArtist;
  const cover = item?.image_url ?? displayImageUrl ?? null;
  const showRatedBadge = Boolean(rating?.id);
  const isUpdate = Boolean(rating?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const savedForId = spotifyId;
    const previousRating = rating;
    const optimistic: RatingDetail = {
      id: rating?.id ?? `optimistic-${spotifyId}`,
      spotify_id: spotifyId,
      score,
      comment: comment.trim() || null,
      created_at: rating?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tempo,
      intensity,
      genres: genreTags.filter((g) => genreIds.includes(g.id)),
      mood: rating?.mood ?? null,
      moments: momentTags.filter((m) => momentIds.includes(m.id)),
      item: rating?.item ?? null,
    };
    setSaving(true);
    onRatingUpdated(optimistic);
    onOpenChange(false);
    try {
      const res = await fetchWithRetry("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotify_id: savedForId,
          score,
          comment: comment.trim() || null,
          tempo,
          intensity,
          genre_ids: genreIds,
          moment_ids: momentIds,
          item: {
            type: itemType,
            name: title,
            artist_name: artist || null,
            image_url: cover,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        rating?: RatingDetail;
      };
      if (!res.ok || !body.rating) {
        if (savedForId === spotifyId) {
          onRatingUpdated(previousRating);
          onOpenChange(true);
        }
        toast.error(body.error || "Could not save rating");
        return;
      }
      setRating(body.rating);
      onRatingUpdated(body.rating);
      dispatchRatingsMutated();
      toast.success("Rating saved");
    } catch (e) {
      if (savedForId === spotifyId) {
        onRatingUpdated(previousRating);
        onOpenChange(true);
      }
      toast.error(userFacingFetchError(e, "Could not save rating. Try again."));
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
          Score, tempo, intensity, genres, moments, and optional comment for this track.
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

                {error ? (
                  <p className="text-sm text-amber-300/90" role="alert">
                    {error}
                  </p>
                ) : null}

                {loadingRating && !rating ? (
                  <p className="text-[11px] text-white/35">Loading previous rating…</p>
                ) : null}

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
                        onValueChange={(v) => {
                          dirtyRef.current = true;
                          setScore(v[0] ?? 0);
                        }}
                        disabled={saving || deleting}
                      />
                    </section>

                    <TagPicker
                      genreTags={genreTags}
                      momentTags={momentTags}
                      selectedGenreIds={genreIds}
                      selectedMomentIds={momentIds}
                      onGenresChange={(ids) => {
                        dirtyRef.current = true;
                        setGenreIds(ids);
                      }}
                      onMomentsChange={(ids) => {
                        dirtyRef.current = true;
                        setMomentIds(ids);
                      }}
                      tempo={tempo}
                      intensity={intensity}
                      onTempoIntensityChange={(t, i) => {
                        dirtyRef.current = true;
                        setTempo(t);
                        setIntensity(i);
                      }}
                      disabled={saving || deleting}
                      visualVariant="dialog"
                    />

                    <section>
                      <label htmlFor="now-playing-rating-comment" className="sr-only">
                        Comment
                      </label>
                      <textarea
                        id="now-playing-rating-comment"
                        rows={2}
                        value={comment}
                        onChange={(e) => {
                          dirtyRef.current = true;
                          setComment(e.target.value);
                        }}
                        disabled={saving || deleting}
                        placeholder="Optional comment…"
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/25"
                      />
                    </section>
              </div>
            </div>

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
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
