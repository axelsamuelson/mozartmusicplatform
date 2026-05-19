import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchHostPlaybackUpcoming } from "@/lib/live/hostPlaybackUpcoming";
import {
  getCachedPlaybackQueueDisplay,
  setCachedPlaybackQueueDisplay,
} from "@/lib/live/queueDisplayCache";
import { shouldSkipHostPlaybackSync } from "@/lib/live/sessionMode";
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

export type BuildLiveQueueDisplayOptions = {
  callerUserId?: string;
  /** When the host loads the queue, pass their Spotify token (cookie session). */
  hostAccessToken?: string;
};

export async function buildLiveQueueDisplay(
  admin: SupabaseClient,
  session: LiveSessionRow,
  pending: LiveQueueRow[],
  options?: BuildLiveQueueDisplayOptions,
): Promise<LiveQueueDisplayItem[]> {
  const orderedPending = [...pending].sort((a, b) => a.position - b.position);
  const items = orderedPending.slice(0, LIVE_QUEUE_DISPLAY_LIMIT).map(queuedToDisplay);

  if (!sessionUsesHostPlaybackQueuePreview(session) || items.length > 0) {
    return items;
  }

  const needed = LIVE_QUEUE_DISPLAY_LIMIT - items.length;
  if (needed <= 0) return items;

  const cached = getCachedPlaybackQueueDisplay(
    session.id,
    session.spotify_track_id,
    pending.length,
  );
  if (cached && cached.length > 0) {
    let position = items.length;
    for (const row of cached) {
      if (items.length >= LIVE_QUEUE_DISPLAY_LIMIT) break;
      position += 1;
      items.push({ ...row, position });
    }
    return items;
  }

  const exclude = new Set<string>();
  if (session.spotify_track_id) exclude.add(session.spotify_track_id);
  for (const row of pending) exclude.add(row.spotify_track_id);

  const spotifyUpcoming = await fetchHostPlaybackUpcoming(
    admin,
    session,
    needed,
    exclude,
    {
      callerUserId: options?.callerUserId,
      hostAccessToken: options?.hostAccessToken,
    },
  );

  const playbackRows: LiveQueueDisplayItem[] = [];
  let position = items.length;
  for (const track of spotifyUpcoming) {
    if (playbackRows.length >= needed) break;
    position += 1;
    playbackRows.push({
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

  if (playbackRows.length > 0) {
    setCachedPlaybackQueueDisplay(
      session.id,
      session.spotify_track_id,
      pending.length,
      playbackRows,
    );
  }

  return [...items, ...playbackRows];
}
