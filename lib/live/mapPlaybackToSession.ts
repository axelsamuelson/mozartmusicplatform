import type { SpotifyCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import type { LiveSessionRow } from "@/lib/types/live";

export type LiveSessionPlaybackPatch = {
  spotify_track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  is_playing: boolean;
  progress_ms: number;
  duration_ms: number;
  device_name: string | null;
  playback_updated_at: string;
};

export function playbackToSessionPatch(
  playback: SpotifyCurrentPlayback | null,
  now = new Date(),
): LiveSessionPlaybackPatch {
  if (!playback || playback.itemKind !== "track") {
    return {
      spotify_track_id: null,
      track_name: null,
      artist_name: null,
      image_url: null,
      is_playing: false,
      progress_ms: 0,
      duration_ms: 0,
      device_name: null,
      playback_updated_at: now.toISOString(),
    };
  }

  return {
    spotify_track_id: playback.trackId,
    track_name: playback.trackName,
    artist_name: playback.artistName,
    image_url: playback.imageUrl || null,
    is_playing: playback.isPlaying,
    progress_ms: Math.max(0, Math.floor(playback.progressMs)),
    duration_ms: Math.max(0, Math.floor(playback.durationMs)),
    device_name: playback.deviceName || null,
    playback_updated_at: now.toISOString(),
  };
}

const PROGRESS_SYNC_THRESHOLD_MS = 8_000;

/** Patch for host sync — never wipe an active track on empty Spotify responses. */
export function buildSyncPlaybackPatch(
  session: Pick<
    LiveSessionRow,
    | "spotify_track_id"
    | "track_name"
    | "artist_name"
    | "image_url"
    | "progress_ms"
    | "duration_ms"
    | "device_name"
  >,
  playback: SpotifyCurrentPlayback | null,
  now = new Date(),
): LiveSessionPlaybackPatch {
  if (playback && playback.itemKind === "track") {
    return playbackToSessionPatch(playback, now);
  }

  if (session.spotify_track_id) {
    return {
      spotify_track_id: session.spotify_track_id,
      track_name: session.track_name,
      artist_name: session.artist_name,
      image_url: session.image_url,
      is_playing: false,
      progress_ms: session.progress_ms ?? 0,
      duration_ms: session.duration_ms ?? 0,
      device_name: session.device_name ?? null,
      playback_updated_at: now.toISOString(),
    };
  }

  return playbackToSessionPatch(null, now);
}

export function sessionPlaybackChanged(
  prev: LiveSessionRow,
  patch: LiveSessionPlaybackPatch,
): boolean {
  if (prev.spotify_track_id !== patch.spotify_track_id) return true;
  if (prev.track_name !== patch.track_name) return true;
  if (prev.artist_name !== patch.artist_name) return true;
  if (prev.image_url !== patch.image_url) return true;
  if (Boolean(prev.is_playing) !== patch.is_playing) return true;
  if ((prev.device_name ?? null) !== patch.device_name) return true;
  if ((prev.duration_ms ?? 0) !== patch.duration_ms) return true;

  const progressDelta = Math.abs((prev.progress_ms ?? 0) - (patch.progress_ms ?? 0));
  return progressDelta >= PROGRESS_SYNC_THRESHOLD_MS;
}

/** Interpolate progress between host sync ticks. */
export function interpolatedProgressMs(session: LiveSessionRow, at = Date.now()): number {
  const base = session.progress_ms ?? 0;
  const duration = session.duration_ms ?? 0;
  if (!session.is_playing || !session.playback_updated_at) {
    return base;
  }
  const elapsed = at - new Date(session.playback_updated_at).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return base;
  const next = base + elapsed;
  return duration > 0 ? Math.min(next, duration) : next;
}
