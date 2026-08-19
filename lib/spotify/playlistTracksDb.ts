import type { SupabaseClient } from "@supabase/supabase-js";

import type { SpotifyPlaylistStatsPayload } from "@/lib/types/spotifyLibrary";

export type PlaylistTracksRow = {
  user_id: string;
  playlist_id: string;
  total_tracks: number;
  track_ids: string[];
  last_synced_at: string;
  name: string | null;
  image_url: string | null;
};

/** Server-side TTL: skip Spotify fetch on manual sync unless `force` or row missing. */
export const SYNC_TTL_MS = 24 * 60 * 60 * 1000;

export function isPlaylistTracksCacheFresh(
  lastSyncedAt: string,
  maxAgeMs = SYNC_TTL_MS,
): boolean {
  const t = Date.parse(lastSyncedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < maxAgeMs;
}

export function statsFromTrackIds(
  trackIds: string[],
  totalTracks: number,
  ratedTrackIds: Set<string>,
): SpotifyPlaylistStatsPayload {
  let rated_count = 0;
  for (const id of trackIds) {
    if (ratedTrackIds.has(id)) rated_count += 1;
  }
  const total_tracks = Math.max(0, totalTracks);
  const unrated_count = Math.max(0, total_tracks - rated_count);
  const rated_percent = total_tracks
    ? Math.round((rated_count / total_tracks) * 100)
    : 0;
  return {
    rated_count,
    unrated_count,
    rated_percent,
    total_tracks,
  };
}

export async function loadUserPlaylistTracksMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, PlaylistTracksRow>> {
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select(
      "user_id, playlist_id, total_tracks, track_ids, last_synced_at, name, image_url",
    )
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, PlaylistTracksRow>();
  for (const row of data ?? []) {
    map.set(row.playlist_id as string, parsePlaylistTracksRow(row));
  }
  return map;
}

export async function loadPlaylistTracksRow(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<PlaylistTracksRow | null> {
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select(
      "user_id, playlist_id, total_tracks, track_ids, last_synced_at, name, image_url",
    )
    .eq("user_id", userId)
    .eq("playlist_id", playlistId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? parsePlaylistTracksRow(data) : null;
}

export async function loadPlaylistsContainingTrack(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
): Promise<PlaylistTracksRow[]> {
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select(
      "user_id, playlist_id, total_tracks, track_ids, last_synced_at, name, image_url",
    )
    .eq("user_id", userId)
    .contains("track_ids", [trackId]);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => parsePlaylistTracksRow(row));
}

function parsePlaylistTracksRow(row: {
  user_id: unknown;
  playlist_id: unknown;
  total_tracks?: unknown;
  track_ids?: unknown;
  last_synced_at: unknown;
  name?: unknown;
  image_url?: unknown;
}): PlaylistTracksRow {
  const track_ids = Array.isArray(row.track_ids)
    ? (row.track_ids as string[]).filter(
        (id) => typeof id === "string" && id.length > 0,
      )
    : [];
  return {
    user_id: row.user_id as string,
    playlist_id: row.playlist_id as string,
    total_tracks: (row.total_tracks as number) ?? 0,
    track_ids,
    last_synced_at: row.last_synced_at as string,
    name:
      typeof row.name === "string" && row.name.trim().length > 0
        ? row.name.trim()
        : null,
    image_url:
      typeof row.image_url === "string" && row.image_url.length > 0
        ? row.image_url
        : null,
  };
}

export async function upsertPlaylistTracks(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  totalTracks: number,
  trackIds: string[],
  meta?: { name?: string | null; image_url?: string | null },
): Promise<PlaylistTracksRow> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: userId,
    playlist_id: playlistId,
    total_tracks: totalTracks,
    track_ids: trackIds,
    last_synced_at: now,
  };
  if (meta?.name) payload.name = meta.name;
  if (meta?.image_url) payload.image_url = meta.image_url;

  const { data, error } = await supabase
    .from("playlist_tracks")
    .upsert(payload, { onConflict: "user_id,playlist_id" })
    .select(
      "user_id, playlist_id, total_tracks, track_ids, last_synced_at, name, image_url",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save playlist tracks");
  }

  return {
    user_id: data.user_id as string,
    playlist_id: data.playlist_id as string,
    total_tracks: data.total_tracks as number,
    track_ids: (data.track_ids as string[]) ?? [],
    last_synced_at: data.last_synced_at as string,
    name:
      typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : null,
    image_url:
      typeof data.image_url === "string" && data.image_url.length > 0
        ? data.image_url
        : null,
  };
}
