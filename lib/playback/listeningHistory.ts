import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecentTrack } from "@/lib/playback/recentTrack";

export type ListeningHistoryInput = {
  spotifyId: string;
  name: string;
  artistName: string | null;
  artistId: string | null;
  imageUrl: string | null;
};

/** Avoid writing the same track on every playback poll (per server instance). */
const lastRecordedByUser = new Map<string, string>();

export function shouldRecordListeningHistory(
  userId: string,
  spotifyId: string,
): boolean {
  if (!userId || !spotifyId) return false;
  if (lastRecordedByUser.get(userId) === spotifyId) return false;
  lastRecordedByUser.set(userId, spotifyId);
  return true;
}

export async function upsertListeningHistory(
  supabase: SupabaseClient,
  userId: string,
  track: ListeningHistoryInput,
): Promise<void> {
  if (!track.spotifyId || !track.name.trim()) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("listening_history").upsert(
    {
      user_id: userId,
      spotify_id: track.spotifyId,
      name: track.name.trim(),
      artist_name: track.artistName,
      artist_id: track.artistId,
      image_url: track.imageUrl,
      played_at: now,
    },
    { onConflict: "user_id,spotify_id" },
  );
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[listening_history] upsert failed:", error.message);
  }
}

export async function loadListeningHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<RecentTrack[]> {
  const { data, error } = await supabase
    .from("listening_history")
    .select("spotify_id, name, artist_name, artist_id, image_url, played_at")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[listening_history] load failed:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) => ({
    spotifyId: row.spotify_id as string,
    name: row.name as string,
    artistName: (row.artist_name as string | null) ?? "Unknown",
    artistId: (row.artist_id as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    playedAt: row.played_at as string,
    score: null,
  }));
}
