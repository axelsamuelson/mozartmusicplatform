import type { ItemType } from "@/lib/spotify/api";
import type { MoodTagRow, RatingDetail } from "@/lib/types/ratings";

export interface TopItem {
  spotify_id: string;
  name: string;
  artist: string | null;
  score: number;
}

export interface ActivityMonth {
  month: string;
  label: string;
  count: number;
}

export interface GenreCountRow {
  name: string;
  count: number;
}

export interface MoodLevelCount {
  level: number;
  count: number;
  color: string;
  name: string;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function last12MonthKeys(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y!, m! - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** How many highest track scores count toward an artist’s profile score. */
const TOP_TRACK_SCORES_PER_ARTIST = 5;

/** First credited artist from Spotify-style "A, B, C" artist string. */
function firstCreditedArtistName(artistName: string | null | undefined): string | null {
  if (!artistName?.trim()) return null;
  return artistName.split(",")[0]?.trim() ?? null;
}

type ArtistTrackAgg = {
  spotify_id: string;
  name: string;
  scores: number[];
};

/**
 * Top artists by average of each artist’s **up to five highest** track scores
 * (fewer if the artist has fewer rated tracks).
 */
export function topArtistsFromTrackScores(
  ratings: RatingDetail[],
  limit: number,
): TopItem[] {
  const byKey = new Map<string, ArtistTrackAgg>();

  for (const r of ratings) {
    if (r.item?.type !== "track") continue;
    if (typeof r.score !== "number" || !Number.isFinite(r.score)) continue;

    const aid = r.item.primary_artist_id?.trim();
    const credit = firstCreditedArtistName(r.item.artist_name);
    const key =
      aid && aid.length > 0
        ? `id:${aid}`
        : credit
          ? `n:${credit.toLowerCase()}`
          : null;
    if (!key) continue;

    const displayName = credit ?? r.item.name;
    const linkId = aid && aid.length > 0 ? aid : "";

    let agg = byKey.get(key);
    if (!agg) {
      agg = { spotify_id: linkId, name: displayName, scores: [] };
      byKey.set(key, agg);
    }
    agg.scores.push(r.score);
  }

  function artistScore(agg: ArtistTrackAgg): number {
    const sorted = [...agg.scores].sort((a, b) => b - a).slice(0, TOP_TRACK_SCORES_PER_ARTIST);
    const sum = sorted.reduce((s, x) => s + x, 0);
    return Math.round(sum / sorted.length);
  }

  return [...byKey.values()]
    .map((agg) => ({
      spotify_id: agg.spotify_id,
      name: agg.name,
      artist: null as string | null,
      score: artistScore(agg),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function topByType(
  ratings: RatingDetail[],
  itemType: ItemType,
  limit: number,
): TopItem[] {
  const best = new Map<
    string,
    { spotify_id: string; name: string; artist: string | null; score: number }
  >();

  for (const r of ratings) {
    if (r.item?.type !== itemType) continue;
    const cur = best.get(r.spotify_id);
    if (!cur || r.score > cur.score) {
      best.set(r.spotify_id, {
        spotify_id: r.spotify_id,
        name: r.item.name,
        artist: r.item.artist_name,
        score: r.score,
      });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildTopTracksAlbumsArtists(ratings: RatingDetail[]): {
  top_tracks: TopItem[];
  top_albums: TopItem[];
  top_artists: TopItem[];
} {
  return {
    top_tracks: topByType(ratings, "track", 10),
    top_albums: topByType(ratings, "album", 10),
    top_artists: topArtistsFromTrackScores(ratings, 10),
  };
}

export function buildActivityByMonth(ratings: RatingDetail[]): ActivityMonth[] {
  const keys = last12MonthKeys();
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, 0);

  for (const r of ratings) {
    const d = new Date(r.created_at);
    const k = monthKey(d);
    if (counts.has(k)) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  return keys.map((month) => ({
    month,
    label: monthLabel(month),
    count: counts.get(month) ?? 0,
  }));
}

export function buildGenreCounts(
  ratings: RatingDetail[],
  limit = 12,
): GenreCountRow[] {
  const tally = new Map<string, number>();
  for (const r of ratings) {
    for (const g of r.genres) {
      tally.set(g.name, (tally.get(g.name) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildMoodLevelBars(
  ratings: RatingDetail[],
  moodTags: MoodTagRow[],
): MoodLevelCount[] {
  const byLevel = new Map<number, MoodTagRow>();
  for (const m of moodTags) {
    byLevel.set(m.level, m);
  }

  const counts = new Map<number, number>();
  for (let level = 1; level <= 5; level++) counts.set(level, 0);
  for (const r of ratings) {
    if (r.mood && r.mood.level >= 1 && r.mood.level <= 5) {
      counts.set(r.mood.level, (counts.get(r.mood.level) ?? 0) + 1);
    }
  }

  return [1, 2, 3, 4, 5].map((level) => {
    const tag = byLevel.get(level);
    return {
      level,
      count: counts.get(level) ?? 0,
      color: tag?.color ?? "#71717a",
      name: tag?.name ?? `Level ${level}`,
    };
  });
}
