"use client";

import { useMemo } from "react";

import { Slider } from "@/components/ui/slider";
import {
  comboDescriptor,
  intensityLabel,
  scaleValueColorClass,
  tempoLabel,
} from "@/lib/ratings/tempoIntensityUi";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface TempoIntensitySliderProps {
  tempo: number | null;
  intensity: number | null;
  onChange: (tempo: number, intensity: number) => void;
  disabled?: boolean;
  variant?: "default" | "dialog" | "compact";
}

function clampScale(v: number | null, fallback = 5): number {
  if (v == null || !Number.isFinite(v)) return fallback;
  return Math.min(10, Math.max(1, Math.round(v)));
}

function ScaleRow({
  label,
  value,
  onValueChange,
  valueLabel,
  disabled,
  compact,
}: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  valueLabel: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "font-medium uppercase tracking-wider text-white/50",
            compact ? "text-[10px]" : "text-xs",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "font-bold tabular-nums",
            compact ? "text-lg" : "text-2xl",
            scaleValueColorClass(value),
          )}
        >
          {value}
        </span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(v) => onValueChange(v[0] ?? value)}
        disabled={disabled}
        className={cn(
          "py-1 [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-slate-700/80",
          "[&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-slate-500 [&_[data-slot=slider-range]]:to-wam",
          "[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-wam",
        )}
      />
      <p className={cn("text-white/40", compact ? "text-[10px]" : "text-xs")}>
        {valueLabel}
      </p>
    </div>
  );
}

export function TempoIntensitySlider({
  tempo,
  intensity,
  onChange,
  disabled,
  variant = "default",
}: TempoIntensitySliderProps) {
  const isDialog = variant === "dialog";
  const compact = variant === "compact";

  const tempoVal = clampScale(tempo);
  const intensityVal = clampScale(intensity);

  const combo = useMemo(
    () => comboDescriptor(tempoVal, intensityVal),
    [tempoVal, intensityVal],
  );

  function setTempo(next: number) {
    onChange(next, intensityVal);
  }

  function setIntensity(next: number) {
    onChange(tempoVal, next);
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : isDialog ? "gap-5" : "gap-6")}>
      {!compact && !isDialog ? (
        <div className="flex flex-col gap-1">
          <span className={sectionHeading}>Tempo & intensity</span>
          <p className="text-xs leading-relaxed text-white/55">
            How fast and how intense does this track feel? Used to suggest moment tags.
          </p>
        </div>
      ) : null}

      <ScaleRow
        label="Tempo"
        value={tempoVal}
        onValueChange={setTempo}
        valueLabel={tempoLabel(tempoVal)}
        disabled={disabled}
        compact={compact}
      />

      <ScaleRow
        label="Intensity"
        value={intensityVal}
        onValueChange={setIntensity}
        valueLabel={intensityLabel(intensityVal)}
        disabled={disabled}
        compact={compact}
      />

      <div className="flex justify-center">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            combo.pillClass,
          )}
        >
          {combo.label}
        </span>
      </div>
    </div>
  );
}
