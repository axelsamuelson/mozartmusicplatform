import { ratingMatchesPlaylistFilters } from "@/lib/playlist/matchRating";
import { wamPlaylistFiltersFromRow } from "@/lib/playlist/loadMatchedTracks";
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
  rating: RatingDetail | null;
  wamPlaylists: WamPlaylistRow[];
  cachedPlaylists: PlaylistTracksRow[];
}): TrackPlaylistsPayload {
  const { trackId, rating, wamPlaylists, cachedPlaylists } = args;
  const cacheById = new Map(cachedPlaylists.map((row) => [row.playlist_id, row]));
  const wamSpotifyIds = new Set(
    wamPlaylists
      .map((pl) => pl.spotify_playlist_id)
      .filter((id) => typeof id === "string" && id.length > 0),
  );

  const wam: TrackPlaylistHit[] = [];
  for (const pl of wamPlaylists) {
    const matchesFilters = Boolean(
      rating && ratingMatchesPlaylistFilters(rating, wamPlaylistFiltersFromRow(pl)),
    );
    const onSpotify = playlistHasTrack(cacheById.get(pl.spotify_playlist_id), trackId);
    if (!matchesFilters && !onSpotify) continue;

    const cached = cacheById.get(pl.spotify_playlist_id);
    wam.push({
      id: pl.id,
      name: pl.name,
      href: `/playlists/${pl.id}`,
      image_url: cached?.image_url ?? null,
      source: "wam",
    });
  }

  const spotify: TrackPlaylistHit[] = [];
  for (const row of cachedPlaylists) {
    if (wamSpotifyIds.has(row.playlist_id)) continue;
    if (!playlistHasTrack(row, trackId)) continue;
    spotify.push({
      id: row.playlist_id,
      name: row.name?.trim() || "Untitled playlist",
      href: `https://open.spotify.com/playlist/${encodeURIComponent(row.playlist_id)}`,
      image_url: row.image_url,
      source: "spotify",
    });
  }

  wam.sort(sortByName);
  spotify.sort(sortByName);
  return { wam, spotify };
}
