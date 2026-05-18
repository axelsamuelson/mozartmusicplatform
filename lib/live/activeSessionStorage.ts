import type { ActiveLiveSessionRef } from "@/lib/types/live";

const STORAGE_KEY = "wam_active-live-session";

export function getActiveLiveSession(): ActiveLiveSessionRef | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveLiveSessionRef;
    if (
      typeof parsed.sessionId === "string" &&
      typeof parsed.code === "string"
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setActiveLiveSession(ref: ActiveLiveSessionRef): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
  window.dispatchEvent(new Event("wam-live-session-changed"));
}

export function clearActiveLiveSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("wam-live-session-changed"));
}

export function liveSessionStorageKey(): string {
  return STORAGE_KEY;
}
