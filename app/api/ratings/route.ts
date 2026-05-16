import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  fetchRatingById,
  normalizeRating,
  RATING_SELECT,
} from "@/lib/ratings/normalize";
import type { DashboardStats } from "@/lib/types/ratings";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const spotifyId = request.nextUrl.searchParams.get("spotify_id")?.trim();

  if (request.nextUrl.searchParams.get("scores_only") === "1") {
    const { data, error } = await supabase
      .from("ratings")
      .select("spotify_id, score")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const scores: Record<string, number> = {};
    for (const r of data ?? []) {
      const sid = r.spotify_id as string;
      scores[sid] = r.score as number;
    }
    return NextResponse.json({ scores });
  }

  if (spotifyId) {
    const { data, error } = await supabase
      .from("ratings")
      .select(RATING_SELECT)
      .eq("user_id", user.id)
      .eq("spotify_id", spotifyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rating: data ? normalizeRating(data as Record<string, unknown>) : null,
    });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  let limit: number | undefined;
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(n)) limit = Math.min(100, Math.max(1, n));
  }

  const wantStats = request.nextUrl.searchParams.get("stats") === "1";

  const itemTypeParam = request.nextUrl.searchParams.get("item_type")?.trim();
  const itemTypeFilter =
    itemTypeParam === "track" || itemTypeParam === "album" || itemTypeParam === "artist"
      ? itemTypeParam
      : null;

  let listQuery = supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (limit) listQuery = listQuery.limit(limit);

  const { data, error } = await listQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ratings = (data ?? []).map((row) =>
    normalizeRating(row as Record<string, unknown>),
  );

  const filteredRatings = itemTypeFilter
    ? ratings.filter((r) => r.item?.type === itemTypeFilter)
    : ratings;

  if (!wantStats) {
    return NextResponse.json({ ratings: filteredRatings });
  }

  const { data: scoreRows, error: scoreErr } = await supabase
    .from("ratings")
    .select("score, updated_at")
    .eq("user_id", user.id);

  if (scoreErr) {
    return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  }

  const rows = scoreRows ?? [];
  const total_rated = rows.length;
  const avg_score =
    total_rated > 0
      ? Math.round(
          (rows.reduce((a, r) => a + (r.score as number), 0) / total_rated) *
            10,
        ) / 10
      : 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const startIso = monthStart.toISOString();
  const rated_this_month = rows.filter(
    (r) => String(r.updated_at) >= startIso,
  ).length;

  const stats: DashboardStats = {
    total_rated,
    avg_score,
    rated_this_month,
  };

  return NextResponse.json({ ratings: filteredRatings, stats });
}

type PostBody = {
  spotify_id?: string;
  score?: number;
  comment?: string | null;
  genre_ids?: number[];
  mood_tag_id?: number;
  moment_ids?: number[];
};

export async function POST(request: NextRequest) {
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

  const spotify_id = body.spotify_id?.trim();
  if (!spotify_id) {
    return NextResponse.json({ error: "spotify_id is required" }, { status: 400 });
  }

  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    return NextResponse.json(
      { error: "score must be an integer between 0 and 100" },
      { status: 400 },
    );
  }

  const rawMood = body.mood_tag_id;
  let mood_tag_id: number | null = null;
  if (rawMood !== undefined && rawMood !== null) {
    if (typeof rawMood !== "number" || !Number.isInteger(rawMood)) {
      return NextResponse.json({ error: "mood_tag_id must be an integer" }, { status: 400 });
    }
    mood_tag_id = rawMood;
  }

  const genre_ids = Array.isArray(body.genre_ids)
    ? body.genre_ids.filter((id): id is number => Number.isInteger(id))
    : [];
  const moment_ids = Array.isArray(body.moment_ids)
    ? body.moment_ids.filter((id): id is number => Number.isInteger(id))
    : [];
  const comment =
    typeof body.comment === "string" ? body.comment : body.comment ?? null;

  const { data: cached, error: cacheErr } = await supabase
    .from("cached_items")
    .select("spotify_id")
    .eq("spotify_id", spotify_id)
    .maybeSingle();

  if (cacheErr) {
    return NextResponse.json({ error: cacheErr.message }, { status: 500 });
  }
  if (!cached) {
    return NextResponse.json(
      { error: "Item is not cached. Open the item from search first." },
      { status: 400 },
    );
  }

  const { data: existing, error: findErr } = await supabase
    .from("ratings")
    .select("id")
    .eq("user_id", user.id)
    .eq("spotify_id", spotify_id)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  let ratingId: string;

  if (existing) {
    ratingId = existing.id;
    const { error: upErr } = await supabase
      .from("ratings")
      .update({
        score,
        comment: comment === "" ? null : comment,
      })
      .eq("id", ratingId)
      .eq("user_id", user.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("ratings")
      .insert({
        user_id: user.id,
        spotify_id,
        score,
        comment: comment === "" ? null : comment,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: insErr?.message ?? "Insert failed" },
        { status: 500 },
      );
    }
    ratingId = inserted.id;
  }

  const { error: delG } = await supabase
    .from("rating_genres")
    .delete()
    .eq("rating_id", ratingId);
  if (delG) {
    return NextResponse.json({ error: delG.message }, { status: 500 });
  }

  if (genre_ids.length) {
    const { error: insG } = await supabase.from("rating_genres").insert(
      genre_ids.map((genre_tag_id) => ({ rating_id: ratingId, genre_tag_id })),
    );
    if (insG) {
      return NextResponse.json({ error: insG.message }, { status: 500 });
    }
  }

  const { error: delMood } = await supabase
    .from("rating_moods")
    .delete()
    .eq("rating_id", ratingId);
  if (delMood) {
    return NextResponse.json({ error: delMood.message }, { status: 500 });
  }

  if (mood_tag_id != null) {
    const { error: insMood } = await supabase.from("rating_moods").insert({
      rating_id: ratingId,
      mood_tag_id,
    });
    if (insMood) {
      return NextResponse.json({ error: insMood.message }, { status: 500 });
    }
  }

  const { error: delMom } = await supabase
    .from("rating_moments")
    .delete()
    .eq("rating_id", ratingId);
  if (delMom) {
    return NextResponse.json({ error: delMom.message }, { status: 500 });
  }

  if (moment_ids.length) {
    const { error: insMom } = await supabase.from("rating_moments").insert(
      moment_ids.map((moment_tag_id) => ({ rating_id: ratingId, moment_tag_id })),
    );
    if (insMom) {
      return NextResponse.json({ error: insMom.message }, { status: 500 });
    }
  }

  const full = await fetchRatingById(supabase, ratingId);
  if (!full) {
    return NextResponse.json({ error: "Failed to load saved rating" }, { status: 500 });
  }

  return NextResponse.json({ rating: full });
}
