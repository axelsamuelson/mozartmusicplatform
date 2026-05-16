"use client";

import { Slider } from "@/components/ui/slider";
import { moodScaleDescriptionSv } from "@/lib/moodScale";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface MoodScaleSliderProps {
  /** Om false visas bara knapp för att aktivera humör. */
  enabled: boolean;
  /** 1–10 när enabled. */
  level: number;
  onEnabledChange: (enabled: boolean) => void;
  onLevelChange: (level: number) => void;
  disabled?: boolean;
  variant?: "default" | "dialog";
}

export function MoodScaleSlider({
  enabled,
  level,
  onEnabledChange,
  onLevelChange,
  disabled,
  variant = "default",
}: MoodScaleSliderProps) {
  const isDialog = variant === "dialog";
  const safe = Math.min(10, Math.max(1, Math.round(level)));
  const blurb = moodScaleDescriptionSv(safe);

  return (
    <div className={cn("flex flex-col", isDialog ? "gap-4" : "gap-3")}>
      <div className="flex flex-col gap-1">
        {isDialog ? (
          <span className="text-sm text-white/60">Humör (valfritt)</span>
        ) : (
          <span className={sectionHeading}>Humör</span>
        )}
        {!isDialog ? (
          <p className="text-xs leading-relaxed text-white/55">
            Dra skalan 1–10 för hur låten känns energimässigt, eller hoppa över.
          </p>
        ) : null}
      </div>

      {!enabled ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnabledChange(true)}
          className={cn(
            "w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75 transition-colors",
            "hover:border-white/25 hover:bg-white/[0.07] hover:text-white",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          + Lägg till humör (skala 1–10)
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "font-bold tabular-nums text-wam",
                isDialog ? "text-2xl" : "text-3xl",
              )}
            >
              {safe}
              <span className="ml-1 text-sm font-medium text-white/45">/ 10</span>
            </span>
          </div>
          <Slider
            min={1}
            max={10}
            step={1}
            value={[safe]}
            onValueChange={(v) => onLevelChange(v[0] ?? safe)}
            disabled={disabled}
            className={cn(
              "py-2 [&_[data-slot=slider-track]]:bg-white/15 [&_[data-slot=slider-range]]:bg-wam/90",
              isDialog ? "[&_[data-slot=slider-thumb]]:size-4" : "",
            )}
          />
          <p
            className={cn(
              "leading-snug text-white/70",
              isDialog ? "min-h-[2.75rem] text-xs" : "text-sm",
            )}
          >
            {blurb}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnabledChange(false)}
            className="self-start text-xs font-medium text-white/45 underline-offset-2 hover:text-white/80 hover:underline"
          >
            Ta bort humör
          </button>
        </div>
      )}
    </div>
  );
}
