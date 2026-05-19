import type { SupabaseClient } from "@supabase/supabase-js";

import { getNextFromBuffer } from "@/lib/live/bufferManager";
import { getHostToken, HostTokenExpiredError } from "@/lib/live/getHostToken";
import { HostPlaybackError, playTrackOnHostDevice } from "@/lib/live/hostPlayback";
import { finalizeTrackScores } from "@/lib/live/jukeboxScores";
import { sessionPatchFromQueueItem } from "@/lib/live/jukeboxQueue";
import { runPostPlayChecks } from "@/lib/live/jamsPostPlay";
import { getRoundRobinOrder, type RoundRobinParticipant } from "@/lib/live/slotSystem";
import { fetchCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import { fetchSpotifyItem } from "@/lib/spotify/api";
import type { LiveQueueRow, LiveSessionRow } from "@/lib/types/live";

export type JamsAdvanceResult = {
  session: LiveSessionRow;
  playedTrack: LiveQueueRow | null;
  nextTrack: LiveQueueRow | null;
  notice?: { userId: string; message: string };
};

async function loadParticipants(
  admin: SupabaseClient,
  sessionId: string,
): Promise<RoundRobinParticipant[]> {
  const [sources, scores] = await Promise.all([
    admin.from("live_session_sources").select("*").eq("session_id", sessionId),
    admin.from("live_scores").select("user_id, tracks_played, avg_score").eq("session_id", sessionId),
  ]);

  const playedByUser = new Map(
    (scores.data ?? []).map((s) => [s.user_id as string, (s.tracks_played as number) ?? 0]),
  );

  return (sources.data ?? []).map((row) => ({
    userId: row.user_id as string,
    slots: (row.slots as number) ?? 3,
    tracksPlayed: playedByUser.get(row.user_id as string) ?? 0,
    joinedAt: row.joined_at as string,
    sourceType: row.source_type as RoundRobinParticipant["sourceType"],
  }));
}

async function insertQueueFromBuffer(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
  displayName: string | null,
  buffered: {
    spotify_track_id: string;
    track_name: string;
    artist_name: string | null;
    image_url: string | null;
  },
): Promise<LiveQueueRow> {
  const { data, error } = await admin
    .from("live_queue")
    .insert({
      session_id: sessionId,
      user_id: userId,
      display_name: displayName,
      spotify_track_id: buffered.spotify_track_id,
      track_name: buffered.track_name,
      artist_name: buffered.artist_name,
      image_url: buffered.image_url,
      position: 1,
      is_manual: false,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to queue buffered track");
  return data as LiveQueueRow;
}

async function fallbackFromHostPlaylist(
  admin: SupabaseClient,
  hostToken: string,
  sessionId: string,
  hostUserId: string,
): Promise<LiveQueueRow | null> {
  const playback = await fetchCurrentPlayback(hostToken);
  const pid =
    playback?.contextUri?.match(/spotify:playlist:([a-zA-Z0-9]+)/)?.[1] ?? null;
  if (!pid) return null;

  const item = playback?.trackId
    ? await fetchSpotifyItem(playback.trackId, "track").catch(() => null)
    : null;
  if (!item) return null;

  return insertQueueFromBuffer(admin, sessionId, hostUserId, null, {
    spotify_track_id: item.spotify_id,
    track_name: item.name,
    artist_name: item.artist_name,
    image_url: item.image_url,
  });
}

/** Core Jams advance: manual queue → round-robin buffer → host fallback → Spotify play. */
export async function advanceJamsSession(
  admin: SupabaseClient,
  userSupabase: SupabaseClient,
  session: LiveSessionRow,
  callerUserId: string,
): Promise<JamsAdvanceResult> {
  let notice: JamsAdvanceResult["notice"];

  if (session.current_queue_id) {
    const { data: currentItem } = await admin
      .from("live_queue")
      .select("*")
      .eq("id", session.current_queue_id)
      .maybeSingle();

    if (currentItem && !(currentItem as LiveQueueRow).played_at) {
      const now = new Date().toISOString();
      const { data: playedItem } = await admin
        .from("live_queue")
        .update({ played_at: now })
        .eq("id", session.current_queue_id)
        .select("*")
        .single();

      const item = (playedItem ?? currentItem) as LiveQueueRow;
      await finalizeTrackScores(admin, session, item);

      const post = await runPostPlayChecks(
        admin,
        session,
        item,
        session.current_track_started_at ?? null,
      );
      if (post.flaggedUserId && post.message) {
        notice = { userId: post.flaggedUserId, message: post.message };
      }
    }
  }

  const { data: manual } = await admin
    .from("live_queue")
    .select("*")
    .eq("session_id", session.id)
    .eq("is_manual", true)
    .is("played_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let nextItem: LiveQueueRow | null = manual ? (manual as LiveQueueRow) : null;

  if (!nextItem) {
    const participants = await loadParticipants(admin, session.id);
    const nextUserId = getRoundRobinOrder(participants);

    if (nextUserId) {
      const buffered = await getNextFromBuffer(admin, userSupabase, session.id, nextUserId);
      if (buffered) {
        nextItem = await insertQueueFromBuffer(
          admin,
          session.id,
          nextUserId,
          null,
          buffered,
        );
      }
    }

    if (!nextItem) {
      const hostToken = await getHostToken(admin, session, callerUserId);
      nextItem = await fallbackFromHostPlaylist(
        admin,
        hostToken,
        session.id,
        session.host_user_id,
      );
    }
  }

  if (!nextItem) {
    const { data: cleared } = await admin
      .from("live_sessions")
      .update({
        spotify_track_id: null,
        track_name: null,
        artist_name: null,
        image_url: null,
        current_queue_id: null,
        current_track_user_id: null,
        is_playing: false,
        current_track_started_at: null,
      })
      .eq("id", session.id)
      .select("*")
      .single();

    return {
      session: (cleared ?? session) as LiveSessionRow,
      playedTrack: null,
      nextTrack: null,
      notice,
    };
  }

  const startedAt = new Date().toISOString();
  const patch = {
    ...sessionPatchFromQueueItem(nextItem),
    current_track_started_at: startedAt,
  };

  const { data: updatedSession, error: sessionErr } = await admin
    .from("live_sessions")
    .update(patch)
    .eq("id", session.id)
    .select("*")
    .single();

  if (sessionErr || !updatedSession) {
    throw new Error(sessionErr?.message ?? "Failed to update session");
  }

  if (session.wam_controls_playback) {
    try {
      const hostToken = await getHostToken(admin, session, callerUserId);
      await playTrackOnHostDevice(hostToken, nextItem.spotify_track_id);
    } catch (e) {
      if (e instanceof HostTokenExpiredError) throw e;
      if (e instanceof HostPlaybackError && e.status === 401) {
        throw new HostTokenExpiredError();
      }
      throw e;
    }
  }

  return {
    session: updatedSession as LiveSessionRow,
    playedTrack: null,
    nextTrack: nextItem,
    notice,
  };
}
