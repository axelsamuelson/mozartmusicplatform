import type { SupabaseClient } from "@supabase/supabase-js";

import { getHostToken, HostTokenExpiredError } from "@/lib/live/getHostToken";
import { HostPlaybackError, playTrackOnHostDevice } from "@/lib/live/hostPlayback";
import type { LiveSessionRow } from "@/lib/types/live";

/** Start the given track on the host's active Spotify device. */
export async function playQueueTrackOnHost(
  admin: SupabaseClient,
  session: LiveSessionRow,
  spotifyTrackId: string,
  callerUserId?: string,
): Promise<void> {
  const hostToken = await getHostToken(admin, session, callerUserId);
  try {
    await playTrackOnHostDevice(hostToken, spotifyTrackId);
  } catch (e) {
    if (e instanceof HostPlaybackError && e.status === 401) {
      throw new HostTokenExpiredError();
    }
    throw e;
  }
}
