import { ratingMatchesPlaylistFilters } from "@/lib/playlist/matchRating";
import { wamPlaylistFiltersFromRow } from "@/lib/playlist/loadMatchedTracks";
import { rankTrackByScore, rankTrackInIdSet } from "@/lib/playlist/trackRank";
import {
  spotifyPlaylistRankHref,
  spotifyPlaylistWebUrl,
  wamPlaylistRankHref,
} from "@/lib/playlist/urls";
import type { PlaylistTracksRow } from "@/lib/spotify/playlistTracksDb";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import type { RatingDetail } from "@/lib/types/ratings";
import type {
  TrackPlaylistHit,
  TrackPlaylistsPayload,
} from "@/lib/types/trackPlaylists";

function sortByName(a: TrackPlaylistHit, b: TrackPlaylistHit): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function playlistHasTrack(row: PlaylistTracksRow | undefined, trackId: string): boolean {
  if (!row) return false;
  return row.track_ids.includes(trackId);
}

export function playlistsContainingTrack(args: {
  trackId: string;
  ratings: RatingDetail[];
  wamPlaylists: WamPlaylistRow[];
  cachedPlaylists: PlaylistTracksRow[];
}): TrackPlaylistsPayload {
  const { trackId, ratings, wamPlaylists, cachedPlaylists } = args;
  const rating = ratings.find((r) => r.spotify_id === trackId) ?? null;
  const cacheById = new Map(cachedPlaylists.map((row) => [row.playlist_id, row]));
  const wamSpotifyIds = new Set(
    wamPlaylists
      .map((pl) => pl.spotify_playlist_id)
      .filter((id) => typeof id === "string" && id.length > 0),
  );

  const wam: TrackPlaylistHit[] = [];
  for (const pl of wamPlaylists) {
    const filters = wamPlaylistFiltersFromRow(pl);
    const matchesFilters = Boolean(
      rating && ratingMatchesPlaylistFilters(rating, filters),
    );
    const cached = cacheById.get(pl.spotify_playlist_id);
    const onSpotify = playlistHasTrack(cached, trackId);
    if (!matchesFilters && !onSpotify) continue;

    const matched = ratings.filter((r) => ratingMatchesPlaylistFilters(r, filters));
    const rank = matchesFilters
      ? rankTrackByScore(matched, trackId)
      : rankTrackInIdSet(ratings, cached?.track_ids ?? [], trackId);

    wam.push({
      id: pl.id,
      name: pl.name,
      href: wamPlaylistRankHref(pl.id),
      spotify_url: pl.spotify_playlist_id
        ? spotifyPlaylistWebUrl(pl.spotify_playlist_id)
        : null,
      image_url: cached?.image_url ?? null,
      source: "wam",
      rank,
    });
  }

  const spotify: TrackPlaylistHit[] = [];
  for (const row of cachedPlaylists) {
    if (wamSpotifyIds.has(row.playlist_id)) continue;
    if (!playlistHasTrack(row, trackId)) continue;
    spotify.push({
      id: row.playlist_id,
      name: row.name?.trim() || "Untitled playlist",
      href: spotifyPlaylistRankHref(row.playlist_id),
      spotify_url: spotifyPlaylistWebUrl(row.playlist_id),
      image_url: row.image_url,
      source: "spotify",
      rank: rankTrackInIdSet(ratings, row.track_ids, trackId),
    });
  }

  wam.sort(sortByName);
  spotify.sort(sortByName);
  return {
    platform: rankTrackByScore(ratings, trackId),
    wam,
    spotify,
  };
}
