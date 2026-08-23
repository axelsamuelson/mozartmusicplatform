import "./load-env-local.mts";

import { smokeTargetLabel } from "../lib/smoke/target";

import { smokeFetch, smokeLogin, SMOKE_BASE_URL } from "./smoke-lib.mts";

const BUDGET_OK_MS = 2_000;
const BUDGET_SLOW_MS = 5_000;
const BUDGET_BAD_MS = 10_000;
const USER_REPORT_MS = 30_000;
const RUNS = 3;

type LiveSaveSample = {
  run: number;
  ms: number;
  status: number;
  error?: string;
};

function grade(ms: number): string {
  if (ms <= BUDGET_OK_MS) return "ok";
  if (ms <= BUDGET_SLOW_MS) return "slow";
  if (ms <= BUDGET_BAD_MS) return "BAD";
  if (ms <= USER_REPORT_MS) return "very BAD";
  return "frozen-tier";
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

async function startLiveSession(cookie: string): Promise<{
  sessionId: string;
  code: string;
  trackId: string | null;
}> {
  const t0 = Date.now();
  const res = await smokeFetch("/api/dev/live/quick-start", cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    sessionId?: string;
    code?: string;
    session?: { id?: string; code?: string; spotify_track_id?: string | null };
  };
  if (!res.ok) {
    throw new Error(
      `quick-start failed (${res.status}, ${ms}ms): ${body.error ?? "unknown"}`,
    );
  }
  const sessionId = body.sessionId ?? body.session?.id;
  const code = body.code ?? body.session?.code;
  const trackId = body.session?.spotify_track_id ?? null;
  if (!sessionId || !code) {
    throw new Error("quick-start returned no session");
  }
  console.log("[perf:live-rating-save] quick-start OK", {
    ms,
    sessionId,
    code,
    trackId,
  });
  return { sessionId, code, trackId };
}

async function timeLiveSave(
  cookie: string,
  sessionId: string,
  trackId: string,
  score: number,
  run: number,
): Promise<LiveSaveSample> {
  const t0 = Date.now();
  const res = await smokeFetch(`/api/live/${sessionId}/ratings`, cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      score,
      tempo: null,
      intensity: null,
      genre_ids: [],
      moment_ids: [],
      spotify_track_id: trackId,
      rating_time_ms: 12_000,
    }),
    cache: "no-store",
  });
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { run, ms, status: res.status, error: body.error };
}

async function endSession(cookie: string, sessionId: string): Promise<void> {
  const res = await smokeFetch(`/api/live/${sessionId}/end`, cookie, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    console.warn(
      `[perf:live-rating-save] session end failed (${res.status}):`,
      body.error ?? "unknown",
    );
  }
}

async function main(): Promise<void> {
  const target = smokeTargetLabel(SMOKE_BASE_URL);
  console.log("[perf:live-rating-save] target:", target, SMOKE_BASE_URL);
  const { cookie, email } = await smokeLogin();
  console.log("[perf:live-rating-save] logged in as", email);

  const playlistsRes = await smokeFetch("/api/playlists", cookie, {
    cache: "no-store",
  });
  const playlistsBody = (await playlistsRes.json().catch(() => ({}))) as {
    playlists?: { name: string }[];
  };
  const playlistCount = playlistsBody.playlists?.length ?? 0;
  console.log(
    "[perf:live-rating-save] WAM playlists:",
    playlistCount,
    playlistCount > 0
      ? `(${playlistsBody.playlists!.map((p) => p.name).join(", ")})`
      : "",
  );

  const { sessionId, trackId } = await startLiveSession(cookie);
  if (!trackId) {
    throw new Error("Live session has no current track");
  }

  const samples: LiveSaveSample[] = [];
  const scores = [74, 75, 76];

  for (let i = 0; i < RUNS; i++) {
    const sample = await timeLiveSave(cookie, sessionId, trackId, scores[i]!, i + 1);
    samples.push(sample);
    if (sample.status >= 400) {
      console.error(
        `[perf:live-rating-save] run ${sample.run} failed (${sample.status}, ${sample.ms}ms):`,
        sample.error ?? "unknown",
      );
      await endSession(cookie, sessionId);
      process.exit(1);
    }
  }

  await endSession(cookie, sessionId);

  const times = samples.map((s) => s.ms);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  console.log("");
  console.log("POST /api/live/{sessionId}/ratings (Test WAM / live QuickRate path)");
  console.log("─".repeat(60));
  console.log(pad("Run", 8) + pad("ms", 10) + "Grade");
  console.log("─".repeat(60));
  for (const s of samples) {
    console.log(pad(String(s.run), 8) + pad(`${s.ms}ms`, 10) + grade(s.ms));
  }
  console.log("─".repeat(60));
  console.log(`min ${min}ms · avg ${avg}ms · max ${max}ms`);
  console.log("");
  console.log(
    `Budget: ≤${BUDGET_OK_MS}ms ok · ≤${BUDGET_SLOW_MS}ms slow · ≤${BUDGET_BAD_MS}ms BAD · user-reported freeze ~${USER_REPORT_MS}ms+`,
  );

  if (max >= USER_REPORT_MS) {
    console.log("");
    console.log(
      "⚠ Confirms 30–60s freeze on live rating save — synchronous playlist sync in persistLiveRating is the likely cause.",
    );
  } else if (max >= BUDGET_BAD_MS) {
    console.log("");
    console.log("⚠ Live save is very slow — investigate persistLiveRating + Spotify sync.");
  } else if (max >= BUDGET_SLOW_MS) {
    console.log("");
    console.log("△ Live save is sluggish — UI will feel stuck on Submit rating.");
  } else {
    console.log("");
    console.log(
      "✓ Live save responded quickly in this probe — if UI still freezes 30–60s, check client-side blocking or a different code path.",
    );
  }
}

main().catch((err) => {
  console.error(
    "[perf:live-rating-save] FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
