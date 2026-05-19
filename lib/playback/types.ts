/** Unified playback state for the global Player bar. */
export type PlaybackState = {
  source: "sdk" | "api" | "none";
  trackId: string | null;
  trackName: string | null;
  artistName: string | null;
  imageUrl: string | null;
  durationMs: number;
  /** Last authoritative progress position (ms). */
  progressMsAtSync: number;
  /** `Date.now()` when progressMsAtSync was recorded. */
  syncedAt: number;
  isPlaying: boolean;
  deviceName: string | null;
  contextType: string | null;
  contextUri: string | null;
  contextName?: string | null;
  isWamPlaylist?: boolean;
  wamPlaylistId?: string | null;
  itemKind?: "track" | "episode";
};

export type PlaybackApiPayload = {
  serverTime?: number;
  error?: string;
  isPlaying: boolean;
  trackId?: string;
  trackName?: string;
  artistName?: string;
  imageUrl?: string;
  progressMs?: number;
  durationMs?: number;
  deviceName?: string;
  contextType?: string | null;
  contextUri?: string | null;
  contextName?: string | null;
  isWamPlaylist?: boolean;
  wamPlaylistId?: string | null;
  itemKind?: "track" | "episode";
};
