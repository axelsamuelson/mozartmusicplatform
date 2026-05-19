/**
 * Canonical app origin for share links, meta tags, etc.
 * Set NEXT_PUBLIC_APP_URL in Vercel (e.g. https://musicator.app).
 *
 * OAuth redirectTo must use window.location.origin (client) or the incoming
 * request origin (server callback) — never NEXT_PUBLIC_APP_URL.
 */
export function getConfiguredAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** @deprecated Use window.location.origin directly in browser OAuth flows. */
export function getClientAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return getConfiguredAppOrigin() ?? "http://localhost:3000";
}

/** Post-auth redirects on /auth/callback — match the request host, not env URL. */
export function getRequestAppOrigin(request: {
  url: string;
  headers: { get(name: string): string | null };
}): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost.split(",")[0]!.trim()}`;
  }

  return new URL(request.url).origin;
}

export function buildAuthCallbackUrl(origin: string, nextPath: string): string {
  const safeNext =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
