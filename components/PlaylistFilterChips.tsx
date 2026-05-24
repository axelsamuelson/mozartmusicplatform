import { vibePresetById } from "@/lib/playlist/tempoIntensityPresets";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

export function PlaylistFilterChips({
  playlist,
  className,
}: {
  playlist: WamPlaylistRow;
  className?: string;
}) {
  const chips: { key: string; label: string; className?: string }[] = [];

  if (playlist.filter_genres?.length) {
    for (const g of playlist.filter_genres.slice(0, 2)) {
      chips.push({ key: `g-${g}`, label: g });
    }
    if (playlist.filter_genres.length > 2) {
      chips.push({
        key: "g-more",
        label: `+${playlist.filter_genres.length - 2} genres`,
      });
    }
  }

  if (playlist.filter_vibes?.length) {
    for (const id of playlist.filter_vibes.slice(0, 3)) {
      const preset = vibePresetById(id);
      chips.push({
        key: `v-${id}`,
        label: preset?.label ?? id,
        className: preset?.pillClass,
      });
    }
  } else if (
    playlist.filter_tempo_min != null ||
    playlist.filter_tempo_max != null
  ) {
    const min = playlist.filter_tempo_min;
    const max = playlist.filter_tempo_max;
    chips.push({
      key: "tempo",
      label:
        min != null && max != null
          ? `♩ ${min}–${max}`
          : min != null
            ? `♩ ≥${min}`
            : `♩ ≤${max}`,
      className: "text-blue-300",
    });
  }

  if (
    !playlist.filter_vibes?.length &&
    (playlist.filter_intensity_min != null ||
      playlist.filter_intensity_max != null)
  ) {
    const min = playlist.filter_intensity_min;
    const max = playlist.filter_intensity_max;
    chips.push({
      key: "intensity",
      label:
        min != null && max != null
          ? `⚡ ${min}–${max}`
          : min != null
            ? `⚡ ≥${min}`
            : `⚡ ≤${max}`,
      className: "text-wam",
    });
  }

  if (playlist.filter_moments?.length) {
    chips.push({
      key: "moments",
      label:
        playlist.filter_moments.length === 1
          ? playlist.filter_moments[0]!
          : `${playlist.filter_moments.length} moments`,
    });
  }

  chips.push({
    key: "score",
    label: `≥${playlist.filter_min_score}`,
    className: "border-wam/30 bg-wam/10 text-wam",
  });

  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={cn(
            "inline-flex rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/75",
            chip.className,
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}
