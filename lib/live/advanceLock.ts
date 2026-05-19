import type { SupabaseClient } from "@supabase/supabase-js";

const LOCK_STALE_MS = 5_000;

export class AdvanceInProgressError extends Error {
  constructor() {
    super("Advance already in progress");
    this.name = "AdvanceInProgressError";
  }
}

/** Acquire session advance lock; throws AdvanceInProgressError on conflict. */
export async function acquireAdvanceLock(
  admin: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { data: row, error: readErr } = await admin
    .from("live_sessions")
    .select("advance_lock_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);

  const lockAt = row?.advance_lock_at
    ? new Date(row.advance_lock_at as string)
    : null;
  if (lockAt && Date.now() - lockAt.getTime() < LOCK_STALE_MS) {
    throw new AdvanceInProgressError();
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("live_sessions")
    .update({ advance_lock_at: nowIso })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new AdvanceInProgressError();
}

export async function releaseAdvanceLock(
  admin: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await admin
    .from("live_sessions")
    .update({ advance_lock_at: null })
    .eq("id", sessionId);
}
