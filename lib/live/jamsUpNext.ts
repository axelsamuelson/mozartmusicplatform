import type { SupabaseClient } from "@supabase/supabase-js";

import { getRoundRobinOrder, type RoundRobinParticipant } from "@/lib/live/slotSystem";

export type UpNextItem = {
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
  user_id: string;
  display_name: string | null;
  is_manual: boolean;
};

export async function loadUpNextTracks(
  admin: SupabaseClient,
  sessionId: string,
  limit = 3,
): Promise<UpNextItem[]> {
  const items: UpNextItem[] = [];

  const { data: manual } = await admin
    .from("live_queue")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_manual", true)
    .is("played_at", null)
    .order("queued_at", { ascending: true })
    .limit(limit);

  for (const row of manual ?? []) {
    items.push({
      spotify_track_id: row.spotify_track_id as string,
      track_name: row.track_name as string,
      artist_name: row.artist_name as string | null,
      image_url: row.image_url as string | null,
      user_id: row.user_id as string,
      display_name: row.display_name as string | null,
      is_manual: true,
    });
  }

  if (items.length >= limit) return items.slice(0, limit);

  const [sources, scores] = await Promise.all([
    admin.from("live_session_sources").select("*").eq("session_id", sessionId),
    admin.from("live_scores").select("user_id, tracks_played").eq("session_id", sessionId),
  ]);

  const playedByUser = new Map(
    (scores.data ?? []).map((s) => [s.user_id as string, (s.tracks_played as number) ?? 0]),
  );

  const participants: RoundRobinParticipant[] = (sources.data ?? []).map((row) => ({
    userId: row.user_id as string,
    slots: (row.slots as number) ?? 3,
    tracksPlayed: playedByUser.get(row.user_id as string) ?? 0,
    joinedAt: row.joined_at as string,
    sourceType: row.source_type as RoundRobinParticipant["sourceType"],
  }));

  let safety = 0;
  while (items.length < limit && safety < participants.length * 2) {
    safety++;
    const userId = getRoundRobinOrder(participants);
    if (!userId) break;

    const p = participants.find((x) => x.userId === userId);
    if (p) p.tracksPlayed += 1;

    const { data: buf } = await admin
      .from("live_queue_buffer")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .eq("position", 0)
      .maybeSingle();

    if (!buf) continue;
    if (items.some((i) => i.spotify_track_id === buf.spotify_track_id)) continue;

    items.push({
      spotify_track_id: buf.spotify_track_id as string,
      track_name: buf.track_name as string,
      artist_name: buf.artist_name as string | null,
      image_url: buf.image_url as string | null,
      user_id: userId,
      display_name: null,
      is_manual: false,
    });
  }

  return items.slice(0, limit);
}
