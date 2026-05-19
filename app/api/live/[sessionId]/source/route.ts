import { after, NextResponse } from "next/server";

import { fillBuffer } from "@/lib/live/bufferManager";
import { calculateSlots } from "@/lib/live/slotSystem";
import { completePlaylistSourceSync } from "@/lib/live/syncPlaylistSource";
import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { usesJamsAdvance } from "@/lib/live/sessionMode";
import {
  fetchPlaylistTrackStatsForSession,
  isLargePlaylistForAsyncSync,
} from "@/lib/spotify/playlistTrackStatsCached";
import { isPlaylistTracksCacheFresh, loadUserPlaylistTracksMap } from "@/lib/spotify/playlistTracksDb";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionSourceRow, LiveSessionSourceType } from "@/lib/types/live";

const MIN_PLAYLIST_TRACKS = 20;

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await loadActiveSession(supabase, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!usesJamsAdvance(session)) {
    return NextResponse.json(
      { error: "WAM Jams is not enabled for this session" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("live_session_sources")
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mine = (data ?? []).find((r) => r.user_id === user.id) ?? null;
  const status =
    (mine as LiveSessionSourceRow | null)?.playlist_sync_status ?? "ready";

  return NextResponse.json({
    mine: mine as LiveSessionSourceRow | null,
    sources: (data ?? []) as LiveSessionSourceRow[],
    defaultSlots: calculateSlots(null),
    status,
  });
}

type PostBody = {
  source_type: LiveSessionSourceType;
  spotify_playlist_id?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["playlist", "top_rated", "none"].includes(body.source_type)) {
    return NextResponse.json({ error: "Invalid source_type" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await loadActiveSession(supabase, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!usesJamsAdvance(session)) {
    return NextResponse.json(
      { error: "WAM Jams is not enabled for this session" },
      { status: 400 },
    );
  }

  let playlistName: string | null = null;
  let playlistSize: number | null = null;
  let playlistTrackPool: string[] = [];
  let playlistSyncStatus: "ready" | "loading" | "error" = "ready";

  if (body.source_type === "playlist") {
    const pid = body.spotify_playlist_id?.trim();
    if (!pid) {
      return NextResponse.json({ error: "spotify_playlist_id required" }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await requireProviderAccessToken(supabase);
    } catch {
      return NextResponse.json({ error: "Spotify token required" }, { status: 401 });
    }

    const cachedMap = await loadUserPlaylistTracksMap(supabase, user.id);
    const cached = cachedMap.get(pid);
    const cacheFresh =
      cached &&
      isPlaylistTracksCacheFresh(cached.last_synced_at) &&
      cached.track_ids.length >= MIN_PLAYLIST_TRACKS;

    if (cacheFresh) {
      const stats = await fetchPlaylistTrackStatsForSession(
        accessToken,
        pid,
        supabase,
        user.id,
      );
      if (stats.total_tracks < MIN_PLAYLIST_TRACKS) {
        return NextResponse.json(
          { error: `Playlist must have at least ${MIN_PLAYLIST_TRACKS} tracks` },
          { status: 400 },
        );
      }
      playlistSize = stats.total_tracks;
      playlistTrackPool = stats.trackRowIds;
      playlistName = cached.name ?? pid;
    } else {
      let estimatedTotal = cached?.total_tracks ?? 0;
      try {
        const plRes = await fetch(
          `https://api.spotify.com/v1/playlists/${encodeURIComponent(pid)}?fields=name,tracks.total`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
        );
        if (plRes.ok) {
          const pl = (await plRes.json()) as {
            name?: string;
            tracks?: { total?: number };
          };
          playlistName = pl.name ?? pid;
          estimatedTotal = pl.tracks?.total ?? estimatedTotal;
        }
      } catch {
        playlistName = pid;
      }

      if (isLargePlaylistForAsyncSync(estimatedTotal)) {
        playlistSize = estimatedTotal;
        playlistTrackPool = [];
        playlistSyncStatus = "loading";
      } else {
        const stats = await fetchPlaylistTrackStatsForSession(
          accessToken,
          pid,
          supabase,
          user.id,
        );
        if (stats.total_tracks < MIN_PLAYLIST_TRACKS) {
          return NextResponse.json(
            { error: `Playlist must have at least ${MIN_PLAYLIST_TRACKS} tracks` },
            { status: 400 },
          );
        }
        playlistSize = stats.total_tracks;
        playlistTrackPool = stats.trackRowIds;
        playlistSyncStatus = "ready";
      }
    }
  }

  const { data: scoreRow } = await supabase
    .from("live_scores")
    .select("avg_score")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  const avgScore =
    scoreRow?.avg_score != null ? Number(scoreRow.avg_score) : null;
  const slots = calculateSlots(avgScore);

  const { displayName } = await resolveLiveDisplayName(supabase, session, user);

  const row = {
    session_id: sessionId,
    user_id: user.id,
    source_type: body.source_type,
    spotify_playlist_id: body.source_type === "playlist" ? body.spotify_playlist_id : null,
    playlist_name: playlistName,
    playlist_size: playlistSize,
    playlist_track_pool: playlistTrackPool,
    playlist_sync_status: playlistSyncStatus,
    slots,
    flagged_as_bad_match: false,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await supabase
    .from("live_session_sources")
    .upsert(row, { onConflict: "session_id,user_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("live_scores").upsert(
    {
      session_id: sessionId,
      user_id: user.id,
      display_name: displayName,
      points: 0,
      tracks_played: 0,
      avg_score: avgScore,
    },
    { onConflict: "session_id,user_id" },
  );

  const source = upserted as LiveSessionSourceRow;

  if (body.source_type !== "none" && playlistSyncStatus === "ready") {
    try {
      const admin = createAdminClient();
      await fillBuffer(admin, supabase, sessionId, user.id, body.source_type);
    } catch {
      /* buffer fill is best-effort */
    }
  }

  if (
    body.source_type === "playlist" &&
    playlistSyncStatus === "loading" &&
    body.spotify_playlist_id
  ) {
    const pid = body.spotify_playlist_id.trim();
    let bgToken = "";
    try {
      bgToken = await requireProviderAccessToken(supabase);
    } catch {
      /* token unavailable */
    }
    if (bgToken) {
      after(async () => {
        try {
          const admin = createAdminClient();
          await completePlaylistSourceSync(
            admin,
            supabase,
            sessionId,
            user.id,
            pid,
            bgToken,
          );
        } catch {
          /* background sync failed */
        }
      });
    }
  }

  return NextResponse.json({
    source,
    slots,
    status: playlistSyncStatus,
  });
}
