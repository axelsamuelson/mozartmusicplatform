"use client";

import { scoreBadgeClass } from "@/components/ScoreSlider";
import type { ScoreHistoryEntry } from "@/lib/ratings/scoreHistory";
import { glassCardTight, sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatHistoryDate(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (withTime) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ScoreSparkline({ entries }: { entries: ScoreHistoryEntry[] }) {
  const w = 280;
  const h = 56;
  const padX = 8;
  const padY = 8;
  const scores = entries.map((e) => e.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(8, max - min);
  const ymin = Math.max(0, min - span * 0.25);
  const ymax = Math.min(100, max + span * 0.25);
  const range = Math.max(1, ymax - ymin);
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const points = entries.map((e, i) => {
    const x =
      entries.length === 1
        ? padX + innerW / 2
        : padX + (i / (entries.length - 1)) * innerW;
    const y = padY + innerH - ((e.score - ymin) / range) * innerH;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-14 w-full text-wam"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />
      {entries.map((e, i) => {
        const [x, y] = points[i]!.split(",").map(Number);
        return (
          <circle
            key={`${e.recorded_at}-${i}`}
            cx={x}
            cy={y}
            r="3"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

export function ScoreHistory({ entries }: { entries: ScoreHistoryEntry[] }) {
  if (entries.length < 2) return null;

  const dayCounts = new Map<string, number>();
  for (const e of entries) {
    const key = dayKey(e.recorded_at);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  const rows = [...entries].reverse().map((e, i, all) => {
    const older = all[i + 1];
    const delta = older ? e.score - older.score : null;
    return { ...e, delta, withTime: (dayCounts.get(dayKey(e.recorded_at)) ?? 0) > 1 };
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className={sectionHeading}>Score history</h2>
        <p className="mt-1 text-sm text-white/45">
          How this track’s score has changed over time.
        </p>
      </div>
      <div className={cn(glassCardTight, "flex flex-col gap-4")}>
        <ScoreSparkline entries={entries} />
        <ol className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <li
              key={`${row.recorded_at}-${row.score}-${i}`}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "inline-flex w-10 shrink-0 justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
                  scoreBadgeClass(row.score),
                )}
              >
                {row.score}
              </span>
              <span className="min-w-0 flex-1 truncate text-white/55">
                {formatHistoryDate(row.recorded_at, row.withTime)}
              </span>
              {row.delta != null && row.delta !== 0 ? (
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium tabular-nums",
                    row.delta > 0 ? "text-green-400" : "text-white/40",
                  )}
                >
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
