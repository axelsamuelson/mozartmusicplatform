import { advancePlaybackProgress } from "../lib/spotify/playbackDedup";

import { smokeFetch, smokeLogin, SMOKE_BASE_URL } from "./smoke-lib.mts";

export async function runPlaybackSmoke(): Promise<void> {
  console.log("[smoke:playback] base URL:", SMOKE_BASE_URL);
  const { cookie, email } = await smokeLogin();
  console.log("[smoke:playback] logged in as", email);

  const t0 = Date.now();
  const res = await smokeFetch("/api/spotify/playback", cookie, {
    cache: "no-store",
  });
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    isPlaying?: boolean;
    trackId?: string;
    progressMs?: number;
    serverTime?: number;
  };

  if (res.status === 401 && body.error === "no_token") {
    console.log(
      "[smoke:playback] no Spotify token — set WAM_TEST_SPOTIFY_REFRESH_TOKEN in .env.local and re-run login",
      { ms },
    );
    return;
  }

  if (!res.ok) {
    throw new Error(
      `Playback GET failed (${res.status}, ${ms}ms): ${body.error ?? "unknown"}`,
    );
  }

  console.log("[smoke:playback] playback OK", {
    ms,
    isPlaying: body.isPlaying,
    trackId: body.trackId ?? null,
  });

  if (ms > 4000) {
    console.warn("[smoke:playback] WARN: playback poll took >4s");
  }

  const dedup1 = await smokeFetch("/api/spotify/playback", cookie, {
    cache: "no-store",
  });
  const dedup2 = await smokeFetch("/api/spotify/playback", cookie, {
    cache: "no-store",
  });
  const b1 = (await dedup1.json().catch(() => ({}))) as {
    trackId?: string;
    progressMs?: number;
    isPlaying?: boolean;
  };
  const b2 = (await dedup2.json().catch(() => ({}))) as {
    trackId?: string;
    progressMs?: number;
    isPlaying?: boolean;
  };

  if (dedup1.ok && dedup2.ok && b1.trackId && b1.trackId === b2.trackId) {
    if (b1.isPlaying && typeof b1.progressMs === "number" && typeof b2.progressMs === "number") {
      if (b2.progressMs < b1.progressMs) {
        throw new Error(
          `Dedup progress went backwards: ${b1.progressMs} -> ${b2.progressMs}`,
        );
      }
      console.log("[smoke:playback] dedup progress monotonic OK", {
        first: b1.progressMs,
        second: b2.progressMs,
      });
    }
  }

  const freshRes = await smokeFetch("/api/spotify/playback?fresh=1", cookie, {
    cache: "no-store",
  });
  if (freshRes.status === 401) {
    console.log("[smoke:playback] fresh poll: no_token (ok for test user)");
    return;
  }
  if (!freshRes.ok) {
    const freshBody = (await freshRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Fresh playback failed: ${freshBody.error ?? freshRes.status}`);
  }
  console.log("[smoke:playback] fresh poll OK");

  const paused = { isPlaying: false, progressMs: 1000, trackId: "x" };
  const advanced = advancePlaybackProgress(paused, Date.now() - 2000);
  if ("progressMs" in advanced && advanced.progressMs !== 1000) {
    throw new Error("Paused playback should not advance progress");
  }
  console.log("[smoke:playback] progress helper OK");
}

if (process.argv[1]?.includes("smoke-playback.mts")) {
  runPlaybackSmoke()
    .then(() => console.log("[smoke:playback] passed"))
    .catch((e) => {
      console.error("[smoke:playback] FAILED:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
