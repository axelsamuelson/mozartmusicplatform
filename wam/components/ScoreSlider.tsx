"use client";

import { Slider } from "@/components/ui/slider";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export function scoreReadoutClass(score: number): string {
  if (score < 40) return "text-slate-400";
  if (score < 70) return "text-green-400";
  if (score < 90) return "text-orange-400";
  return "text-rose-400";
}

/** Badge / compact UI: same thresholds as the main score readout. */
export function scoreBadgeClass(score: number): string {
  if (score < 40) return "border-white/20 bg-white/10 text-slate-300";
  if (score < 70) return "border-green-400/40 bg-green-500/15 text-green-400";
  if (score < 90) return "border-orange-400/40 bg-orange-500/15 text-orange-400";
  return "border-rose-400/40 bg-rose-500/15 text-rose-400";
}

export interface ScoreSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  /** Dialog / compact: tighter label + readout, no scale hint. */
  variant?: "default" | "dialog";
}

export function ScoreSlider({
  value,
  onChange,
  disabled,
  className,
  variant = "default",
}: ScoreSliderProps) {
  const isDialog = variant === "dialog";

  return (
    <div className={cn("flex flex-col", isDialog ? "gap-4 py-1" : "gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        {isDialog ? (
          <span className="text-sm text-white/60">Score</span>
        ) : (
          <span className={sectionHeading}>Score</span>
        )}
        <span
          className={cn(
            "tabular-nums font-bold tracking-tight transition-colors",
            isDialog ? "text-2xl" : "text-4xl font-semibold",
            scoreReadoutClass(value),
          )}
        >
          {value}
        </span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        disabled={disabled}
        className={cn(isDialog ? "py-2" : "py-1")}
      />
      {!isDialog ? (
        <p className="text-xs text-white/50">0 = lowest, 100 = highest</p>
      ) : null}
    </div>
  );
}
