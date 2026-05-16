import { NextResponse } from "next/server";

import {
  buildActivityByMonth,
  buildGenreCounts,
  buildMoodLevelBars,
  buildTopTracksAlbumsArtists,
} from "@/lib/profile/aggregateRatings";
import { loadAllUserRatings } from "@/lib/ratings/normalize";
import { createClient } from "@/lib/supabase/server";
import type { MoodTagRow } from "@/lib/types/ratings";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [moodsRes, ratings] = await Promise.all([
    supabase.from("mood_tags").select("id, level, name, description, color").order("level"),
    loadAllUserRatings(supabase, user.id),
  ]);

  if (moodsRes.error) {
    return NextResponse.json({ error: moodsRes.error.message }, { status: 500 });
  }

  const mood_tags = (moodsRes.data ?? []) as MoodTagRow[];

  return NextResponse.json({
    mood_tags,
    ...buildTopTracksAlbumsArtists(ratings),
    activity_by_month: buildActivityByMonth(ratings),
    genre_counts: buildGenreCounts(ratings),
    mood_by_level: buildMoodLevelBars(ratings, mood_tags),
  });
}
