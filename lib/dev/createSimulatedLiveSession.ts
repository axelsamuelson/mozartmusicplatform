import { simulatedPlaybackPatch } from "@/lib/dev/liveSimulatePlayback";
import { simulatedTrackByIndex } from "@/lib/dev/liveSimulateTracks";
import { generateSessionCode } from "@/lib/utils/sessionCode";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveSessionRow } from "@/lib/types/live";

export type CreateSimulatedSessionOptions = {
  trackIndex?: number;
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jams_enabled?: boolean;
  wam_controls_playback?: boolean;
};

async function uniqueCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateSessionCode();
    const { data } = await supabase
      .from("live_sessions")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate session code");
}

export async function createSimulatedLiveSession(
  supabase: SupabaseClient,
  hostUserId: string,
  options: CreateSimulatedSessionOptions = {},
): Promise<LiveSessionRow> {
  const track = simulatedTrackByIndex(options.trackIndex ?? 0);
  const playbackPatch = simulatedPlaybackPatch(track, {
    isPlaying: true,
    progressMs: 0,
  });

  await supabase
    .from("live_sessions")
    .update({ is_active: false })
    .eq("host_user_id", hostUserId)
    .eq("is_active", true);

  const code = await uniqueCode(supabase);

  const { data: inserted, error: insertErr } = await supabase
    .from("live_sessions")
    .insert({
      code,
      host_user_id: hostUserId,
      is_active: true,
      anonymous_mode: options.anonymous_mode ?? false,
      jukebox_enabled: options.jukebox_enabled ?? false,
      jams_enabled: options.jams_enabled ?? false,
      wam_controls_playback: options.wam_controls_playback ?? false,
      ...playbackPatch,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message ?? "Failed to create simulated session");
  }

  return inserted as LiveSessionRow;
}
