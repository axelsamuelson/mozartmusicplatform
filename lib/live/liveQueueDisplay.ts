import type { SupabaseClient } from "@supabase/supabase-js";

import { getHostToken } from "@/lib/live/getHostToken";
import { shouldSkipHostPlaybackSync } from "@/lib/live/sessionMode";
import { fetchSpotifyPlayerQueue } from "@/lib/spotify/playerQueue";
import type { LiveQueueRow, LiveSessionRow } from "@/lib/types/live";

export const LIVE_QUEUE_DISPLAY_LIMIT = 5;

export type LiveQueueDisplayItem = {
  kind: "queued" | "playback";
  id: string;
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
  position: number;
  user_id?: string;
  display_name?: string | null;
};

export function sessionUsesHostPlaybackQueuePreview(
  session: Pick<LiveSessionRow, "jams_enabled" | "jukebox_enabled" | "wam_controls_playback">,
): boolean {
  return !shouldSkipHostPlaybackSync(session);
}

function queuedToDisplay(item: LiveQueueRow): LiveQueueDisplayItem {
  return {
    kind: "queued",
    id: item.id,
    spotify_track_id: item.spotify_track_id,
    track_name: item.track_name,
    artist_name: item.artist_name,
    image_url: item.image_url,
    position: item.position,
    user_id: item.user_id,
    display_name: item.display_name,
  };
}

export async function buildLiveQueueDisplay(
  admin: SupabaseClient,
  session: LiveSessionRow,
  pending: LiveQueueRow[],
): Promise<LiveQueueDisplayItem[]> {
  const orderedPending = [...pending].sort((a, b) => a.position - b.position);
  const items = orderedPending.slice(0, LIVE_QUEUE_DISPLAY_LIMIT).map(queuedToDisplay);

  if (!sessionUsesHostPlaybackQueuePreview(session) || items.length > 0) {
    return items;
  }

  const needed = LIVE_QUEUE_DISPLAY_LIMIT - items.length;
  if (needed <= 0) return items;

  const exclude = new Set<string>();
  if (session.spotify_track_id) exclude.add(session.spotify_track_id);
  for (const row of pending) exclude.add(row.spotify_track_id);
  for (const row of items) exclude.add(row.spotify_track_id);

  let hostToken: string | null = null;
  try {
    hostToken = await getHostToken(admin, session);
  } catch {
    return items;
  }
  if (!hostToken) return items;

  let spotifyQueue: Awaited<ReturnType<typeof fetchSpotifyPlayerQueue>>;
  try {
    spotifyQueue = await fetchSpotifyPlayerQueue(hostToken);
  } catch {
    return items;
  }

  let position = items.length;
  for (const track of spotifyQueue) {
    if (items.length >= LIVE_QUEUE_DISPLAY_LIMIT) break;
    if (exclude.has(track.spotify_track_id)) continue;
    exclude.add(track.spotify_track_id);
    position += 1;
    items.push({
      kind: "playback",
      id: `playback:${track.spotify_track_id}:${position}`,
      spotify_track_id: track.spotify_track_id,
      track_name: track.track_name,
      artist_name: track.artist_name,
      image_url: track.image_url,
      position,
      display_name: "Host",
    });
  }

  return items;
}
