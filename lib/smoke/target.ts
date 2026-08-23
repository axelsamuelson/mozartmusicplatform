/** True when smoke/e2e targets a local server (localhost / 127.0.0.1). */
export function isLocalSmokeBase(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

/** Headers for /api/dev/smoke/login — required in production (NODE_ENV !== development). */
export function smokeTargetHeaders(): Record<string, string> {
  const secret = process.env.DEV_LIVE_SECRET;
  if (!secret) return {};
  return { "x-dev-live-secret": secret };
}

export function smokeTargetLabel(base: string): string {
  return isLocalSmokeBase(base) ? "local" : new URL(base).host;
}
