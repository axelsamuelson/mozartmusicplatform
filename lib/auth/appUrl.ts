/**
 * Canonical app origin for OAuth redirects.
 * Set NEXT_PUBLIC_APP_URL in Vercel (e.g. https://musicator.app).
 * Also whitelist the same /auth/callback URL in Supabase → Authentication → URL Configuration.
 */
export function getConfiguredAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** Client-side origin for signInWithOAuth redirectTo. */
export function getClientAppOrigin(): string {
  const configured = getConfiguredAppOrigin();
  if (typeof window !== "undefined") {
    if (configured && !configured.includes("localhost")) {
      return configured;
    }
    return window.location.origin;
  }
  return configured ?? "http://localhost:3000";
}

/** Server-side origin for post-auth redirects (callback route). */
export function getRequestAppOrigin(request: {
  url: string;
  headers: { get(name: string): string | null };
}): string {
  const configured = getConfiguredAppOrigin();
  if (configured && !configured.includes("localhost")) {
    return configured;
  }

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
