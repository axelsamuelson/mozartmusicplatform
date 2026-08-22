import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadMatchedPlaylistTracks,
  wamPlaylistFiltersFromRow,
} from "@/lib/playlist/loadMatchedTracks";
import {
  playlistNeedsResyncForRating,
  trackUrisFromRatings,
  type WamPlaylistFilters,
} from "@/lib/playlist/matchRating";
import { assertWamOwned } from "@/lib/spotify/playlistGuard";
import { replacePlaylistTracks } from "@/lib/spotify/userPlaylistSpotify";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { RatingDetail } from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { loadAllUserRatingsSlim } from "@/lib/ratings/normalize";

function filtersFromRow(pl: WamPlaylistRow): WamPlaylistFilters {
  return wamPlaylistFiltersFromRow(pl);
}

/** Push all matching rated tracks to one WAM playlist on Spotify. */
export async function syncWamPlaylistToSpotify(
  supabase: SupabaseClient,
  userId: string,
  pl: WamPlaylistRow,
  accessToken: string,
  preloadedRatings?: RatingDetail[],
): Promise<{ track_count: number }> {
  await assertWamOwned(pl.spotify_playlist_id, userId);

  const sorted = await loadMatchedPlaylistTracks(
    supabase,
    userId,
    pl,
    undefined,
    preloadedRatings,
  );
  const uris = trackUrisFromRatings(sorted);

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
  options?: {
    previousRating?: RatingDetail | null;
    /** @deprecated Prefer previousRating — score-only fallback. */
    previousScore?: number;
  },
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

  const previous =
    options?.previousRating ??
    (options?.previousScore !== undefined
      ? { ...rating, score: options.previousScore }
      : null);

  const rows = (playlists ?? []) as WamPlaylistRow[];
  const targets = rows.filter((pl) =>
    playlistNeedsResyncForRating(rating, filtersFromRow(pl), previous),
  );

  if (targets.length === 0) return;

  const ratings = await loadAllUserRatingsSlim(supabase, userId, "track");

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
        ratings,
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
