import { type NextRequest, NextResponse } from "next/server";

import { aggregateLiveRatings } from "@/lib/live/aggregateLiveRatings";
import { ratingsForCurrentTrack } from "@/lib/live/filterRatingsForTrack";
import { maybeAutoFinalizeTrackScores } from "@/lib/live/jukeboxScores";
import { loadSessionScores } from "@/lib/live/jukeboxQueue";
import { getLiveSessionMode, sessionHasScores } from "@/lib/live/sessionMode";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { loadLiveRatingsForSession } from "@/lib/live/loadLiveRatings";
import { persistLiveRatingToLibrary } from "@/lib/live/persistLiveRating";
import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
import { parseOptionalScale1to10 } from "@/lib/ratings/parseScale";
import { createClient } from "@/lib/supabase/server";
import type { MoodTagRow } from "@/lib/types/ratings";

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

  try {
    const allRatings = await loadLiveRatingsForSession(supabase, sessionId);
    const ratings = ratingsForCurrentTrack(allRatings, session);
    const { data: moods } = await supabase
      .from("mood_tags")
      .select("id, level, name, description, color")
      .order("level");
    const aggregate = aggregateLiveRatings(
      ratings,
      (moods ?? []) as MoodTagRow[],
    );

    const scores = sessionHasScores(session)
      ? await loadSessionScores(supabase, sessionId)
      : undefined;

    return NextResponse.json({ ratings, aggregate, session, allRatings, scores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = {
  score?: number;
  tempo?: number | null;
  intensity?: number | null;
  /** @deprecated */
  mood_tag_id?: number | null;
  genre_ids?: number[];
  moment_ids?: number[];
  comment?: string | null;
  spotify_track_id?: string;
  is_retroactive?: boolean;
  rating_time_ms?: number | null;
};

export async function POST(
  request: NextRequest,
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

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    return NextResponse.json(
      { error: "score must be an integer between 0 and 100" },
      { status: 400 },
    );
  }

  let tempo: number | null | undefined;
  let intensity: number | null | undefined;
  try {
    tempo = parseOptionalScale1to10(body.tempo, "tempo");
    intensity = parseOptionalScale1to10(body.intensity, "intensity");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid tempo/intensity";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const genre_ids = Array.isArray(body.genre_ids)
    ? body.genre_ids.filter((id): id is number => Number.isInteger(id))
    : [];

  const moment_ids = Array.isArray(body.moment_ids)
    ? body.moment_ids.filter((id): id is number => Number.isInteger(id))
    : [];

  const comment =
    typeof body.comment === "string" ? body.comment : body.comment ?? null;

  const session = await loadActiveSession(supabase, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let display_name: string;
  try {
    const resolved = await resolveLiveDisplayName(supabase, session, user);
    display_name = resolved.displayName;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not resolve display name";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const isRetroactive = body.is_retroactive === true;
  const trackId =
    typeof body.spotify_track_id === "string" && body.spotify_track_id.trim()
      ? body.spotify_track_id.trim()
      : session.spotify_track_id;
  if (!trackId) {
    return NextResponse.json(
      { error: "No track is playing in this session yet." },
      { status: 400 },
    );
  }

  if (
    !isRetroactive &&
    sessionHasScores(session) &&
    session.current_track_user_id &&
    session.current_track_user_id === user.id
  ) {
    return NextResponse.json(
      { error: "You cannot rate your own queued track" },
      { status: 403 },
    );
  }

  const { data: prior } = await supabase
    .from("live_ratings")
    .select("score")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .eq("spotify_track_id", trackId)
    .maybeSingle();

  const { data: saved, error: saveErr } = await supabase
    .from("live_ratings")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        spotify_track_id: trackId,
        display_name,
        score,
        tempo: tempo ?? null,
        intensity: intensity ?? null,
        genre_ids,
        comment: comment === "" ? null : comment,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "session_id,user_id,spotify_track_id" },
    )
    .select(
      "id, session_id, user_id, spotify_track_id, display_name, score, tempo, intensity, genre_ids, comment, submitted_at",
    )
    .single();

  if (saveErr || !saved) {
    return NextResponse.json(
      { error: saveErr?.message ?? "Failed to save live rating" },
      { status: 500 },
    );
  }

  await supabase.from("live_session_ratings").upsert(
    {
      session_id: sessionId,
      user_id: user.id,
      spotify_track_id: trackId,
      score,
      tempo: tempo ?? null,
      intensity: intensity ?? null,
      is_retroactive: isRetroactive,
      rating_time_ms:
        typeof body.rating_time_ms === "number" ? body.rating_time_ms : null,
    },
    { onConflict: "session_id,user_id,spotify_track_id,is_retroactive" },
  );

  if (!isRetroactive) {
    try {
      await persistLiveRatingToLibrary(
        supabase,
        user.id,
        session,
        {
          score,
          tempo: tempo ?? null,
          intensity: intensity ?? null,
          genre_ids,
          moment_ids,
          comment,
          display_name,
        },
        { previousScore: prior?.score as number | undefined },
      );
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[live] persist to library failed:", e);
      }
    }
  }

  const allRatings = await loadLiveRatingsForSession(supabase, sessionId);
  const ratings = ratingsForCurrentTrack(allRatings, session);
  const { data: moods } = await supabase
    .from("mood_tags")
    .select("id, level, name, description, color")
    .order("level");
  const aggregate = aggregateLiveRatings(ratings, (moods ?? []) as MoodTagRow[]);

  let scoresUpdate = null;
  if (getLiveSessionMode(session) === "jukebox") {
    scoresUpdate = await maybeAutoFinalizeTrackScores(supabase, session);
  }

  const scores = sessionHasScores(session)
    ? await loadSessionScores(supabase, sessionId)
    : undefined;

  return NextResponse.json({
    rating: saved,
    ratings,
    allRatings,
    aggregate,
    session,
    scores,
    scoresUpdate,
  });
}
