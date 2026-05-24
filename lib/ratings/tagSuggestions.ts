import type { MomentSubcategory } from "@/lib/types/ratings";

export interface TagSuggestion {
  tag: string;
  subcategory: MomentSubcategory;
  weight: number;
}

export function getSuggestedTags(tempo: number, intensity: number): TagSuggestion[] {
  const suggestions: TagSuggestion[] = [];

  const t = (tempo - 1) / 9;
  const i = (intensity - 1) / 9;

  if (t < 0.4 && i < 0.4) {
    suggestions.push(
      { tag: "Home", subcategory: "place", weight: 0.9 },
      { tag: "Café", subcategory: "place", weight: 0.7 },
    );
  }
  if (t > 0.6 && i > 0.6) {
    suggestions.push(
      { tag: "Party", subcategory: "place", weight: 0.9 },
      { tag: "Gym", subcategory: "place", weight: 0.75 },
    );
  }
  if (t > 0.4 && i < 0.4) {
    suggestions.push(
      { tag: "Commute", subcategory: "place", weight: 0.8 },
      { tag: "Car", subcategory: "place", weight: 0.7 },
      { tag: "Office", subcategory: "place", weight: 0.6 },
    );
  }
  if (t < 0.4 && i > 0.6) {
    suggestions.push(
      { tag: "Car", subcategory: "place", weight: 0.75 },
      { tag: "Gym", subcategory: "place", weight: 0.8 },
      { tag: "Home", subcategory: "place", weight: 0.6 },
    );
  }

  if (t < 0.3 && i < 0.3) {
    suggestions.push(
      { tag: "Evening", subcategory: "occasion", weight: 0.85 },
      { tag: "Late night", subcategory: "occasion", weight: 0.8 },
      { tag: "Weekend", subcategory: "occasion", weight: 0.6 },
    );
  }
  if (t > 0.6 && i < 0.5) {
    suggestions.push(
      { tag: "Morning", subcategory: "occasion", weight: 0.85 },
      { tag: "Weekday", subcategory: "occasion", weight: 0.7 },
    );
  }
  if (t > 0.5 && i > 0.6) {
    suggestions.push(
      { tag: "Weekend", subcategory: "occasion", weight: 0.9 },
      { tag: "Evening", subcategory: "occasion", weight: 0.65 },
    );
  }
  if (t < 0.4 && i > 0.5) {
    suggestions.push(
      { tag: "Late night", subcategory: "occasion", weight: 0.85 },
      { tag: "Evening", subcategory: "occasion", weight: 0.7 },
    );
  }

  if (t < 0.3 && i < 0.3) {
    suggestions.push(
      { tag: "Falling asleep", subcategory: "activity", weight: 0.9 },
      { tag: "Studying", subcategory: "activity", weight: 0.7 },
    );
  }
  if (t > 0.6 && i > 0.7) {
    suggestions.push(
      { tag: "Working out", subcategory: "activity", weight: 0.95 },
      { tag: "Pregame", subcategory: "activity", weight: 0.85 },
    );
  }
  if (t > 0.5 && i < 0.4) {
    suggestions.push(
      { tag: "Studying", subcategory: "activity", weight: 0.8 },
      { tag: "Working", subcategory: "activity", weight: 0.75 },
      { tag: "Cooking", subcategory: "activity", weight: 0.65 },
    );
  }
  if (t < 0.4 && i > 0.5) {
    suggestions.push(
      { tag: "Date night", subcategory: "activity", weight: 0.8 },
      { tag: "Cooking", subcategory: "activity", weight: 0.7 },
    );
  }
  if (t > 0.4 && t < 0.7 && i > 0.4 && i < 0.7) {
    suggestions.push(
      { tag: "Road trip", subcategory: "activity", weight: 0.75 },
      { tag: "Cooking", subcategory: "activity", weight: 0.7 },
    );
  }

  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.weight - a.weight)
    .filter((s) => {
      if (seen.has(s.tag)) return false;
      seen.add(s.tag);
      return true;
    });
}

export function getTopSuggestions(
  tempo: number,
  intensity: number,
  perCategory = 2,
): TagSuggestion[] {
  const all = getSuggestedTags(tempo, intensity);
  const counts: Record<string, number> = {};
  return all.filter((s) => {
    counts[s.subcategory] = (counts[s.subcategory] ?? 0) + 1;
    return counts[s.subcategory] <= perCategory;
  });
}

export function suggestedTagNames(suggestions: TagSuggestion[]): Set<string> {
  return new Set(suggestions.map((s) => s.tag));
}

export function sortMomentTagsWithSuggestions<T extends { name: string }>(
  tags: T[],
  suggestions: TagSuggestion[],
): Array<{ tag: T; suggested: boolean; weight: number }> {
  const weightByName = new Map(suggestions.map((s) => [s.tag, s.weight]));
  return [...tags]
    .map((tag) => ({
      tag,
      suggested: weightByName.has(tag.name),
      weight: weightByName.get(tag.name) ?? 0,
    }))
    .sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      if (a.suggested && b.suggested) return b.weight - a.weight;
      return a.tag.name.localeCompare(b.tag.name);
    });
}
