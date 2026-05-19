import type { SpotifyPlaylistListItem } from "@/lib/types/spotifyLibrary";

/** Minimum tracks required for WAM Jams playlist source. */
export const JAMS_MIN_PLAYLIST_TRACKS = 20;

export type PlaylistSortKey =
  | "name"
  | "name_desc"
  | "total_tracks"
  | "total_tracks_asc"
  | "rated_percent";

export function filterPlaylistsByQuery(
  items: SpotifyPlaylistListItem[],
  query: string,
): SpotifyPlaylistListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.owner.toLowerCase().includes(q),
  );
}

export function filterEligiblePlaylists(
  items: SpotifyPlaylistListItem[],
  eligibleOnly: boolean,
  minTracks = JAMS_MIN_PLAYLIST_TRACKS,
): SpotifyPlaylistListItem[] {
  if (!eligibleOnly) return items;
  return items.filter((p) => p.total_tracks >= minTracks);
}

export function sortSpotifyPlaylists(
  items: SpotifyPlaylistListItem[],
  key: PlaylistSortKey,
): SpotifyPlaylistListItem[] {
  const copy = [...items];
  switch (key) {
    case "name":
      copy.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      break;
    case "name_desc":
      copy.sort((a, b) =>
        b.name.localeCompare(a.name, undefined, { sensitivity: "base" }),
      );
      break;
    case "rated_percent":
      copy.sort((a, b) => {
        const ap = a.rated_percent ?? -1;
        const bp = b.rated_percent ?? -1;
        return (
          bp - ap ||
          (b.rated_count ?? 0) - (a.rated_count ?? 0) ||
          a.name.localeCompare(b.name)
        );
      });
      break;
    case "total_tracks_asc":
      copy.sort(
        (a, b) =>
          a.total_tracks - b.total_tracks ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      break;
    case "total_tracks":
    default:
      copy.sort(
        (a, b) =>
          b.total_tracks - a.total_tracks ||
          (b.rated_percent ?? -1) - (a.rated_percent ?? -1) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }
  return copy;
}
