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

export function sessionPlaybackChanged(
  prev: LiveSessionRow,
  patch: LiveSessionPlaybackPatch,
): boolean {
  return (
    prev.spotify_track_id !== patch.spotify_track_id ||
    prev.track_name !== patch.track_name ||
    prev.artist_name !== patch.artist_name ||
    prev.image_url !== patch.image_url ||
    Boolean(prev.is_playing) !== patch.is_playing ||
    (prev.progress_ms ?? 0) !== patch.progress_ms ||
    (prev.duration_ms ?? 0) !== patch.duration_ms ||
    (prev.device_name ?? null) !== patch.device_name
  );
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
