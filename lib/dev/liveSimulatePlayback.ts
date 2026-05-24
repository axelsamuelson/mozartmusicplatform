import type { LiveSessionPlaybackPatch } from "@/lib/live/mapPlaybackToSession";
import type { SimulatedTrack } from "@/lib/dev/liveSimulateTracks";

export function simulatedPlaybackPatch(
  track: SimulatedTrack,
  opts?: { isPlaying?: boolean; progressMs?: number },
  now = new Date(),
): LiveSessionPlaybackPatch {
  const duration = track.duration_ms;
  const progress = Math.min(
    Math.max(0, opts?.progressMs ?? 0),
    duration > 0 ? duration : Number.MAX_SAFE_INTEGER,
  );

  return {
    spotify_track_id: track.spotify_track_id,
    track_name: track.track_name,
    artist_name: track.artist_name,
    image_url: track.image_url,
    is_playing: opts?.isPlaying ?? true,
    progress_ms: progress,
    duration_ms: duration,
    device_name: "[simulated]",
    playback_updated_at: now.toISOString(),
  };
}
