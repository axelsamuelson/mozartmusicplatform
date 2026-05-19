import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchSpotifyItem } from "@/lib/spotify/api";
import { fetchPlaylistTrackStats } from "@/lib/spotify/userLibraryPlaylists";
import { getValidProviderAccessToken } from "@/lib/spotify/userOAuthToken";
import type {
  LiveQueueBufferRow,
  LiveSessionSourceRow,
  LiveSessionSourceType,
} from "@/lib/types/live";

const BUFFER_TARGET = 3;
const HIGH_RATING_BOOST = 1.3;

export type BufferedTrack = {
  id: string;
  session_id: string;
  user_id: string;
  position: number;
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
};

type TrackCandidate = {
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
  weight: number;
};

async function loadExcludedTrackIds(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<Set<string>> {
  const excluded = new Set<string>();

  const [blacklist, played, buffers, manualPending] = await Promise.all([
    admin
      .from("live_track_blacklist")
      .select("spotify_track_id")
      .eq("session_id", sessionId),
    admin
      .from("live_queue")
      .select("spotify_track_id")
      .eq("session_id", sessionId)
      .not("played_at", "is", null),
    admin
      .from("live_queue_buffer")
      .select("spotify_track_id, user_id")
      .eq("session_id", sessionId),
    admin
      .from("live_queue")
      .select("spotify_track_id")
      .eq("session_id", sessionId)
      .is("played_at", null),
  ]);

  for (const row of blacklist.data ?? []) {
    excluded.add(row.spotify_track_id as string);
  }
  for (const row of played.data ?? []) {
    excluded.add(row.spotify_track_id as string);
  }
  for (const row of buffers.data ?? []) {
    excluded.add(row.spotify_track_id as string);
  }
  for (const row of manualPending.data ?? []) {
    excluded.add(row.spotify_track_id as string);
  }

  return excluded;
}

async function loadHighRatedIds(
  supabase: SupabaseClient,
  userId: string,
  trackIds: string[],
): Promise<Set<string>> {
  if (trackIds.length === 0) return new Set();
  const { data } = await supabase
    .from("ratings")
    .select("spotify_id, score")
    .eq("user_id", userId)
    .gte("score", 70)
    .in("spotify_id", trackIds.slice(0, 200));

  return new Set((data ?? []).map((r) => r.spotify_id as string));
}

function pickWeighted(candidates: TrackCandidate[]): TrackCandidate | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1] ?? null;
}

async function candidatesFromPlaylist(
  accessToken: string,
  playlistId: string,
  excluded: Set<string>,
  highRated: Set<string>,
): Promise<TrackCandidate[]> {
  const { trackRowIds } = await fetchPlaylistTrackStats(accessToken, playlistId);
  const pool = trackRowIds.filter((id) => !excluded.has(id));
  if (pool.length === 0) return [];

  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 40);
  const out: TrackCandidate[] = [];

  for (const id of shuffled) {
    try {
      const item = await fetchSpotifyItem(id, "track");
      const weight = highRated.has(id) ? HIGH_RATING_BOOST : 1;
      out.push({
        spotify_track_id: item.spotify_id,
        track_name: item.name,
        artist_name: item.artist_name,
        image_url: item.image_url,
        weight,
      });
    } catch {
      /* skip bad ids */
    }
  }
  return out;
}

async function candidatesFromTopRated(
  supabase: SupabaseClient,
  userId: string,
  excluded: Set<string>,
): Promise<TrackCandidate[]> {
  const { data } = await supabase
    .from("ratings")
    .select("spotify_id, score, cached_items(name, artist_name, image_url)")
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(50);

  const pool = (data ?? []).filter((r) => !excluded.has(r.spotify_id as string));
  if (pool.length === 0) return [];

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.map((r) => {
    const ci = r.cached_items as {
      name?: string;
      artist_name?: string | null;
      image_url?: string | null;
    } | null;
    const score = r.score as number;
    const id = r.spotify_id as string;
    return {
      spotify_track_id: id,
      track_name: ci?.name ?? "Unknown track",
      artist_name: ci?.artist_name ?? null,
      image_url: ci?.image_url ?? null,
      weight: score >= 70 ? HIGH_RATING_BOOST : 1,
    };
  });
}

async function loadSource(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<LiveSessionSourceRow | null> {
  const { data } = await admin
    .from("live_session_sources")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? (data as LiveSessionSourceRow) : null;
}

/** Keep 3 tracks in live_queue_buffer for a participant. */
export async function fillBuffer(
  admin: SupabaseClient,
  userSupabase: SupabaseClient,
  sessionId: string,
  userId: string,
  sourceOverride?: LiveSessionSourceType,
): Promise<void> {
  const source = await loadSource(admin, sessionId, userId);
  const sourceType = sourceOverride ?? source?.source_type ?? "none";
  if (sourceType === "none") return;

  const { count } = await admin
    .from("live_queue_buffer")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  const current = count ?? 0;
  if (current >= BUFFER_TARGET) return;

  const excluded = await loadExcludedTrackIds(admin, sessionId, userId);
  let candidates: TrackCandidate[] = [];

  if (sourceType === "playlist") {
    const pool = (source?.playlist_track_pool ?? []) as string[];
    if (pool.length > 0) {
      const highRated = await loadHighRatedIds(userSupabase, userId, pool);
      const shuffled = pool.filter((id) => !excluded.has(id)).sort(() => Math.random() - 0.5);
      for (const id of shuffled.slice(0, 30)) {
        try {
          const item = await fetchSpotifyItem(id, "track");
          candidates.push({
            spotify_track_id: item.spotify_id,
            track_name: item.name,
            artist_name: item.artist_name,
            image_url: item.image_url,
            weight: highRated.has(id) ? HIGH_RATING_BOOST : 1,
          });
        } catch {
          /* skip */
        }
      }
    } else if (source?.spotify_playlist_id) {
      try {
        const accessToken = await getValidProviderAccessToken(userSupabase);
        const highRated = await loadHighRatedIds(userSupabase, userId, []);
        candidates = await candidatesFromPlaylist(
          accessToken,
          source.spotify_playlist_id,
          excluded,
          highRated,
        );
      } catch {
        /* no token — pool fills on source POST */
      }
    }
  } else if (sourceType === "top_rated") {
    candidates = await candidatesFromTopRated(userSupabase, userId, excluded);
  }

  const existingPositions = await admin
    .from("live_queue_buffer")
    .select("position")
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  const used = new Set((existingPositions.data ?? []).map((r) => r.position as number));
  let position = 0;
  while (used.has(position) && position < BUFFER_TARGET) position++;

  const needed = BUFFER_TARGET - current;
  const picked = new Set<string>();

  for (let i = 0; i < needed; i++) {
    const available = candidates.filter(
      (c) => !picked.has(c.spotify_track_id) && !excluded.has(c.spotify_track_id),
    );
    const choice = pickWeighted(available);
    if (!choice) break;

    picked.add(choice.spotify_track_id);
    excluded.add(choice.spotify_track_id);

    while (used.has(position) && position < BUFFER_TARGET) position++;
    if (position >= BUFFER_TARGET) break;

    await admin.from("live_queue_buffer").insert({
      session_id: sessionId,
      user_id: userId,
      position,
      spotify_track_id: choice.spotify_track_id,
      track_name: choice.track_name,
      artist_name: choice.artist_name,
      image_url: choice.image_url,
    });
    used.add(position);
    position++;
  }
}

/** Take position 0 from buffer, refill, return track. */
export async function getNextFromBuffer(
  admin: SupabaseClient,
  userSupabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<BufferedTrack | null> {
  const { data: row } = await admin
    .from("live_queue_buffer")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .eq("position", 0)
    .maybeSingle();

  if (!row) {
    await fillBuffer(admin, userSupabase, sessionId, userId);
    return null;
  }

  const track = row as LiveQueueBufferRow;
  await admin.from("live_queue_buffer").delete().eq("id", track.id);

  const rest = await admin
    .from("live_queue_buffer")
    .select("id, position")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  for (const [idx, item] of (rest.data ?? []).entries()) {
    await admin
      .from("live_queue_buffer")
      .update({ position: idx })
      .eq("id", item.id as string);
  }

  void fillBuffer(admin, userSupabase, sessionId, userId);
  return track as BufferedTrack;
}
