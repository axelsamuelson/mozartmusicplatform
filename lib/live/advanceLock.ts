import type { SupabaseClient } from "@supabase/supabase-js";

/** Locks older than this can be taken over (deadlock protection). */
const LOCK_STALE_MS = 10_000;

export class AdvanceInProgressError extends Error {
  constructor() {
    super("Advance already in progress");
    this.name = "AdvanceInProgressError";
  }
}

export type AcquireAdvanceLockResult = {
  locked: boolean;
};

/**
 * Atomically acquire session advance lock.
 * UPDATE only succeeds when advance_lock_at IS NULL or older than 10s.
 */
export async function acquireAdvanceLock(
  admin: SupabaseClient,
  sessionId: string,
): Promise<AcquireAdvanceLockResult> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const lockAt = new Date().toISOString();

  const { data, error } = await admin
    .from("live_sessions")
    .update({ advance_lock_at: lockAt })
    .eq("id", sessionId)
    .or(`advance_lock_at.is.null,advance_lock_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return { locked: false };
  }
  return { locked: true };
}

/** @throws AdvanceInProgressError when lock is held */
export async function requireAdvanceLock(
  admin: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const result = await acquireAdvanceLock(admin, sessionId);
  if (!result.locked) {
    throw new AdvanceInProgressError();
  }
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
