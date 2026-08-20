import type { SpotifyCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import type { SpotifyWebPlaybackState, SpotifyWebPlaybackTrack } from "@/lib/spotify/player";
import type { PlaybackApiPayload, PlaybackState } from "@/lib/playback/types";

function artistIdFromUri(uri: string | undefined): string | null {
  if (!uri || !uri.startsWith("spotify:artist:")) return null;
  const id = uri.slice("spotify:artist:".length).trim();
  return id.length > 0 ? id : null;
}

export function emptyPlayback(): PlaybackState {
  return {
    source: "none",
    trackId: null,
    trackName: null,
    artistName: null,
    artistId: null,
    imageUrl: null,
    durationMs: 0,
    progressMsAtSync: 0,
    syncedAt: Date.now(),
    isPlaying: false,
    deviceName: null,
    contextType: null,
    contextUri: null,
  };
}

export function sdkStateToPlayback(state: SpotifyWebPlaybackState): PlaybackState | null {
  const track = state.track_window?.current_track;
  if (!track?.id) return null;

  const durationMs =
    typeof track.duration_ms === "number" && track.duration_ms > 0
      ? track.duration_ms
      : state.duration > 0
        ? state.duration
        : 0;

  return {
    source: "sdk",
    trackId: track.id,
    trackName: track.name,
    artistName: track.artists?.map((a) => a.name).join(", ") ?? "",
    artistId: artistIdFromUri(track.artists?.[0]?.uri),
    imageUrl: track.album?.images?.[0]?.url ?? null,
    durationMs,
    progressMsAtSync: state.position,
    syncedAt: Date.now(),
    isPlaying: !state.paused,
    deviceName: "WAM Player",
    contextType: state.context?.type ?? null,
    contextUri: state.context?.uri ?? null,
    itemKind: track.type === "episode" ? "episode" : "track",
  };
}

/** Optimistic skip: show an SDK queued track without waiting for player_state_changed. */
export function playbackFromSdkTrack(
  track: SpotifyWebPlaybackTrack,
  base: PlaybackState,
): PlaybackState {
  return {
    ...base,
    source: "sdk",
    trackId: track.id,
    trackName: track.name,
    artistName: track.artists?.map((a) => a.name).join(", ") ?? "",
    artistId: artistIdFromUri(track.artists?.[0]?.uri),
    imageUrl: track.album?.images?.[0]?.url ?? null,
    durationMs:
      typeof track.duration_ms === "number" && track.duration_ms > 0
        ? track.duration_ms
        : 0,
    progressMsAtSync: 0,
    syncedAt: Date.now(),
    itemKind: track.type === "episode" ? "episode" : "track",
  };
}

export function apiPayloadToPlayback(
  data: PlaybackApiPayload,
  clientReceivedAt: number,
): PlaybackState {
  const trackId =
    typeof data.trackId === "string" && data.trackId.length > 0
      ? data.trackId
      : null;

  // No active item at all (Spotify 204 / nothing on device).
  if (!trackId) {
    return {
      ...emptyPlayback(),
      syncedAt: clientReceivedAt,
      deviceName: data.deviceName ?? null,
    };
  }

  const serverTime =
    typeof data.serverTime === "number" ? data.serverTime : clientReceivedAt;
  const latency = Math.max(0, (clientReceivedAt - serverTime) / 2);
  const progressMs = Math.max(0, (data.progressMs ?? 0) + latency);

  return {
    source: "api",
    trackId,
    trackName: data.trackName ?? null,
    artistName: data.artistName ?? null,
    artistId: data.artistId ?? null,
    imageUrl: data.imageUrl ?? null,
    durationMs: data.durationMs ?? 0,
    progressMsAtSync: progressMs,
    syncedAt: clientReceivedAt,
    // Keep metadata when paused — clearing felt like the player "broke".
    isPlaying: Boolean(data.isPlaying),
    deviceName: data.deviceName ?? null,
    contextType: data.contextType ?? null,
    contextUri: data.contextUri ?? null,
    contextName: data.contextName ?? null,
    isWamPlaylist: data.isWamPlaylist,
    wamPlaylistId: data.wamPlaylistId ?? null,
    itemKind: data.itemKind === "episode" ? "episode" : "track",
  };
}

export function isApiPayloadWithTrack(
  data: PlaybackApiPayload,
): data is PlaybackApiPayload & SpotifyCurrentPlayback {
  return typeof data.trackId === "string" && data.trackId.length > 0;
}
