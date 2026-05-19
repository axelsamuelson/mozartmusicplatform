import { NextResponse } from "next/server";

import { LIVE_SESSION_UUID_RE } from "@/lib/live/loadActiveSession";
import { createClient } from "@/lib/supabase/server";

type Body = { action: "update" | "keep" | "average" };

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["update", "keep", "average"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sessionRatings } = await supabase
    .from("live_session_ratings")
    .select("spotify_track_id, score")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .eq("is_retroactive", false);

  let merged = 0;
  let skipped = 0;

  for (const sr of sessionRatings ?? []) {
    const spotifyId = sr.spotify_track_id as string;
    const sessionScore = sr.score as number;

    const { data: existing } = await supabase
      .from("ratings")
      .select("id, score")
      .eq("user_id", user.id)
      .eq("spotify_id", spotifyId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("ratings").insert({
        user_id: user.id,
        spotify_id: spotifyId,
        score: sessionScore,
      });
      if (!error) merged++;
      continue;
    }

    if (body.action === "keep") {
      skipped++;
      continue;
    }

    const nextScore =
      body.action === "update"
        ? sessionScore
        : Math.round(((existing.score as number) + sessionScore) / 2);

    const { error } = await supabase
      .from("ratings")
      .update({ score: nextScore, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (!error) merged++;
  }

  return NextResponse.json({ merged, skipped, action: body.action });
}
