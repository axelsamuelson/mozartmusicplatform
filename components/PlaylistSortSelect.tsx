"use client";

import { PLAYLIST_SORT_OPTIONS } from "@/lib/playlist/sortOrder";
import type { PlaylistSortOrder } from "@/lib/types/playlists";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export function PlaylistSortSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: PlaylistSortOrder;
  onChange: (order: PlaylistSortOrder) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className={sectionHeading}>Sort order</h3>
      <p className="text-xs leading-relaxed text-white/55">
        Track order on Spotify when you sync. Saved with the playlist.
      </p>
      <div className="flex flex-col gap-1.5">
        {PLAYLIST_SORT_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                selected
                  ? "border-wam/40 bg-wam/10 ring-1 ring-wam/25"
                  : "border-white/[0.08] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  selected ? "text-wam" : "text-white/90",
                )}
              >
                {opt.label}
              </span>
              <span className="text-[11px] text-white/45">{opt.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
