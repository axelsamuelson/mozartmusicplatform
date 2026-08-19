import { NextResponse } from "next/server";

import { loadTopGenreIds } from "@/lib/ratings/topGenres";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const top_genre_ids = await loadTopGenreIds(supabase, user.id);
  return NextResponse.json(
    { top_genre_ids },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
