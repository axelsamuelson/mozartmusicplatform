import { type NextRequest, NextResponse } from "next/server";

import { aggregateLiveRatings } from "@/lib/live/aggregateLiveRatings";
import { loadLiveRatingsForSession } from "@/lib/live/loadLiveRatings";
import { persistLiveRatingToLibrary } from "@/lib/live/persistLiveRating";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";
import type { MoodTagRow } from "@/lib/types/ratings";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadActiveSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<LiveSessionRow | null> {
  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as LiveSessionRow) : null;
}

function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const m = user.user_metadata ?? {};
  const fromMeta =
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    (typeof m.display_name === "string" && m.display_name);
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split("@")[0] ?? "User";
  return "User";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!UUID_RE.test(sessionId)) {
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
    const ratings = await loadLiveRatingsForSession(supabase, sessionId);
    const { data: moods } = await supabase
      .from("mood_tags")
      .select("id, level, name, description, color")
      .order("level");
    const aggregate = aggregateLiveRatings(
      ratings,
      (moods ?? []) as MoodTagRow[],
    );

    return NextResponse.json({ ratings, aggregate, session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = {
  score?: number;
  mood_tag_id?: number | null;
  genre_ids?: number[];
  comment?: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!UUID_RE.test(sessionId)) {
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

  const mood_tag_id =
    body.mood_tag_id === undefined || body.mood_tag_id === null
      ? null
      : typeof body.mood_tag_id === "number" && Number.isInteger(body.mood_tag_id)
        ? body.mood_tag_id
        : null;

  const genre_ids = Array.isArray(body.genre_ids)
    ? body.genre_ids.filter((id): id is number => Number.isInteger(id))
    : [];

  const comment =
    typeof body.comment === "string" ? body.comment : body.comment ?? null;

  const session = await loadActiveSession(supabase, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const display_name = displayNameFromUser(user);

  const { data: prior } = await supabase
    .from("live_ratings")
    .select("score")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: saved, error: saveErr } = await supabase
    .from("live_ratings")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        display_name,
        score,
        mood_tag_id,
        genre_ids,
        comment: comment === "" ? null : comment,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "session_id,user_id" },
    )
    .select(
      "id, session_id, user_id, display_name, score, mood_tag_id, genre_ids, comment, submitted_at",
    )
    .single();

  if (saveErr || !saved) {
    return NextResponse.json(
      { error: saveErr?.message ?? "Failed to save live rating" },
      { status: 500 },
    );
  }

  try {
    await persistLiveRatingToLibrary(
      supabase,
      user.id,
      session,
      { score, mood_tag_id, genre_ids, comment, display_name },
      { previousScore: prior?.score as number | undefined },
    );
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[live] persist to library failed:", e);
    }
  }

  const ratings = await loadLiveRatingsForSession(supabase, sessionId);
  const { data: moods } = await supabase
    .from("mood_tags")
    .select("id, level, name, description, color")
    .order("level");
  const aggregate = aggregateLiveRatings(ratings, (moods ?? []) as MoodTagRow[]);

  return NextResponse.json({
    rating: saved,
    ratings,
    aggregate,
  });
}
