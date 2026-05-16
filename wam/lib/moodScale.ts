import type { MoodTagRow } from "@/lib/types/ratings";

/** Korta svenska beskrivningar för humör-skala 1–10 (energi/stämning). */
export const MOOD_SCALE_SV: Record<number, string> = {
  1: "Helt nedvarvad — tom eller tung.",
  2: "Mycket lugn — nästan stilla.",
  3: "Dämpad och avslappnad.",
  4: "Mjuk och behaglig, lite varm.",
  5: "Neutral — varken upp eller ner.",
  6: "Lätt positiv, lite mer flås.",
  7: "Pigg och alert, rör på sig.",
  8: "Energisk och driven.",
  9: "Hög puls — nästan euforisk.",
  10: "Maxad energi — full fart.",
};

export function moodScaleDescriptionSv(level: number): string {
  const k = Math.min(10, Math.max(1, Math.round(level)));
  return MOOD_SCALE_SV[k] ?? MOOD_SCALE_SV[5]!;
}

/** Mappa DB-nivå 1–5 till skala 1,3,5,7,9 för visning. */
export function moodSliderFromDbLevel(dbLevel: number): number {
  const L = Math.min(5, Math.max(1, Math.round(dbLevel)));
  return L * 2 - 1;
}

/**
 * Mappa skala 1–10 till mood_tag (förväntas ha `level` 1–5). Väljer närmaste nivå om exakt saknas.
 */
export function moodTagIdFromScale(moods: MoodTagRow[], level1to10: number): number | null {
  if (!moods.length) return null;
  const clamped = Math.min(10, Math.max(1, Math.round(level1to10)));
  const targetLevel = Math.min(5, Math.max(1, Math.ceil((clamped / 10) * 5)));
  const exact = moods.find((m) => m.level === targetLevel);
  if (exact) return exact.id;
  const sorted = [...moods].sort((a, b) => a.level - b.level);
  const closest = sorted.reduce((best, m) =>
    Math.abs(m.level - targetLevel) < Math.abs(best.level - targetLevel) ? m : best,
  );
  return closest?.id ?? null;
}
