"use client";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import type {
  GenreTagRow,
  MomentSubcategory,
  MomentTagRow,
  MoodTagRow,
} from "@/lib/types/ratings";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

const MOMENT_GROUPS: { key: MomentSubcategory; label: string }[] = [
  { key: "place", label: "Place" },
  { key: "occasion", label: "Occasion" },
  { key: "activity", label: "Activity" },
];

export interface PlaylistFiltersState {
  filter_genres: string[];
  filter_mood_levels: number[];
  filter_moments: string[];
  filter_min_score: number;
}

export interface PlaylistBuilderProps {
  genreTags: GenreTagRow[];
  moodTags: MoodTagRow[];
  momentTags: MomentTagRow[];
  value: PlaylistFiltersState;
  onChange: (next: PlaylistFiltersState) => void;
  disabled?: boolean;
  className?: string;
}

function toggleString(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function toggleLevel(arr: number[], level: number): number[] {
  return arr.includes(level) ? arr.filter((x) => x !== level) : [...arr, level];
}

export function PlaylistBuilder({
  genreTags,
  moodTags,
  momentTags,
  value,
  onChange,
  disabled,
  className,
}: PlaylistBuilderProps) {
  const sortedMoods = [...moodTags].sort((a, b) => a.level - b.level);

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>Genres</h3>
        <p className="text-xs leading-relaxed text-white/55">
          If none are selected, all genres match. Otherwise a track must include at
          least one selected genre.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {genreTags.map((g) => {
            const on = value.filter_genres.includes(g.name);
            return (
              <Badge
                key={g.id}
                asChild
                variant="outline"
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 hover:scale-[1.02]",
                  on
                    ? "border-transparent bg-white text-black hover:bg-white"
                    : "border-white/20 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      filter_genres: toggleString(value.filter_genres, g.name),
                    })
                  }
                >
                  {g.name}
                </button>
              </Badge>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>Mood levels</h3>
        <p className="text-xs leading-relaxed text-white/55">
          Multi-select. If none are selected, any mood matches.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {sortedMoods.map((m) => {
            const active = value.filter_mood_levels.includes(m.level);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    filter_mood_levels: toggleLevel(value.filter_mood_levels, m.level),
                  })
                }
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all duration-300",
                  active
                    ? "border-white/[0.12] bg-white/[0.07] ring-2 ring-white/25 ring-offset-2 ring-offset-[oklch(0.05_0_0)]"
                    : "border-white/[0.08] bg-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.07]",
                )}
                style={
                  active
                    ? {
                        borderColor: m.color,
                        boxShadow: `0 0 0 2px ${m.color}40`,
                      }
                    : undefined
                }
              >
                <span
                  className="text-xs font-semibold tracking-wide uppercase"
                  style={{ color: m.color }}
                >
                  {m.name}
                </span>
                {m.description ? (
                  <span className="text-[11px] leading-snug text-white/55">
                    {m.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={sectionHeading}>Moments</h3>
        <p className="text-xs leading-relaxed text-white/55">
          If none are selected, any moments match.
        </p>
        {MOMENT_GROUPS.map(({ key, label }) => {
          const tags = momentTags.filter((t) => t.subcategory === key);
          return (
            <div key={key} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-white/70 uppercase">
                {label}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = value.filter_moments.includes(t.name);
                  return (
                    <Badge
                      key={t.id}
                      asChild
                      variant="outline"
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 hover:scale-[1.02]",
                        on
                          ? "border-transparent bg-white/90 text-black hover:bg-white"
                          : "border-white/20 bg-white/5 text-white/85 hover:border-white/30 hover:bg-white/10",
                        disabled && "pointer-events-none opacity-50",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onChange({
                            ...value,
                            filter_moments: toggleString(value.filter_moments, t.name),
                          })
                        }
                      >
                        {t.name}
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <label className={sectionHeading}>Minimum score</label>
          <span className="text-sm tabular-nums text-white">{value.filter_min_score}</span>
        </div>
        <Slider
          disabled={disabled}
          min={0}
          max={100}
          step={1}
          value={[value.filter_min_score]}
          onValueChange={([n]) =>
            onChange({
              ...value,
              filter_min_score: typeof n === "number" ? n : value.filter_min_score,
            })
          }
        />
      </section>
    </div>
  );
}
