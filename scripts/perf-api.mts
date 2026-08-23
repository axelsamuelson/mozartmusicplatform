import "./load-env-local.mts";

import { SMOKE_TRACK_ID } from "../lib/smoke/constants";

import { smokeFetch, smokeLogin, SMOKE_BASE_URL } from "./smoke-lib.mts";

type ApiSample = { label: string; ms: number; status: number };

const BUDGET_OK_MS = 1500;
const BUDGET_SLOW_MS = 4000;

async function timeGet(
  label: string,
  path: string,
  cookie: string,
): Promise<ApiSample> {
  const t0 = Date.now();
  const res = await smokeFetch(path, cookie, { cache: "no-store" });
  const ms = Date.now() - t0;
  return { label, ms, status: res.status };
}

function grade(ms: number): string {
  if (ms <= BUDGET_OK_MS) return "ok";
  if (ms <= BUDGET_SLOW_MS) return "slow";
  return "BAD";
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

async function main(): Promise<void> {
  console.log("[perf:api] base URL:", SMOKE_BASE_URL);
  const { cookie, email } = await smokeLogin();
  console.log("[perf:api] logged in as", email);

  const samples = await Promise.all([
    timeGet("GET /api/ratings?limit=20&stats=1", "/api/ratings?limit=20&stats=1", cookie),
    timeGet("GET /api/ratings?scores_only=1", "/api/ratings?scores_only=1", cookie),
    timeGet("GET /api/playlists", "/api/playlists", cookie),
    timeGet("GET /api/profile/overview", "/api/profile/overview", cookie),
    timeGet(
      "GET /api/ratings?item_type=track",
      "/api/ratings?item_type=track",
      cookie,
    ),
    timeGet("GET /api/spotify/playback", "/api/spotify/playback", cookie),
    timeGet(
      "GET /api/spotify/my-playlists",
      "/api/spotify/my-playlists",
      cookie,
    ),
    timeGet(
      `GET /api/ratings?spotify_id=…`,
      `/api/ratings?spotify_id=${encodeURIComponent(SMOKE_TRACK_ID)}`,
      cookie,
    ),
    timeGet(
      "GET /api/spotify/search",
      `/api/spotify/search?q=${encodeURIComponent("radiohead")}&type=track,album,artist&limit=10`,
      cookie,
    ),
    timeGet("GET /api/tags", "/api/tags", cookie),
  ]);

  console.log("");
  console.log("API latency (authenticated)");
  console.log("─".repeat(56));
  console.log(pad("Endpoint", 36) + pad("ms", 10) + "Status");
  console.log("─".repeat(56));

  for (const s of samples) {
    console.log(
      pad(s.label, 36) +
        pad(`${s.ms}ms`, 10) +
        `${s.status} ${grade(s.ms)}`,
    );
  }

  console.log("─".repeat(56));
  console.log(
    `Budget: ≤${BUDGET_OK_MS}ms ok · ≤${BUDGET_SLOW_MS}ms slow · run twice to compare warm cache`,
  );

  const failed = samples.filter((s) => s.status >= 500);
  if (failed.length > 0) {
    console.error("[perf:api] FAILED:", failed.map((s) => s.label).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[perf:api] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
