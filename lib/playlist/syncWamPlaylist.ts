import type { SupabaseClient } from "@supabase/supabase-js";

import {
  playlistNeedsResyncForRating,
  ratingMatchesPlaylistFilters,
  trackUrisFromRatings,
  type WamPlaylistFilters,
} from "@/lib/playlist/matchRating";
import { loadAllUserRatings } from "@/lib/ratings/normalize";
import { assertWamOwned } from "@/lib/spotify/playlistGuard";
import { replacePlaylistTracks } from "@/lib/spotify/userPlaylistSpotify";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { RatingDetail } from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";

function filtersFromRow(pl: WamPlaylistRow): WamPlaylistFilters {
  return {
    filter_genres: pl.filter_genres,
    filter_mood_levels: pl.filter_mood_levels,
    filter_moments: pl.filter_moments,
    filter_min_score: pl.filter_min_score,
    filter_vibes: pl.filter_vibes ?? null,
    filter_tempo_min: pl.filter_tempo_min ?? null,
    filter_tempo_max: pl.filter_tempo_max ?? null,
    filter_intensity_min: pl.filter_intensity_min ?? null,
    filter_intensity_max: pl.filter_intensity_max ?? null,
  };
}

/** Push all matching rated tracks to one WAM playlist on Spotify. */
export async function syncWamPlaylistToSpotify(
  supabase: SupabaseClient,
  userId: string,
  pl: WamPlaylistRow,
  accessToken: string,
): Promise<{ track_count: number }> {
  await assertWamOwned(pl.spotify_playlist_id, userId);

  const filters = filtersFromRow(pl);
  const ratings = await loadAllUserRatings(supabase, userId);
  const matched = ratings.filter((r) => ratingMatchesPlaylistFilters(r, filters));
  const uris = trackUrisFromRatings(matched);

  await replacePlaylistTracks(accessToken, pl.spotify_playlist_id, uris);

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("wam_playlists")
    .update({
      track_count: uris.length,
      last_synced_at: now,
    })
    .eq("id", pl.id)
    .eq("user_id", userId);

  if (upErr) {
    throw new Error(upErr.message);
  }

  return { track_count: uris.length };
}

/**
 * After a rating is saved, re-sync WAM playlists that now include or no longer
 * include this track (full playlist replace on Spotify).
 */
export async function syncWamPlaylistsForRating(
  supabase: SupabaseClient,
  userId: string,
  rating: RatingDetail,
  options?: { previousScore?: number },
): Promise<void> {
  if (rating.item?.type !== "track") return;

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auto-sync] skipped — no Spotify token:", e);
    }
    return;
  }

  const { data: playlists, error } = await supabase
    .from("wam_playlists")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auto-sync] load playlists failed:", error.message);
    }
    return;
  }

  const rows = (playlists ?? []) as WamPlaylistRow[];
  const targets = rows.filter((pl) =>
    playlistNeedsResyncForRating(
      rating,
      filtersFromRow(pl),
      options?.previousScore,
    ),
  );

  if (targets.length === 0) return;

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[auto-sync] syncing playlists for track",
      rating.spotify_id,
      targets.map((p) => p.name),
    );
  }

  for (const pl of targets) {
    try {
      const { track_count } = await syncWamPlaylistToSpotify(
        supabase,
        userId,
        pl,
        accessToken,
      );
      if (process.env.NODE_ENV === "development") {
        console.log("[auto-sync] ok", pl.name, track_count, "tracks");
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[auto-sync] failed", pl.name, e);
      }
    }
  }
}
