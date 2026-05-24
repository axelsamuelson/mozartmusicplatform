import {
  shouldEnableLiveSessionHostSync,
  shouldSkipPlaybackApiPoll,
} from "@/lib/live/activeSessionMeta";
import { getEffectiveLiveSessionMode } from "@/lib/live/sessionMode";
import { getSpotifyCircuitState } from "@/lib/spotify/rateLimiter";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";
import type { AuditServerSnapshot } from "@/lib/audit/types";

const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_OPEN_MS = 5 * 60_000;
const CIRCUIT_THRESHOLD = 3;

export type ActiveSessionRefInput = {
  sessionId: string;
  code: string;
  hostUserId: string;
  wamControlsPlayback: boolean;
  jamsEnabled: boolean;
  jukeboxEnabled: boolean;
} | null;

async function spotifyCredentialsCheck(): Promise<{
  credentialsOk: boolean;
  clientIdsMatch: boolean;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!clientId || !clientSecret || !supabaseUrl) {
    return { credentialsOk: false, clientIdsMatch: false };
  }

  let credentialsOk = false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    credentialsOk = res.ok;
  } catch {
    credentialsOk = false;
  }

  let supabaseClientId: string | null = null;
  try {
    const authorize = new URL(`${supabaseUrl}/auth/v1/authorize`);
    authorize.searchParams.set("provider", "spotify");
    authorize.searchParams.set(
      "redirect_to",
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
    );
    const res = await fetch(authorize.toString(), { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    const match = location.match(/client_id=([^&]+)/);
    supabaseClientId = match?.[1] ?? null;
  } catch {
    supabaseClientId = null;
  }

  return {
    credentialsOk,
    clientIdsMatch:
      supabaseClientId != null && supabaseClientId === clientId,
  };
}

async function loadLiveSessionRow(
  sessionId: string,
): Promise<LiveSessionRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("live_sessions")
    .select(
      "id, code, host_user_id, spotify_track_id, is_playing, progress_ms, playback_updated_at, host_disconnected_at, wam_controls_playback, jams_enabled, jukebox_enabled, is_active",
    )
    .eq("id", sessionId)
    .maybeSingle();
  return data ? (data as LiveSessionRow) : null;
}

export async function collectServerAuditSnapshot(
  userId: string | null,
  activeSessionRef: ActiveSessionRefInput = null,
): Promise<AuditServerSnapshot> {
  const creds = await spotifyCredentialsCheck();
  const circuit = getSpotifyCircuitState();

  let hasUserToken = false;
  if (userId) {
    try {
      const supabase = await createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      hasUserToken = Boolean(sessionData.session?.provider_token);
    } catch {
      hasUserToken = false;
    }
  }

  let session: LiveSessionRow | null = null;
  if (activeSessionRef?.sessionId) {
    session = await loadLiveSessionRow(activeSessionRef.sessionId);
  }

  const skipPoll = shouldSkipPlaybackApiPoll(activeSessionRef, userId);
  const hostSync = shouldEnableLiveSessionHostSync(activeSessionRef, userId);

  return {
    generatedAt: new Date().toISOString(),
    userId,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      playbackPollingDisabled:
        process.env.NEXT_PUBLIC_DISABLE_PLAYBACK_POLLING === "true",
      liveAdvancedModes:
        process.env.NEXT_PUBLIC_LIVE_ADVANCED_MODES === "true",
      spotifyCredentialsConfigured: Boolean(
        process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET,
      ),
      supabaseConfigured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    },
    spotify: {
      circuit: {
        state: circuit,
        recent429InWindow: 0,
        windowMs: CIRCUIT_WINDOW_MS,
        openMs: CIRCUIT_OPEN_MS,
        threshold: CIRCUIT_THRESHOLD,
      },
      credentialsOk: creds.credentialsOk,
      clientIdsMatch: creds.clientIdsMatch,
    },
    playback: {
      dedupEntries: 0,
      hasUserToken,
    },
    live: {
      activeSessionRef: activeSessionRef
        ? {
            sessionId: activeSessionRef.sessionId,
            code: activeSessionRef.code,
            hostUserId: activeSessionRef.hostUserId,
            wamControlsPlayback: activeSessionRef.wamControlsPlayback,
            jamsEnabled: activeSessionRef.jamsEnabled,
            jukeboxEnabled: activeSessionRef.jukeboxEnabled,
          }
        : null,
      skipPlaybackApiPoll: skipPoll,
      hostSyncEnabled: hostSync,
      session: session
        ? {
            id: session.id,
            code: session.code,
            mode: getEffectiveLiveSessionMode(session),
            spotify_track_id: session.spotify_track_id,
            is_playing: session.is_playing ?? null,
            progress_ms: session.progress_ms ?? null,
            playback_updated_at: session.playback_updated_at ?? null,
            host_disconnected_at: session.host_disconnected_at ?? null,
            wam_controls_playback: session.wam_controls_playback ?? false,
            jams_enabled: session.jams_enabled ?? false,
            jukebox_enabled: session.jukebox_enabled ?? false,
          }
        : null,
    },
  };
}
