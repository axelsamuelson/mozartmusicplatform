"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { VIBE_PRESETS } from "@/lib/playlist/tempoIntensityPresets";
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

export interface PlaylistFiltersState {
  filter_genres: string[];
  filter_moments: string[];
  filter_min_score: number;
  filter_vibes: string[];
  filter_tempo_min: number | null;
  filter_tempo_max: number | null;
  filter_intensity_min: number | null;
  filter_intensity_max: number | null;
}

export interface PlaylistBuilderProps {
  genreTags: GenreTagRow[];
  momentTags: MomentTagRow[];
  value: PlaylistFiltersState;
  onChange: (next: PlaylistFiltersState) => void;
  disabled?: boolean;
  className?: string;
}

function toggleString(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function RangeRow({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  disabled,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onMinChange: (v: number | null) => void;
  onMaxChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const minVal = min ?? 1;
  const maxVal = max ?? 10;
  const active = min != null || max != null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-white/50">
          {label}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (active) {
              onMinChange(null);
              onMaxChange(null);
            } else {
              onMinChange(1);
              onMaxChange(10);
            }
          }}
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide transition-colors",
            active ? "text-wam" : "text-white/40 hover:text-white/60",
          )}
        >
          {active ? "Clear" : "Any"}
        </button>
      </div>
      {active ? (
        <>
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Min {minVal}</span>
            <span>Max {maxVal}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] text-white/40">Minimum</p>
              <Slider
                min={1}
                max={10}
                step={1}
                disabled={disabled}
                value={[minVal]}
                onValueChange={([v]) => {
                  const next = v ?? 1;
                  onMinChange(next);
                  if (max != null && next > max) onMaxChange(next);
                }}
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] text-white/40">Maximum</p>
              <Slider
                min={1}
                max={10}
                step={1}
                disabled={disabled}
                value={[maxVal]}
                onValueChange={([v]) => {
                  const next = v ?? 10;
                  onMaxChange(next);
                  if (min != null && next < min) onMinChange(next);
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-white/40">No {label.toLowerCase()} limit</p>
      )}
    </div>
  );
}

export function PlaylistBuilder({
  genreTags,
  momentTags,
  value,
  onChange,
  disabled,
  className,
}: PlaylistBuilderProps) {
  const [showCustomRange, setShowCustomRange] = useState(
    Boolean(
      value.filter_tempo_min != null ||
        value.filter_tempo_max != null ||
        value.filter_intensity_min != null ||
        value.filter_intensity_max != null,
    ),
  );

  function selectVibe(id: string) {
    onChange({
      ...value,
      filter_vibes: toggleString(value.filter_vibes, id),
      filter_tempo_min: null,
      filter_tempo_max: null,
      filter_intensity_min: null,
      filter_intensity_max: null,
    });
    setShowCustomRange(false);
  }

  function updateCustom(patch: Partial<PlaylistFiltersState>) {
    onChange({
      ...value,
      ...patch,
      filter_vibes: [],
    });
    setShowCustomRange(true);
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>Vibe</h3>
        <p className="text-xs leading-relaxed text-white/55">
          Match tracks by tempo and intensity. Select one or more vibes (OR). Tracks
          without tempo/intensity ratings are excluded when a vibe filter is active.
        </p>
        <div className="flex flex-wrap gap-2">
          {VIBE_PRESETS.map((preset) => {
            const on = value.filter_vibes.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => selectVibe(preset.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  on
                    ? preset.pillClass
                    : "border-white/15 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowCustomRange((v) => !v)}
          className="w-fit text-xs text-white/45 underline-offset-2 hover:text-wam hover:underline"
        >
          {showCustomRange ? "Hide custom ranges" : "Fine-tune with custom ranges"}
        </button>
        {showCustomRange ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeRow
              label="Tempo"
              min={value.filter_tempo_min}
              max={value.filter_tempo_max}
              disabled={disabled}
              onMinChange={(v) => updateCustom({ filter_tempo_min: v })}
              onMaxChange={(v) => updateCustom({ filter_tempo_max: v })}
            />
            <RangeRow
              label="Intensity"
              min={value.filter_intensity_min}
              max={value.filter_intensity_max}
              disabled={disabled}
              onMinChange={(v) => updateCustom({ filter_intensity_min: v })}
              onMaxChange={(v) => updateCustom({ filter_intensity_max: v })}
            />
          </div>
        ) : null}
      </section>

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
