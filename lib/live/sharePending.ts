const PENDING_SHARE_KEY = "wam_pending_share";

export function savePendingShareReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_SHARE_KEY, path);
}

export function peekPendingShareReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_SHARE_KEY);
}

export function consumePendingShareReturnPath(): string | null {
  const path = peekPendingShareReturnPath();
  if (path && typeof window !== "undefined") {
    sessionStorage.removeItem(PENDING_SHARE_KEY);
  }
  return path;
}
