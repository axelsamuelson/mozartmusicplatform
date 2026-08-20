import type { ItemType } from "@/lib/spotify/api";
import {
  getPlaybackAccessToken,
  invalidatePlaybackAccessToken,
} from "@/lib/spotify/clientPlaybackToken";
import {
  PlaybackCancelledError,
  SpotifyPlayerError,
  friendlyPlayerCommandMessage,
  isNoActiveDeviceError,
  spotifyPlayerErrorFromResponse,
  type SpotifyPlayerCommand,
} from "@/lib/spotify/playerCommandError";
import {
  requestPlaybackDeviceChoice,
  type PlaybackDevice,
} from "@/lib/spotify/playbackDeviceChoice";

/** Spotify Web Playback SDK (subset). */
export interface SpotifyWebPlaybackTrack {
  uri: string;
  id: string;
  type: string;
  name: string;
  duration_ms?: number;
  album: {
    name: string;
    images: { url: string }[];
  };
  artists: { name: string; uri: string }[];
}

export interface SpotifyWebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  context?: {
    uri: string | null;
    metadata: Record<string, unknown>;
    type: string;
  } | null;
  track_window: {
    current_track: SpotifyWebPlaybackTrack | null;
    next_tracks?: SpotifyWebPlaybackTrack[];
    previous_tracks?: SpotifyWebPlaybackTrack[];
  };
}

export interface SpotifyWebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(
    event:
      | "ready"
      | "not_ready"
      | "initialization_error"
      | "authentication_error"
      | "account_error"
      | "playback_error",
    cb: (evt: { device_id?: string; message?: string }) => void,
  ): void;
  removeListener(
    event:
      | "ready"
      | "not_ready"
      | "initialization_error"
      | "authentication_error"
      | "account_error"
      | "playback_error",
    cb: (evt: unknown) => void,
  ): boolean;
  getCurrentState(): Promise<SpotifyWebPlaybackState | null>;
  setVolume(volume: number): Promise<void>;
  getVolume(): Promise<number>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement(): Promise<void>;
}

export interface SpotifyWebPlaybackSDK {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyWebPlaybackPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifyWebPlaybackSDK;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export type AccessTokenProvider = () => Promise<string | null>;

let tokenProvider: AccessTokenProvider | null = null;
let sdkPromise: Promise<void> | null = null;
let innerPlayer: SpotifyWebPlaybackPlayer | null = null;
/** Last SDK player_state_changed payload (null when this tab is not the active player). */
let lastSdkState: SpotifyWebPlaybackState | null = null;
let connectPromise: Promise<SpotifyWebPlaybackPlayer | null> | null = null;
/** Device id from SDK `ready` — required for Web API `me/player/play`. */
let playbackDeviceId: string | null = null;
/** Bumped on disconnect so in-flight connect attempts abort. */
let connectGeneration = 0;
let pendingReadyReject: ((err: Error) => void) | null = null;

type StateChangeListener = (state: SpotifyWebPlaybackState | null) => void;
const stateChangeListeners = new Set<StateChangeListener>();

const READY_TIMEOUT_MS = 45_000;
const MAX_CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 1_500;

export function registerStateChangeListener(listener: StateChangeListener): () => void {
  stateChangeListeners.add(listener);
  return () => {
    stateChangeListeners.delete(listener);
  };
}

function notifyStateChangeListeners(state: SpotifyWebPlaybackState | null): void {
  lastSdkState = state;
  for (const listener of stateChangeListeners) {
    try {
      listener(state);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function spotifyUri(type: ItemType, spotifyId: string): string {
  return `spotify:${type}:${spotifyId}`;
}

export function spotifyItemHref(type: ItemType, spotifyId: string): string {
  if (type === "artist") return `/artist/${encodeURIComponent(spotifyId)}`;
  return `/item/${encodeURIComponent(spotifyId)}?type=${type}`;
}

export function registerPlaybackTokenProvider(provider: AccessTokenProvider): void {
  tokenProvider = provider;
}

export function unregisterPlaybackTokenProvider(): void {
  tokenProvider = null;
}

function abortPendingReady(reason: string): void {
  pendingReadyReject?.(new Error(reason));
  pendingReadyReject = null;
}

function isConnectRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("did not start in time") ||
    msg.includes("would not connect") ||
    msg.includes("Playback disconnected") ||
    msg.includes("failed to start")
  );
}

export function isPlaybackDeviceReady(): boolean {
  return Boolean(innerPlayer && playbackDeviceId);
}

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify SDK is browser-only"));
  }
  if (window.Spotify) {
    return Promise.resolve();
  }
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://sdk.scdn.co/spotify-player.js"]',
    );
    if (existing) {
      const t0 = Date.now();
      const iv = window.setInterval(() => {
        if (window.Spotify) {
          window.clearInterval(iv);
          resolve();
        } else if (Date.now() - t0 > 15000) {
          window.clearInterval(iv);
          reject(new Error("Spotify SDK load timeout"));
        }
      }, 50);
      return;
    }

    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      prev?.();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => {
      reject(new Error("Failed to load Spotify Web Playback SDK"));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}

async function getTokenString(): Promise<string> {
  try {
    return await getPlaybackAccessToken();
  } catch (e) {
    if (e instanceof Error && e.message.trim()) throw e;
    throw new Error("Could not refresh Spotify. Check your connection and try again.");
  }
}

async function withPlaybackToken(
  fn: (token: string) => Promise<void>,
): Promise<void> {
  const token = await getTokenString();
  try {
    await fn(token);
  } catch (e) {
    const status = e instanceof SpotifyPlayerError ? e.status : 0;
    const msg = e instanceof Error ? e.message : "";
    if (status !== 401 && !msg.includes("(401)")) throw e;
    invalidatePlaybackAccessToken();
    const retry = await getTokenString();
    await fn(retry);
  }
}

async function readSpotifyFailDetail(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function throwPlayerCommandError(
  command: SpotifyPlayerCommand,
  res: Response,
  body: string,
): never {
  throw spotifyPlayerErrorFromResponse(command, res.status, body);
}

async function playerCommandRequest(
  command: SpotifyPlayerCommand,
  url: string,
  init: RequestInit,
): Promise<void> {
  const res = await fetch(url, init);
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const body = await readSpotifyFailDetail(res);
  throwPlayerCommandError(command, res, body);
}

function withDeviceQuery(url: string, deviceId?: string): string {
  if (!deviceId) return url;
  const u = new URL(url);
  u.searchParams.set("device_id", deviceId);
  return u.toString();
}

function waitMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Spotify docs often say 204; some responses use 200 with an empty or non-JSON body. */
function isSpotifyPlayerCommandSuccess(res: Response): boolean {
  return res.ok;
}

export async function pauseViaApi(
  providerToken: string,
  deviceId?: string,
): Promise<void> {
  await playerCommandRequest(
    "pause",
    withDeviceQuery("https://api.spotify.com/v1/me/player/pause", deviceId),
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    },
  );
}

export async function resumeViaApi(
  providerToken: string,
  deviceId?: string,
): Promise<void> {
  await playerCommandRequest("play", withDeviceQuery("https://api.spotify.com/v1/me/player/play", deviceId), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${providerToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });
}

export async function nextViaApi(
  providerToken: string,
  deviceId?: string,
): Promise<void> {
  await playerCommandRequest(
    "next",
    withDeviceQuery("https://api.spotify.com/v1/me/player/next", deviceId),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    },
  );
}

export async function previousViaApi(
  providerToken: string,
  deviceId?: string,
): Promise<void> {
  await playerCommandRequest(
    "previous",
    withDeviceQuery("https://api.spotify.com/v1/me/player/previous", deviceId),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    },
  );
}

export async function seekViaApi(
  providerToken: string,
  ms: number,
  deviceId?: string,
): Promise<void> {
  const pos = Math.max(0, Math.floor(ms));
  const url = new URL("https://api.spotify.com/v1/me/player/seek");
  url.searchParams.set("position_ms", String(pos));
  await playerCommandRequest("seek", withDeviceQuery(url.toString(), deviceId), {
    method: "PUT",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
}

function friendlySdkError(
  kind: "initialization" | "authentication" | "account",
  message?: string,
): string {
  if (kind === "account") {
    return "Spotify Premium is required to use the in-browser player.";
  }
  if (kind === "authentication") {
    return message?.trim()
      ? `Spotify authentication failed: ${message}. Sign out and sign in with Spotify again (Premium required for in-browser playback).`
      : "Spotify session expired or missing streaming permission. Sign out and sign in with Spotify again (Premium required).";
  }
  return message?.trim()
    ? `Spotify player failed to start: ${message}`
    : "Spotify player failed to start. Refresh the page and try again.";
}

async function connectWebPlaybackPlayer(
  generation: number,
): Promise<SpotifyWebPlaybackPlayer | null> {
  await loadSdk();
  if (!window.Spotify) return null;
  if (generation !== connectGeneration) return null;

  try {
    await getTokenString();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No Spotify access token";
    throw new Error(
      msg.includes("sign in")
        ? msg
        : `${msg}. Sign out and sign in with Spotify again.`,
    );
  }

  const player = new window.Spotify.Player({
    name: "WAM Player",
    getOAuthToken: (cb) => {
      void getTokenString()
        .then((token) => cb(token))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Token error";
          console.error("[WAM Player] token", msg);
          abortPendingReady(
            "Could not refresh Spotify token. Sign in again with Spotify.",
          );
        });
    },
    volume: 0.7,
  });

  const readyDeviceId = new Promise<string>((resolve, reject) => {
    const fail = (err: Error) => {
      window.clearTimeout(timeoutId);
      pendingReadyReject = null;
      try {
        player.disconnect();
      } catch {
        /* ignore */
      }
      reject(err);
    };

    pendingReadyReject = fail;

    const timeoutId = window.setTimeout(() => {
      pendingReadyReject = null;
      fail(
        new Error(
          "In-browser Spotify player did not start in time. Close other WAM tabs, refresh, or control playback on your phone/desktop Spotify app.",
        ),
      );
    }, READY_TIMEOUT_MS);

    player.addListener("ready", ({ device_id }) => {
      if (generation !== connectGeneration) {
        fail(new Error("Playback disconnected"));
        return;
      }
      window.clearTimeout(timeoutId);
      pendingReadyReject = null;
      if (device_id) {
        playbackDeviceId = device_id;
        resolve(device_id);
      } else {
        fail(new Error("Spotify player ready without device id"));
      }
    });

    player.addListener("initialization_error", ({ message }) => {
      console.error("[WAM Player] init", message);
      fail(new Error(friendlySdkError("initialization", message)));
    });
    player.addListener("authentication_error", ({ message }) => {
      console.error("[WAM Player] auth", message);
      fail(new Error(friendlySdkError("authentication", message)));
    });
    player.addListener("account_error", ({ message }) => {
      console.error("[WAM Player] account", message);
      fail(new Error(friendlySdkError("account", message)));
    });
  });

  player.addListener("not_ready", () => {
    playbackDeviceId = null;
  });

  player.addListener("playback_error", ({ message }) => {
    console.error("[WAM Player] playback", message);
  });

  (
    player as SpotifyWebPlaybackPlayer & {
      addListener(
        event: "player_state_changed",
        cb: (state: SpotifyWebPlaybackState | null) => void,
      ): void;
    }
  ).addListener("player_state_changed", (state) => {
    notifyStateChangeListeners(state ?? null);
  });

  const connected = await player.connect();
  if (generation !== connectGeneration) {
    try {
      player.disconnect();
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!connected) {
    try {
      player.disconnect();
    } catch {
      /* ignore */
    }
    throw new Error(
      "Spotify would not connect this browser tab. Close other WAM tabs and try again.",
    );
  }

  await readyDeviceId;
  return player;
}

async function ensurePlayer(): Promise<SpotifyWebPlaybackPlayer> {
  if (innerPlayer) return innerPlayer;
  if (connectPromise) {
    const p = await connectPromise;
    if (!p) throw new Error("Spotify player failed to connect");
    return p;
  }

  const generation = connectGeneration;

  connectPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_CONNECT_ATTEMPTS; attempt++) {
      if (generation !== connectGeneration) return null;
      try {
        const player = await connectWebPlaybackPlayer(generation);
        if (!player || generation !== connectGeneration) return null;
        innerPlayer = player;
        return player;
      } catch (e) {
        lastError = e;
        if (generation !== connectGeneration) return null;
        innerPlayer = null;
        playbackDeviceId = null;
        if (
          attempt >= MAX_CONNECT_ATTEMPTS - 1 ||
          !isConnectRetryableError(e)
        ) {
          throw e;
        }
        await new Promise((r) =>
          window.setTimeout(r, CONNECT_RETRY_DELAY_MS * (attempt + 1)),
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Spotify player failed to connect");
  })();

  try {
    const p = await connectPromise;
    if (!p) {
      throw new Error(
        "Could not connect the in-browser Spotify player. Playback on your other devices still works.",
      );
    }
    return p;
  } finally {
    connectPromise = null;
  }
}

export function disconnectPlayback(): void {
  connectGeneration++;
  abortPendingReady("Playback disconnected");
  connectPromise = null;
  stateChangeListeners.clear();

  if (innerPlayer) {
    try {
      innerPlayer.disconnect();
    } catch {
      /* ignore */
    }
    innerPlayer = null;
  }
  playbackDeviceId = null;
  lastSdkState = null;
}

type SpotifyDeviceRow = {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
};

function mapPlaybackDevice(row: SpotifyDeviceRow): PlaybackDevice | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  return {
    id,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Spotify device",
    type: typeof row.type === "string" ? row.type : "Unknown",
    is_active: Boolean(row.is_active),
    is_this_browser: Boolean(playbackDeviceId && id === playbackDeviceId),
  };
}

async function fetchDevices(token: string): Promise<PlaybackDevice[]> {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { devices?: SpotifyDeviceRow[] };
  const mapped = (data.devices ?? [])
    .map(mapPlaybackDevice)
    .filter((d): d is PlaybackDevice => d != null);
  if (playbackDeviceId && !mapped.some((d) => d.id === playbackDeviceId)) {
    mapped.unshift({
      id: playbackDeviceId,
      name: "This browser",
      type: "Computer",
      is_active: false,
      is_this_browser: true,
    });
  }
  return mapped;
}

const DEVICE_VISIBILITY_MAX_ATTEMPTS = 5;
const DEVICE_VISIBILITY_POLL_MS = 2_000;

/** Web API may lag behind SDK `ready`; poll until this device id appears. */
async function waitUntilDeviceVisible(
  deviceId: string,
  token: string,
): Promise<void> {
  if (playbackDeviceId === deviceId && innerPlayer) {
    return;
  }

  for (let attempt = 0; attempt < DEVICE_VISIBILITY_MAX_ATTEMPTS; attempt++) {
    const devices = await fetchDevices(token);
    if (devices.some((d) => d.id === deviceId)) return;
    if (attempt < DEVICE_VISIBILITY_MAX_ATTEMPTS - 1) {
      await waitMs(DEVICE_VISIBILITY_POLL_MS);
    }
  }
  throw new SpotifyPlayerError(
    "play",
    404,
    "NO_ACTIVE_DEVICE",
    "This browser player is not visible to Spotify yet. Wait a few seconds and try again.",
  );
}

/** Make the Web Playback device the active target (avoids 404 on play). */
async function transferPlaybackToDevice(
  deviceId: string,
  token: string,
  play = false,
): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  if (res.status === 404) return;
  const text = await res.text().catch(() => "");
  throw spotifyPlayerErrorFromResponse("transfer", res.status, text);
}

async function activateDeviceAndRetry(
  token: string,
  deviceId: string,
  run: (deviceId: string) => Promise<void>,
): Promise<void> {
  await transferPlaybackToDevice(deviceId, token);
  await waitMs(350);
  await run(deviceId);
}

/**
 * Run a player command, recovering from NO_ACTIVE_DEVICE by transferring
 * to this browser, a single available speaker, or asking the user to pick.
 */
async function runPlayerCommandWithDeviceRecovery(
  token: string,
  command: SpotifyPlayerCommand,
  run: (deviceId?: string) => Promise<void>,
): Promise<void> {
  try {
    await run(undefined);
    return;
  } catch (e) {
    if (!isNoActiveDeviceError(e)) throw e;
  }

  if (playbackDeviceId) {
    try {
      await activateDeviceAndRetry(token, playbackDeviceId, run);
      return;
    } catch (e) {
      if (!isNoActiveDeviceError(e)) throw e;
    }
  }

  const devices = await fetchDevices(token);
  if (devices.length === 1) {
    await activateDeviceAndRetry(token, devices[0]!.id, run);
    return;
  }
  if (devices.length > 1) {
    const picked = await requestPlaybackDeviceChoice(devices);
    if (!picked) throw new PlaybackCancelledError();
    await activateDeviceAndRetry(token, picked, run);
    return;
  }

  throw new SpotifyPlayerError(
    command,
    404,
    "NO_ACTIVE_DEVICE",
    friendlyPlayerCommandMessage(command, 404, "NO_ACTIVE_DEVICE"),
  );
}

async function startPlaybackViaWebApi(spotifyUri: string): Promise<void> {
  if (!playbackDeviceId) {
    throw new Error("Spotify player device is not ready yet. Wait a moment and try again.");
  }
  const deviceId = playbackDeviceId;
  const token = await getTokenString();

  await waitUntilDeviceVisible(deviceId, token);
  await transferPlaybackToDevice(deviceId, token);
  await waitMs(250);

  const { kind, uri } = parseSpotifyUri(spotifyUri);
  const body =
    kind === "track"
      ? JSON.stringify({ uris: [uri] })
      : JSON.stringify({ context_uri: uri });

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function putPlay(useDeviceQuery: boolean): Promise<Response> {
    const url = new URL("https://api.spotify.com/v1/me/player/play");
    if (useDeviceQuery) {
      url.searchParams.set("device_id", deviceId);
    }
    return fetch(url.toString(), {
      method: "PUT",
      headers: authHeaders,
      body,
      cache: "no-store",
    });
  }

  let res = await putPlay(false);
  if (res.status === 404) {
    res = await putPlay(true);
  }

  if (res.status === 204 || res.status === 200) return;

  const detail = await res.text().catch(() => "");
  const err = spotifyPlayerErrorFromResponse("play", res.status, detail);
  if (!err.isNoActiveDevice) throw err;

  const devices = await fetchDevices(token);
  if (devices.length === 0) throw err;
  const targetId =
    devices.length === 1
      ? devices[0]!.id
      : await requestPlaybackDeviceChoice(devices);
  if (!targetId) throw new PlaybackCancelledError();
  await transferPlaybackToDevice(targetId, token);
  await waitMs(250);
  const retryUrl = new URL("https://api.spotify.com/v1/me/player/play");
  retryUrl.searchParams.set("device_id", targetId);
  const retry = await fetch(retryUrl.toString(), {
    method: "PUT",
    headers: authHeaders,
    body,
    cache: "no-store",
  });
  if (retry.ok) return;
  const retryBody = await retry.text().catch(() => "");
  throw spotifyPlayerErrorFromResponse("play", retry.status, retryBody);
}

function parseSpotifyUri(uri: string): { kind: "track" | "context"; uri: string } {
  const m = uri.match(/^spotify:(track|album|artist|playlist):/);
  if (m?.[1] === "track") return { kind: "track", uri };
  return { kind: "context", uri };
}

export async function play(spotifyUri: string): Promise<void> {
  const player = await ensurePlayer();
  await player.activateElement();
  await startPlaybackViaWebApi(spotifyUri);
}

export function peekSdkQueuedTrack(
  direction: "next" | "previous",
  index = 0,
): SpotifyWebPlaybackTrack | null {
  const list =
    direction === "next"
      ? lastSdkState?.track_window?.next_tracks
      : lastSdkState?.track_window?.previous_tracks;
  const track = list?.[index];
  return track?.id ? track : null;
}

export async function pause(): Promise<void> {
  if (innerPlayer) {
    await innerPlayer.pause();
    return;
  }
  await withPlaybackToken((token) =>
    runPlayerCommandWithDeviceRecovery(token, "pause", (deviceId) =>
      pauseViaApi(token, deviceId),
    ),
  );
}

export async function resume(): Promise<void> {
  if (innerPlayer) {
    const player = await ensurePlayer();
    await player.resume();
    return;
  }
  await withPlaybackToken((token) =>
    runPlayerCommandWithDeviceRecovery(token, "play", (deviceId) =>
      resumeViaApi(token, deviceId),
    ),
  );
}

export async function next(): Promise<void> {
  if (innerPlayer) {
    await innerPlayer.nextTrack();
    return;
  }
  await withPlaybackToken((token) =>
    runPlayerCommandWithDeviceRecovery(token, "next", (deviceId) =>
      nextViaApi(token, deviceId),
    ),
  );
}

export async function previous(): Promise<void> {
  if (innerPlayer) {
    await innerPlayer.previousTrack();
    return;
  }
  await withPlaybackToken((token) =>
    runPlayerCommandWithDeviceRecovery(token, "previous", (deviceId) =>
      previousViaApi(token, deviceId),
    ),
  );
}

export async function seek(ms: number): Promise<void> {
  if (innerPlayer) {
    const player = await ensurePlayer();
    await player.seek(ms);
    return;
  }
  await withPlaybackToken((token) =>
    runPlayerCommandWithDeviceRecovery(token, "seek", (deviceId) =>
      seekViaApi(token, ms, deviceId),
    ),
  );
}

export async function setVolume(level: number): Promise<void> {
  const v = Math.min(1, Math.max(0, level));
  const player = await ensurePlayer();
  await player.setVolume(v);
}

export async function getCurrentState(): Promise<SpotifyWebPlaybackState | null> {
  if (!innerPlayer) return null;
  return innerPlayer.getCurrentState();
}

export async function togglePlay(): Promise<void> {
  const player = await ensurePlayer();
  await player.togglePlay();
}

export async function getPlaybackVolume(): Promise<number> {
  const player = await ensurePlayer();
  return player.getVolume();
}

/** Connect the Web Playback device (call once after registering token provider). */
export async function connectPlayback(): Promise<void> {
  await ensurePlayer();
}
