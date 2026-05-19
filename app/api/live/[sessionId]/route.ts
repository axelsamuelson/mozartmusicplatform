import { NextResponse } from "next/server";

import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
import { createClient } from "@/lib/supabase/server";
import type { JukeboxRankingMode, LiveSessionRow } from "@/lib/types/live";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ session: data as LiveSessionRow });
}

type PatchBody = {
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jukebox_ranking_mode?: JukeboxRankingMode;
  hide_queue_names?: boolean;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasAnonymous = typeof body.anonymous_mode === "boolean";
  const hasJukebox = typeof body.jukebox_enabled === "boolean";
  const hasRankingMode =
    body.jukebox_ranking_mode === "points" || body.jukebox_ranking_mode === "average";
  const hasHideQueueNames = typeof body.hide_queue_names === "boolean";
  if (!hasAnonymous && !hasJukebox && !hasRankingMode && !hasHideQueueNames) {
    return NextResponse.json(
      {
        error:
          "Provide anonymous_mode, jukebox_enabled, jukebox_ranking_mode, and/or hide_queue_names",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.host_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, boolean | string> = {};
  if (hasAnonymous) patch.anonymous_mode = body.anonymous_mode!;
  if (hasJukebox) patch.jukebox_enabled = body.jukebox_enabled!;
  if (hasRankingMode) patch.jukebox_ranking_mode = body.jukebox_ranking_mode!;
  if (hasHideQueueNames) patch.hide_queue_names = body.hide_queue_names!;

  const { data: updated, error: updateErr } = await supabase
    .from("live_sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update session" },
      { status: 500 },
    );
  }

  const session = updated as LiveSessionRow;

  if (body.anonymous_mode) {
    try {
      await resolveLiveDisplayName(supabase, updated as LiveSessionRow, user);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to assign alias";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ session });
}

export async function DELETE(
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

  const { data: row, error: fetchErr } = await supabase
    .from("live_sessions")
    .select("host_user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.host_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("live_sessions")
    .update({ is_active: false })
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
