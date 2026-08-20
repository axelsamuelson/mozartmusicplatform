import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";

import { syncWamPlaylistsForRating } from "@/lib/playlist/syncWamPlaylist";
import { createClient } from "@/lib/supabase/server";
import { parseOptionalScale1to10 } from "@/lib/ratings/parseScale";
import {
  fetchRatingById,
  loadAllUserRatings,
  normalizeRating,
  RATING_SELECT,
} from "@/lib/ratings/normalize";
import { loadScoreHistory } from "@/lib/ratings/scoreHistory";
import type { DashboardStats } from "@/lib/types/ratings";

function statsFromScoreRows(
  rows: Array<{ score?: unknown; updated_at?: unknown }>,
): DashboardStats {
  const total_rated = rows.length;
  const avg_score =
    total_rated > 0
      ? Math.round(
          (rows.reduce((a, r) => a + Number(r.score ?? 0), 0) / total_rated) * 10,
        ) / 10
      : 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const startIso = monthStart.toISOString();
  const rated_this_month = rows.filter(
    (r) => String(r.updated_at) >= startIso,
  ).length;

  return { total_rated, avg_score, rated_this_month };
}

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
    const scores: Record<string, number> = {};
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase
        .from("ratings")
        .select("spotify_id, score")
        .eq("user_id", user.id)
        .range(from, from + page - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = data ?? [];
      for (const r of rows) {
        const sid = r.spotify_id as string;
        scores[sid] = r.score as number;
      }
      if (rows.length < page) break;
    }
    return NextResponse.json({ scores });
  }

  if (spotifyId) {
    const lite = request.nextUrl.searchParams.get("lite") === "1";
    const { data, error } = await supabase
      .from("ratings")
      .select(RATING_SELECT)
      .eq("user_id", user.id)
      .eq("spotify_id", spotifyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (lite) {
      return NextResponse.json({
        rating: data ? normalizeRating(data as Record<string, unknown>) : null,
      });
    }

    const score_history = await loadScoreHistory(supabase, user.id, spotifyId);

    return NextResponse.json({
      rating: data ? normalizeRating(data as Record<string, unknown>) : null,
      score_history,
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

  const statsQuery = wantStats
    ? supabase.from("ratings").select("score, updated_at").eq("user_id", user.id)
    : null;

  let ratings: ReturnType<typeof normalizeRating>[];

  if (!limit) {
    const [loaded, scoreRes] = await Promise.all([
      loadAllUserRatings(supabase, user.id, itemTypeFilter ?? undefined),
      statsQuery,
    ]);
    ratings = loaded;
    if (scoreRes?.error) {
      return NextResponse.json({ error: scoreRes.error.message }, { status: 500 });
    }
    if (!wantStats) {
      return NextResponse.json({ ratings });
    }
    return NextResponse.json({
      ratings,
      stats: statsFromScoreRows(scoreRes?.data ?? []),
    });
  }

  let listQuery = supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (itemTypeFilter) {
    listQuery = listQuery.eq("cached_items.type", itemTypeFilter);
  }

  const [listRes, scoreRes] = await Promise.all([
    listQuery,
    statsQuery ?? Promise.resolve({ data: null, error: null }),
  ]);

  if (listRes.error) {
    return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  }

  ratings = (listRes.data ?? []).map((row) =>
    normalizeRating(row as Record<string, unknown>),
  );

  if (!wantStats) {
    return NextResponse.json({ ratings });
  }

  if (scoreRes.error) {
    return NextResponse.json({ error: scoreRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ratings,
    stats: statsFromScoreRows(scoreRes.data ?? []),
  });
}

type PostBody = {
  spotify_id?: string;
  score?: number;
  comment?: string | null;
  genre_ids?: number[];
  tempo?: number | null;
  intensity?: number | null;
  /** @deprecated */
  mood_tag_id?: number;
  moment_ids?: number[];
  /** Optional metadata so we can upsert cached_items without a prior item open. */
  item?: {
    type?: string;
    name?: string;
    artist_name?: string | null;
    image_url?: string | null;
  };
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

  const { data: cached, error: cacheErr } = await supabase
    .from("cached_items")
    .select("spotify_id")
    .eq("spotify_id", spotify_id)
    .maybeSingle();

  if (cacheErr) {
    return NextResponse.json({ error: cacheErr.message }, { status: 500 });
  }
  if (!cached) {
    const meta = body.item;
    const name =
      typeof meta?.name === "string" && meta.name.trim()
        ? meta.name.trim()
        : null;
    if (!name) {
      return NextResponse.json(
        { error: "Item is not cached. Open the item from search first." },
        { status: 400 },
      );
    }
    const type =
      meta?.type === "album" || meta?.type === "artist" ? meta.type : "track";
    const now = new Date().toISOString();
    const { error: upsertErr } = await supabase.from("cached_items").upsert(
      {
        spotify_id,
        type,
        name,
        artist_name:
          typeof meta?.artist_name === "string" ? meta.artist_name : null,
        image_url: typeof meta?.image_url === "string" ? meta.image_url : null,
        preview_url: null,
        genres: null,
        cached_at: now,
      },
      { onConflict: "spotify_id" },
    );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }

  const { data: existing, error: findErr } = await supabase
    .from("ratings")
    .select("id, score")
    .eq("user_id", user.id)
    .eq("spotify_id", spotify_id)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  let ratingId: string;
  let previousScore: number | undefined;

  if (existing) {
    ratingId = existing.id;
    previousScore = existing.score as number;
    const updatePayload: Record<string, unknown> = {
      score,
      comment: comment === "" ? null : comment,
    };
    if (tempo !== undefined) updatePayload.tempo = tempo;
    if (intensity !== undefined) updatePayload.intensity = intensity;

    const { error: upErr } = await supabase
      .from("ratings")
      .update(updatePayload)
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
        tempo: tempo ?? null,
        intensity: intensity ?? null,
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

  const [{ error: delG }, { error: delMom }] = await Promise.all([
    supabase.from("rating_genres").delete().eq("rating_id", ratingId),
    supabase.from("rating_moments").delete().eq("rating_id", ratingId),
  ]);
  if (delG) {
    return NextResponse.json({ error: delG.message }, { status: 500 });
  }
  if (delMom) {
    return NextResponse.json({ error: delMom.message }, { status: 500 });
  }

  const tagWrites: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (genre_ids.length) {
    tagWrites.push(
      supabase.from("rating_genres").insert(
        genre_ids.map((genre_tag_id) => ({ rating_id: ratingId, genre_tag_id })),
      ),
    );
  }
  if (moment_ids.length) {
    tagWrites.push(
      supabase.from("rating_moments").insert(
        moment_ids.map((moment_tag_id) => ({
          rating_id: ratingId,
          moment_tag_id,
        })),
      ),
    );
  }
  if (tagWrites.length) {
    const tagResults = await Promise.all(tagWrites);
    for (const r of tagResults) {
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 });
      }
    }
  }

  const [full, score_history] = await Promise.all([
    fetchRatingById(supabase, ratingId),
    loadScoreHistory(supabase, user.id, spotify_id),
  ]);
  if (!full) {
    return NextResponse.json({ error: "Failed to load saved rating" }, { status: 500 });
  }

  after(async () => {
    await syncWamPlaylistsForRating(supabase, user.id, full, {
      previousScore,
    });
  });

  return NextResponse.json({ rating: full, score_history });
}
