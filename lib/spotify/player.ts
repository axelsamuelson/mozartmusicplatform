import type { ItemType } from "@/lib/spotify/api";

/** Spotify Web Playback SDK (subset). */
export interface SpotifyWebPlaybackTrack {
  uri: string;
  id: string;
  type: string;
  name: string;
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
  track_window: {
    current_track: SpotifyWebPlaybackTrack | null;
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
let connectPromise: Promise<SpotifyWebPlaybackPlayer | null> | null = null;
/** Device id from SDK `ready` — required for Web API `me/player/play`. */
let playbackDeviceId: string | null = null;

export function spotifyUri(type: ItemType, spotifyId: string): string {
  return `spotify:${type}:${spotifyId}`;
}

export function registerPlaybackTokenProvider(provider: AccessTokenProvider): void {
  tokenProvider = provider;
}

export function unregisterPlaybackTokenProvider(): void {
  tokenProvider = null;
  disconnectPlayback();
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
  if (!tokenProvider) {
    throw new Error("Playback token provider not registered");
  }
  const t = await tokenProvider();
  if (!t) throw new Error("No Spotify access token in session — sign in again.");
  return t;
}

async function readSpotifyFailDetail(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return "";
  }
}

/** True when this tab’s Web Playback SDK has an active player state (no GET /me/player). */
async function isWamSdkActiveOnDevice(): Promise<boolean> {
  if (!innerPlayer || !playbackDeviceId) return false;
  try {
    const state = await innerPlayer.getCurrentState();
    return state !== null;
  } catch {
    return false;
  }
}

/** Spotify docs often say 204; some responses use 200 with an empty or non-JSON body. */
function isSpotifyPlayerCommandSuccess(res: Response): boolean {
  return res.ok;
}

export async function pauseViaApi(providerToken: string): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const detail = await readSpotifyFailDetail(res);
  throw new Error(
    detail ? `Spotify pause failed (${res.status}): ${detail}` : `Spotify pause failed (${res.status})`,
  );
}

export async function resumeViaApi(providerToken: string): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${providerToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const detail = await readSpotifyFailDetail(res);
  throw new Error(
    detail ? `Spotify play failed (${res.status}): ${detail}` : `Spotify play failed (${res.status})`,
  );
}

export async function nextViaApi(providerToken: string): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const detail = await readSpotifyFailDetail(res);
  throw new Error(
    detail ? `Spotify next failed (${res.status}): ${detail}` : `Spotify next failed (${res.status})`,
  );
}

export async function previousViaApi(providerToken: string): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player/previous", {
    method: "POST",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const detail = await readSpotifyFailDetail(res);
  throw new Error(
    detail
      ? `Spotify previous failed (${res.status}): ${detail}`
      : `Spotify previous failed (${res.status})`,
  );
}

export async function seekViaApi(providerToken: string, ms: number): Promise<void> {
  const pos = Math.max(0, Math.floor(ms));
  const url = new URL("https://api.spotify.com/v1/me/player/seek");
  url.searchParams.set("position_ms", String(pos));
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  const detail = await readSpotifyFailDetail(res);
  throw new Error(
    detail ? `Spotify seek failed (${res.status}): ${detail}` : `Spotify seek failed (${res.status})`,
  );
}

async function ensurePlayer(): Promise<SpotifyWebPlaybackPlayer> {
  if (innerPlayer) return innerPlayer;
  if (connectPromise) {
    const p = await connectPromise;
    if (!p) throw new Error("Spotify player failed to connect");
    return p;
  }

  connectPromise = (async () => {
    await loadSdk();
    if (!window.Spotify) return null;

    const player = new window.Spotify.Player({
      name: "WAM Player",
      getOAuthToken: (cb) => {
        void getTokenString()
          .then((token) => cb(token))
          .catch((err) => {
            console.error(
              "[WAM Player] token",
              err instanceof Error ? err.message : err,
            );
          });
      },
      volume: 0.7,
    });

    const readyDeviceId = new Promise<string>((resolve, reject) => {
      const t = window.setTimeout(
        () => reject(new Error("Spotify player did not become ready in time")),
        25000,
      );
      player.addListener("ready", ({ device_id }) => {
        window.clearTimeout(t);
        if (device_id) {
          playbackDeviceId = device_id;
          resolve(device_id);
        } else {
          reject(new Error("Spotify player ready without device id"));
        }
      });
    });

    player.addListener("not_ready", () => {
      playbackDeviceId = null;
    });

    player.addListener("initialization_error", ({ message }) => {
      console.error("[WAM Player] init", message);
    });
    player.addListener("authentication_error", ({ message }) => {
      console.error("[WAM Player] auth", message);
    });
    player.addListener("account_error", ({ message }) => {
      console.error("[WAM Player] account", message);
    });
    player.addListener("playback_error", ({ message }) => {
      console.error("[WAM Player] playback", message);
    });

    const connected = await player.connect();
    if (!connected) {
      player.disconnect();
      return null;
    }

    await readyDeviceId;

    innerPlayer = player;
    return player;
  })();

  try {
    const p = await connectPromise;
    if (!p) throw new Error("Could not connect Spotify Web Playback");
    return p;
  } finally {
    connectPromise = null;
  }
}

export function disconnectPlayback(): void {
  if (innerPlayer) {
    try {
      innerPlayer.disconnect();
    } catch {
      /* ignore */
    }
    innerPlayer = null;
  }
  playbackDeviceId = null;
  sdkPromise = null;
}

type SpotifyDevice = { id: string; is_active?: boolean };

async function fetchDevices(token: string): Promise<SpotifyDevice[]> {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { devices?: SpotifyDevice[] };
  return data.devices ?? [];
}

const DEVICE_VISIBILITY_MAX_ATTEMPTS = 10;
const DEVICE_VISIBILITY_POLL_MS = 1500;

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
      await new Promise((r) => setTimeout(r, DEVICE_VISIBILITY_POLL_MS));
    }
  }
  throw new Error(
    "This browser player is not visible to Spotify yet. Wait a few seconds and try again.",
  );
}

/** Make the Web Playback device the active target (avoids 404 on play). */
async function transferPlaybackToDevice(
  deviceId: string,
  token: string,
): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
    cache: "no-store",
  });
  if (isSpotifyPlayerCommandSuccess(res)) return;
  if (res.status === 404) return;
  const text = await res.text().catch(() => "");
  throw new Error(
    text
      ? `Transfer to this player failed (${res.status}): ${text}`
      : `Transfer to this player failed (${res.status})`,
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
  await new Promise((r) => setTimeout(r, 250));

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

  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }

  if (res.status === 404) {
    throw new Error(
      "Playback device not found. Open Spotify on another device, then try again, or refresh this page.",
    );
  }
  if (res.status === 403) {
    throw new Error(
      "Spotify blocked playback (Premium or scopes required for this device).",
    );
  }

  throw new Error(
    detail ? `Start playback failed (${res.status}): ${detail}` : `Start playback failed (${res.status})`,
  );
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

export async function pause(): Promise<void> {
  const token = await getTokenString();
  if (innerPlayer && (await isWamSdkActiveOnDevice())) {
    await innerPlayer.pause();
    return;
  }
  await pauseViaApi(token);
}

export async function resume(): Promise<void> {
  const token = await getTokenString();
  if (innerPlayer && (await isWamSdkActiveOnDevice())) {
    const player = await ensurePlayer();
    await player.resume();
    return;
  }
  await resumeViaApi(token);
}

export async function next(): Promise<void> {
  const token = await getTokenString();
  if (innerPlayer && (await isWamSdkActiveOnDevice())) {
    const player = await ensurePlayer();
    await player.nextTrack();
    return;
  }
  await nextViaApi(token);
}

export async function previous(): Promise<void> {
  const token = await getTokenString();
  if (innerPlayer && (await isWamSdkActiveOnDevice())) {
    const player = await ensurePlayer();
    await player.previousTrack();
    return;
  }
  await previousViaApi(token);
}

export async function seek(ms: number): Promise<void> {
  const token = await getTokenString();
  if (innerPlayer && (await isWamSdkActiveOnDevice())) {
    const player = await ensurePlayer();
    await player.seek(ms);
    return;
  }
  await seekViaApi(token, ms);
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
