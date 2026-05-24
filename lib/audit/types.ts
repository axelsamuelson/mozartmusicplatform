export type AuditSeverity = "info" | "warn" | "error";

export type AuditSignal = {
  severity: AuditSeverity;
  code: string;
  message: string;
};

export type AuditEnvironment = {
  nodeEnv: string;
  playbackPollingDisabled: boolean;
  liveAdvancedModes: boolean;
  spotifyCredentialsConfigured: boolean;
  supabaseConfigured: boolean;
};

export type AuditSpotifyServer = {
  circuit: {
    state: string;
    recent429InWindow: number;
    windowMs: number;
    openMs: number;
    threshold: number;
  };
  credentialsOk: boolean;
  clientIdsMatch: boolean;
};

export type AuditPlaybackServer = {
  dedupEntries: number;
  hasUserToken: boolean;
};

export type AuditLiveServer = {
  activeSessionRef: {
    sessionId: string;
    code: string;
    hostUserId: string;
    wamControlsPlayback: boolean;
    jamsEnabled: boolean;
    jukeboxEnabled: boolean;
  } | null;
  skipPlaybackApiPoll: boolean;
  hostSyncEnabled: boolean;
  session: {
    id: string;
    code: string;
    mode: string;
    spotify_track_id: string | null;
    is_playing: boolean | null;
    progress_ms: number | null;
    playback_updated_at: string | null;
    host_disconnected_at: string | null;
    wam_controls_playback: boolean;
    jams_enabled: boolean;
    jukebox_enabled: boolean;
  } | null;
};

export type AuditServerSnapshot = {
  generatedAt: string;
  userId: string | null;
  environment: AuditEnvironment;
  spotify: AuditSpotifyServer;
  playback: AuditPlaybackServer;
  live: AuditLiveServer;
};

export type AuditClientPlayback = {
  source: string | null;
  trackId: string | null;
  isPlaying: boolean | null;
  progressMs: number | null;
  durationMs: number | null;
  deviceName: string | null;
  syncedAt: number | null;
  contextType: string | null;
};

export type AuditClientSnapshot = {
  generatedAt: string;
  tabId: string;
  tabVisible: boolean;
  isPollLeader: boolean | null;
  hasUser: boolean;
  hasToken: boolean;
  playbackReady: boolean;
  connectError: string | null;
  sdkDeviceReady: boolean;
  skipApiPoll: boolean;
  hostSyncEnabled: boolean;
  queueAutoAdvanceEnabled: boolean;
  circuitOpenClientHint: boolean;
  playback: AuditClientPlayback | null;
  activeLiveSession: {
    sessionId: string;
    code: string;
    hostUserId: string;
    wamControlsPlayback: boolean;
    jamsEnabled: boolean;
    jukeboxEnabled: boolean;
  } | null;
  liveChannelConnected: boolean | null;
  liveParticipantCount: number | null;
};

export type WamAuditReport = {
  generatedAt: string;
  server: AuditServerSnapshot;
  client: AuditClientSnapshot | null;
  signals: AuditSignal[];
};
