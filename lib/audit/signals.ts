import type {
  AuditClientSnapshot,
  AuditServerSnapshot,
  AuditSignal,
  WamAuditReport,
} from "@/lib/audit/types";

export function buildAuditSignals(
  server: AuditServerSnapshot,
  client: AuditClientSnapshot | null,
): AuditSignal[] {
  const signals: AuditSignal[] = [];

  if (server.spotify.circuit.state === "open") {
    signals.push({
      severity: "error",
      code: "CIRCUIT_OPEN",
      message:
        "Spotify API circuit breaker is open (too many 429s). Playback polling may return stale data for ~5 minutes.",
    });
  } else if (server.spotify.circuit.state === "half_open") {
    signals.push({
      severity: "warn",
      code: "CIRCUIT_HALF_OPEN",
      message: "Spotify circuit is probing after cooldown — expect brief API instability.",
    });
  }

  if (!server.spotify.credentialsOk) {
    signals.push({
      severity: "error",
      code: "SPOTIFY_CREDENTIALS_INVALID",
      message: "Server Spotify app credentials failed client-credentials check.",
    });
  } else if (!server.spotify.clientIdsMatch) {
    signals.push({
      severity: "error",
      code: "SPOTIFY_CLIENT_ID_MISMATCH",
      message: "Supabase Spotify OAuth client_id does not match SPOTIFY_CLIENT_ID in env.",
    });
  }

  if (server.environment.playbackPollingDisabled) {
    signals.push({
      severity: "warn",
      code: "PLAYBACK_POLLING_DISABLED",
      message: "NEXT_PUBLIC_DISABLE_PLAYBACK_POLLING is true — API playback poll is off.",
    });
  }

  if (!client) {
    signals.push({
      severity: "info",
      code: "NO_CLIENT_SNAPSHOT",
      message: "Open /audit in a browser tab with the player mounted for full client diagnostics.",
    });
    return signals;
  }

  if (!client.hasUser) {
    signals.push({
      severity: "warn",
      code: "NOT_LOGGED_IN",
      message: "No authenticated user in this tab.",
    });
  }

  if (client.hasUser && !client.hasToken) {
    signals.push({
      severity: "error",
      code: "NO_SPOTIFY_TOKEN",
      message: "Logged in but /api/spotify/token failed — reconnect Spotify.",
    });
  }

  if (client.connectError) {
    signals.push({
      severity: "error",
      code: "SDK_CONNECT_ERROR",
      message: client.connectError,
    });
  }

  if (client.circuitOpenClientHint) {
    signals.push({
      severity: "warn",
      code: "CIRCUIT_OPEN_CLIENT",
      message: "Last playback API response indicated circuit open (X-WAM-Circuit header).",
    });
  }

  if (client.hasToken && !client.sdkDeviceReady && !client.skipApiPoll) {
    signals.push({
      severity: "warn",
      code: "SDK_NOT_READY",
      message:
        "Web Playback SDK device not ready while API poll is active — in-browser play may fail until SDK connects.",
    });
  }

  if (client.skipApiPoll && server.live.activeSessionRef) {
    signals.push({
      severity: "info",
      code: "POLL_SKIPPED_LIVE",
      message:
        "Per-user Spotify playback poll is skipped — track state should come from host sync + Realtime.",
    });
  }

  if (client.isPollLeader === false) {
    signals.push({
      severity: "info",
      code: "NOT_POLL_LEADER",
      message:
        "This tab is not the playback poll leader — another WAM tab may be polling Spotify API.",
    });
  }

  if (!client.tabVisible) {
    signals.push({
      severity: "info",
      code: "TAB_HIDDEN",
      message: "Browser tab is hidden — playback polling is paused in this tab.",
    });
  }

  if (
    client.hostSyncEnabled &&
    server.live.session &&
    !server.live.session.spotify_track_id
  ) {
    signals.push({
      severity: "warn",
      code: "HOST_SYNC_NO_TRACK",
      message: "Host sync is enabled but session has no spotify_track_id yet.",
    });
  }

  if (
    server.live.session?.host_disconnected_at &&
    client.activeLiveSession?.hostUserId === server.live.activeSessionRef?.hostUserId
  ) {
    signals.push({
      severity: "warn",
      code: "HOST_DISCONNECTED",
      message: "Live session marks host as disconnected — guests may see stale playback.",
    });
  }

  if (client.liveChannelConnected === false && client.activeLiveSession) {
    signals.push({
      severity: "error",
      code: "REALTIME_DISCONNECTED",
      message: "Live Realtime channel is not connected on this page.",
    });
  }

  if (
    client.playback?.source === "sdk" &&
    server.live.skipPlaybackApiPoll &&
    client.activeLiveSession &&
    client.activeLiveSession.hostUserId !== server.userId
  ) {
    signals.push({
      severity: "info",
      code: "GUEST_SDK_PRIMARY",
      message:
        "Guest tab still has SDK playback while in live session — expected: follow host via Realtime, not own SDK.",
    });
  }

  const apiTrack = client.playback?.source === "api" ? client.playback.trackId : null;
  const sdkTrack =
    client.playback?.source === "sdk" ? client.playback.trackId : null;
  if (
    apiTrack &&
    sdkTrack &&
    apiTrack !== sdkTrack &&
    !client.skipApiPoll
  ) {
    signals.push({
      severity: "warn",
      code: "SDK_API_TRACK_MISMATCH",
      message: `SDK track (${sdkTrack}) differs from API track (${apiTrack}).`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      severity: "info",
      code: "OK",
      message: "No obvious playback or live-session issues detected in this snapshot.",
    });
  }

  return signals;
}

export function mergeAuditReport(
  server: AuditServerSnapshot,
  client: AuditClientSnapshot | null,
): WamAuditReport {
  return {
    generatedAt: new Date().toISOString(),
    server,
    client,
    signals: buildAuditSignals(server, client),
  };
}
