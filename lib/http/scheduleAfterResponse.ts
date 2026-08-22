import { after } from "next/server";

/**
 * Schedule background work after the HTTP response.
 * Caps how long `after()` keeps the request lifecycle open — Spotify playlist
 * sync can hang/rate-limit and otherwise leave clients stuck on "Saving…".
 */
export function scheduleAfterResponse(
  work: () => Promise<void>,
  options?: { maxMs?: number },
): void {
  const maxMs = options?.maxMs ?? 8_000;
  const run = () =>
    Promise.race([
      work().catch((e) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[scheduleAfterResponse]", e);
        }
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, maxMs);
      }),
    ]);

  try {
    after(() => run());
  } catch {
    void run();
  }
}
