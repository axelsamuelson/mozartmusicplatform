import { scaleValueColorClass } from "@/lib/ratings/tempoIntensityUi";
import { cn } from "@/lib/utils";

export function TempoIntensityPills({
  tempo,
  intensity,
  className,
}: {
  tempo?: number | null;
  intensity?: number | null;
  className?: string;
}) {
  const hasTempo = typeof tempo === "number" && tempo >= 1 && tempo <= 10;
  const hasIntensity = typeof intensity === "number" && intensity >= 1 && intensity <= 10;
  if (!hasTempo && !hasIntensity) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {hasTempo ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-medium tabular-nums",
            scaleValueColorClass(tempo),
          )}
        >
          <span aria-hidden>♩</span>
          {tempo}
        </span>
      ) : null}
      {hasIntensity ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-medium tabular-nums",
            scaleValueColorClass(intensity),
          )}
        >
          <span aria-hidden>⚡</span>
          {intensity}
        </span>
      ) : null}
    </span>
  );
}
