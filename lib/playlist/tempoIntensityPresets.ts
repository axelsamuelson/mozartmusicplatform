import type { ComboDescriptor } from "@/lib/ratings/tempoIntensityUi";
import type { RatingDetail } from "@/lib/types/ratings";

export type VibePresetId =
  | "chill"
  | "dark_heavy"
  | "light_upbeat"
  | "high_energy"
  | "balanced";

export type VibePreset = {
  id: VibePresetId;
  label: string;
  pillClass: string;
  tempoMin: number;
  tempoMax: number;
  intensityMin: number;
  intensityMax: number;
};

export const VIBE_PRESETS: VibePreset[] = [
  {
    id: "chill",
    label: "Chill",
    pillClass: "border-blue-400/30 bg-blue-500/10 text-blue-300",
    tempoMin: 1,
    tempoMax: 4,
    intensityMin: 1,
    intensityMax: 4,
  },
  {
    id: "dark_heavy",
    label: "Dark & Heavy",
    pillClass: "border-purple-400/30 bg-purple-500/10 text-purple-300",
    tempoMin: 1,
    tempoMax: 4,
    intensityMin: 5,
    intensityMax: 10,
  },
  {
    id: "light_upbeat",
    label: "Light & Upbeat",
    pillClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    tempoMin: 5,
    tempoMax: 10,
    intensityMin: 1,
    intensityMax: 4,
  },
  {
    id: "high_energy",
    label: "High Energy",
    pillClass: "border-orange-400/35 bg-orange-500/15 text-orange-300",
    tempoMin: 5,
    tempoMax: 10,
    intensityMin: 5,
    intensityMax: 10,
  },
  {
    id: "balanced",
    label: "Balanced",
    pillClass: "border-white/20 bg-white/10 text-white/70",
    tempoMin: 4,
    tempoMax: 7,
    intensityMin: 4,
    intensityMax: 7,
  },
];

const presetById = new Map(VIBE_PRESETS.map((p) => [p.id, p]));

export function vibePresetById(id: string): VibePreset | undefined {
  return presetById.get(id as VibePresetId);
}

export function ratingMatchesVibePreset(
  rating: RatingDetail,
  presetId: VibePresetId,
): boolean {
  const preset = presetById.get(presetId);
  if (!preset) return false;
  const { tempo, intensity } = rating;
  if (tempo == null || intensity == null) return false;
  return (
    tempo >= preset.tempoMin &&
    tempo <= preset.tempoMax &&
    intensity >= preset.intensityMin &&
    intensity <= preset.intensityMax
  );
}

export function ratingMatchesAnyVibePreset(
  rating: RatingDetail,
  presetIds: string[],
): boolean {
  return presetIds.some((id) =>
    ratingMatchesVibePreset(rating, id as VibePresetId),
  );
}

export function comboFromRating(
  tempo: number,
  intensity: number,
): ComboDescriptor {
  if (tempo >= 5 && tempo <= 6 && intensity >= 4 && intensity <= 6) {
    return { label: "Balanced", pillClass: VIBE_PRESETS[4]!.pillClass };
  }
  if (tempo <= 4 && intensity <= 4) {
    return { label: "Chill", pillClass: VIBE_PRESETS[0]!.pillClass };
  }
  if (tempo <= 4 && intensity >= 5) {
    return { label: "Dark & Heavy", pillClass: VIBE_PRESETS[1]!.pillClass };
  }
  if (tempo >= 5 && intensity <= 4) {
    return { label: "Light & Upbeat", pillClass: VIBE_PRESETS[2]!.pillClass };
  }
  if (tempo >= 5 && intensity >= 5) {
    return { label: "High Energy", pillClass: VIBE_PRESETS[3]!.pillClass };
  }
  return { label: "Balanced", pillClass: VIBE_PRESETS[4]!.pillClass };
}

export function hasCustomTempoIntensityRange(f: {
  filter_tempo_min: number | null;
  filter_tempo_max: number | null;
  filter_intensity_min: number | null;
  filter_intensity_max: number | null;
}): boolean {
  return (
    f.filter_tempo_min != null ||
    f.filter_tempo_max != null ||
    f.filter_intensity_min != null ||
    f.filter_intensity_max != null
  );
}

export function valueInRange(
  value: number | null,
  min: number | null,
  max: number | null,
): boolean {
  if (min == null && max == null) return true;
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}
