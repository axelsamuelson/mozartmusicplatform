import { type NextRequest, NextResponse } from "next/server";

import { loadMatchedPlaylistTracks } from "@/lib/playlist/loadMatchedTracks";
import {
  parsePlaylistFiltersInput,
  playlistFiltersToDbColumns,
} from "@/lib/playlist/playlistFilters";
import { parsePlaylistSortOrder } from "@/lib/playlist/sortOrder";
import { createClient } from "@/lib/supabase/server";
import type { WamPlaylistRow } from "@/lib/types/playlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const { playlistId } = await context.params;
  if (!UUID_RE.test(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("wam_playlists")
    .select("*")
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filters = parsePlaylistFiltersInput(body);
  const sort_order = parsePlaylistSortOrder(body.sort_order) ?? (row as WamPlaylistRow).sort_order;

  const virtual: WamPlaylistRow = {
    ...(row as WamPlaylistRow),
    ...playlistFiltersToDbColumns(filters),
    sort_order,
  };

  try {
    const matched_tracks = await loadMatchedPlaylistTracks(
      supabase,
      user.id,
      virtual,
      sort_order,
    );
    return NextResponse.json({ matched_tracks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
