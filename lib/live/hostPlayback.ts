import { spotifyPlayerErrorFromResponse } from "@/lib/spotify/playerCommandError";

/** Server-side Spotify playback control for Jams host. */

export class HostPlaybackError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HostPlaybackError";
    this.status = status;
  }
}

export async function playTrackOnHostDevice(
  accessToken: string,
  spotifyTrackId: string,
  deviceId?: string | null,
): Promise<void> {
  const url = new URL("https://api.spotify.com/v1/me/player/play");
  if (deviceId) url.searchParams.set("device_id", deviceId);

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris: [`spotify:track:${spotifyTrackId}`],
    }),
    cache: "no-store",
  });

  if (res.status === 204 || res.ok) return;

  const detail = await res.text().catch(() => "");
  const err = spotifyPlayerErrorFromResponse("play", res.status, detail);
  throw new HostPlaybackError(
    res.status,
    err.reason === "NO_ACTIVE_DEVICE"
      ? "The host has no active Spotify speaker. Open Spotify on the host device, then try again."
      : err.message,
  );
}
