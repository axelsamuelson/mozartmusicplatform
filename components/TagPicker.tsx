"use client";

import { useEffect, useMemo, useState } from "react";

import { TempoIntensitySlider } from "@/components/TempoIntensitySlider";
import { Badge } from "@/components/ui/badge";
import {
  getTopSuggestions,
  sortMomentTagsWithSuggestions,
} from "@/lib/ratings/tagSuggestions";
import { sortGenreTagsByPopularity } from "@/lib/ratings/topGenres";
import {
  invalidateTopGenreIdsCache,
  loadTopGenreIdsCached,
  peekTopGenreIds,
} from "@/lib/ratings/topGenresCache";
import { WAM_RATINGS_MUTATED } from "@/lib/wamRatingEvents";
import type {
  GenreTagRow,
  MomentSubcategory,
  MomentTagRow,
} from "@/lib/types/ratings";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

const MOMENT_GROUPS: { key: MomentSubcategory; label: string }[] = [
  { key: "place", label: "Place" },
  { key: "occasion", label: "Occasion" },
  { key: "activity", label: "Activity" },
];

export interface TagPickerProps {
  genreTags: GenreTagRow[];
  momentTags: MomentTagRow[];
  selectedGenreIds: number[];
  selectedMomentIds: number[];
  onGenresChange: (ids: number[]) => void;
  onMomentsChange: (ids: number[]) => void;
  tempo: number | null;
  intensity: number | null;
  onTempoIntensityChange: (tempo: number, intensity: number) => void;
  disabled?: boolean;
  className?: string;
  visualVariant?: "default" | "dialog";
  showTempoIntensity?: boolean;
}

function toggleId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [...ids, id];
}

function GenreChip({
  genre,
  selected,
  popular,
  isDialog,
  disabled,
  onToggle,
}: {
  genre: GenreTagRow;
  selected: boolean;
  popular: boolean;
  isDialog: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Badge
      asChild
      variant="outline"
      className={cn(
        "cursor-pointer rounded-full font-medium transition-colors",
        isDialog
          ? cn(
              "border px-3 py-1 text-xs",
              selected
                ? popular
                  ? "border-violet-300 bg-violet-400/90 text-black hover:bg-violet-300"
                  : "border-wam bg-wam/10 text-wam hover:bg-wam/15"
                : popular
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-200 hover:border-violet-300/70 hover:text-violet-100"
                  : "border-white/15 text-white/60 hover:border-white/30 hover:text-white",
            )
          : cn(
              "border px-2.5 py-1 text-xs transition-all duration-200 hover:scale-[1.02]",
              selected
                ? popular
                  ? "border-transparent bg-violet-300 text-black hover:bg-violet-200"
                  : "border-transparent bg-white text-black hover:bg-white"
                : popular
                  ? "border-violet-400/45 bg-violet-500/20 text-violet-100 hover:border-violet-300/70 hover:bg-violet-500/30"
                  : "border-white/20 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10",
            ),
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <button type="button" disabled={disabled} onClick={onToggle}>
        {genre.name}
      </button>
    </Badge>
  );
}

export function TagPicker({
  genreTags,
  momentTags,
  selectedGenreIds,
  selectedMomentIds,
  onGenresChange,
  onMomentsChange,
  tempo,
  intensity,
  onTempoIntensityChange,
  disabled,
  className,
  visualVariant = "default",
  showTempoIntensity = true,
}: TagPickerProps) {
  const isDialog = visualVariant === "dialog";
  const [topGenreIds, setTopGenreIds] = useState<number[]>(
    () => peekTopGenreIds() ?? [],
  );

  useEffect(() => {
    let cancelled = false;

    function loadTopGenres() {
      void loadTopGenreIdsCached().then((ids) => {
        if (!cancelled) setTopGenreIds(ids);
      });
    }

    loadTopGenres();
    function onMutated() {
      invalidateTopGenreIdsCache();
      loadTopGenres();
    }
    window.addEventListener(WAM_RATINGS_MUTATED, onMutated);
    return () => {
      cancelled = true;
      window.removeEventListener(WAM_RATINGS_MUTATED, onMutated);
    };
  }, []);

  const suggestions = useMemo(() => {
    if (tempo == null || intensity == null) return [];
    return getTopSuggestions(tempo, intensity);
  }, [tempo, intensity]);

  const { top: popularGenres, rest: otherGenres } = useMemo(
    () => sortGenreTagsByPopularity(genreTags, topGenreIds),
    [genreTags, topGenreIds],
  );

  return (
    <div className={cn("flex flex-col", isDialog ? "gap-6" : "gap-8", className)}>
      {showTempoIntensity ? (
        <TempoIntensitySlider
          tempo={tempo}
          intensity={intensity}
          onChange={onTempoIntensityChange}
          disabled={disabled}
          variant={isDialog ? "dialog" : "default"}
        />
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className={isDialog ? "text-sm text-white/60" : sectionHeading}>Genre</h3>
        {!isDialog ? (
          <p className="text-xs leading-relaxed text-white/55">
            Pick any genres that fit (optional).
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {popularGenres.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p
                className={cn(
                  "font-medium uppercase tracking-wide text-violet-300/80",
                  isDialog ? "text-[10px]" : "text-[11px]",
                )}
              >
                Most used
              </p>
              <div className={cn("flex flex-wrap", isDialog ? "gap-2" : "gap-1.5")}>
                {popularGenres.map((g) => (
                  <GenreChip
                    key={g.id}
                    genre={g}
                    popular
                    selected={selectedGenreIds.includes(g.id)}
                    isDialog={isDialog}
                    disabled={disabled}
                    onToggle={() =>
                      onGenresChange(toggleId(selectedGenreIds, g.id))
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className={cn("flex flex-wrap", isDialog ? "gap-2" : "gap-1.5")}>
            {otherGenres.map((g) => (
              <GenreChip
                key={g.id}
                genre={g}
                popular={false}
                selected={selectedGenreIds.includes(g.id)}
                isDialog={isDialog}
                disabled={disabled}
                onToggle={() =>
                  onGenresChange(toggleId(selectedGenreIds, g.id))
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={isDialog ? "text-sm text-white/60" : sectionHeading}>Moment</h3>
        {!isDialog ? (
          <p className="text-xs leading-relaxed text-white/55">
            Place, occasion, and activity — pick any that apply (optional).
          </p>
        ) : null}
        {MOMENT_GROUPS.map(({ key, label }) => {
          const tags = momentTags.filter((t) => t.subcategory === key);
          const sorted = sortMomentTagsWithSuggestions(tags, suggestions);
          return (
            <div key={key} className="flex flex-col gap-2">
              <h4
                className={cn(
                  "font-medium uppercase",
                  isDialog
                    ? "text-xs tracking-wider text-white/40"
                    : "text-xs font-semibold tracking-wide text-white/70",
                )}
              >
                {label}
              </h4>
              <div className={cn("flex flex-wrap", isDialog ? "gap-2" : "gap-1.5")}>
                {sorted.map(({ tag: t, suggested }) => {
                  const on = selectedMomentIds.includes(t.id);
                  return (
                    <Badge
                      key={t.id}
                      asChild
                      variant="outline"
                      className={cn(
                        "cursor-pointer rounded-full font-medium transition-colors",
                        isDialog
                          ? cn(
                              "border px-3 py-1 text-xs",
                              on
                                ? "border-wam bg-wam/10 text-wam hover:bg-wam/15"
                                : suggested
                                  ? "border-wam/40 bg-wam/10 text-wam/70 hover:border-wam/50"
                                  : "border-white/15 text-white/60 hover:border-white/30 hover:text-white",
                            )
                          : cn(
                              "border px-2.5 py-1 text-xs transition-all duration-200 hover:scale-[1.02]",
                              on
                                ? "border-transparent bg-white/90 text-black hover:bg-white"
                                : suggested
                                  ? "border-wam/40 bg-wam/10 text-wam/80 hover:border-wam/50"
                                  : "border-white/20 bg-white/5 text-white/85 hover:border-white/30 hover:bg-white/10",
                            ),
                        disabled && "pointer-events-none opacity-50",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onMomentsChange(toggleId(selectedMomentIds, t.id))
                        }
                        className="inline-flex items-center gap-1"
                      >
                        {t.name}
                        {suggested && !on ? (
                          <span className="rounded-full border border-wam/40 bg-wam/10 px-1 py-px text-[10px] font-normal uppercase tracking-wide text-wam/70">
                            Suggested
                          </span>
                        ) : null}
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
