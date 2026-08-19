import { NextResponse } from "next/server";

import { topArtistsFromTrackScores } from "@/lib/profile/aggregateRatings";
import { loadAllUserRatingsSlim } from "@/lib/ratings/normalize";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ratings = await loadAllUserRatingsSlim(supabase, user.id, "track");
  return NextResponse.json({ artists: topArtistsFromTrackScores(ratings) });
}
