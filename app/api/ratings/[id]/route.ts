import { type NextRequest, NextResponse } from "next/server";

import { scheduleAfterResponse } from "@/lib/http/scheduleAfterResponse";
import { syncWamPlaylistsForRating } from "@/lib/playlist/syncWamPlaylist";
import { createClient } from "@/lib/supabase/server";
import { fetchRatingById } from "@/lib/ratings/normalize";

type PatchBody = {
  score?: number;
  comment?: string | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { score?: number; comment?: string | null } = {};

  if (body.score !== undefined) {
    if (typeof body.score !== "number" || !Number.isInteger(body.score)) {
      return NextResponse.json(
        { error: "score must be an integer" },
        { status: 400 },
      );
    }
    if (body.score < 0 || body.score > 100) {
      return NextResponse.json(
        { error: "score must be between 0 and 100" },
        { status: 400 },
      );
    }
    patch.score = body.score;
  }

  if (body.comment !== undefined) {
    if (body.comment === null) {
      patch.comment = null;
    } else if (typeof body.comment === "string") {
      patch.comment = body.comment === "" ? null : body.comment;
    } else {
      return NextResponse.json(
        { error: "comment must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const priorFull =
    body.score !== undefined ? await fetchRatingById(supabase, id) : null;

  const { data, error } = await supabase
    .from("ratings")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, spotify_id, score, comment, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.score !== undefined) {
    const full = await fetchRatingById(supabase, id);
    if (full) {
      scheduleAfterResponse(() =>
        syncWamPlaylistsForRating(supabase, user.id, full, {
          previousRating: priorFull,
        }),
      );
    }
  }

  return NextResponse.json({ rating: data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priorFull = await fetchRatingById(supabase, id);

  const { data: rows, error } = await supabase
    .from("ratings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rebuild Spotify playlists that matched the deleted rating.
  if (priorFull) {
    scheduleAfterResponse(() =>
      syncWamPlaylistsForRating(supabase, user.id, priorFull),
    );
  }

  return NextResponse.json({ ok: true });
}
