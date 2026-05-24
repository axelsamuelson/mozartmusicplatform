import type { NextRequest } from "next/server";

/** Dev-only live simulation (auto-on in local development). */
export function isLiveSimulateEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_LIVE_SIMULATE === "true";
}

export function devLiveApiAllowed(request?: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.DEV_LIVE_SECRET;
  if (!secret || !request) return false;
  return request.headers.get("x-dev-live-secret") === secret;
}
