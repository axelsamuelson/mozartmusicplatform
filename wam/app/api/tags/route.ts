import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Reference data for TagPicker (requires SELECT policies on tag tables for authenticated users). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [genres, moods, moments] = await Promise.all([
    supabase.from("genre_tags").select("id, name").order("name"),
    supabase.from("mood_tags").select("id, level, name, description, color").order("level"),
    supabase.from("moment_tags").select("id, name, subcategory").order("subcategory").order("name"),
  ]);

  if (genres.error || moods.error || moments.error) {
    return NextResponse.json(
      {
        error:
          genres.error?.message ||
          moods.error?.message ||
          moments.error?.message ||
          "Failed to load tags",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    genre_tags: genres.data ?? [],
    mood_tags: moods.data ?? [],
    moment_tags: moments.data ?? [],
  });
}
