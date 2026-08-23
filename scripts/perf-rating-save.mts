import "./load-env-local.mts";

import { playlistFiltersToDbColumns } from "../lib/playlist/playlistFilters";
import { SMOKE_TRACK_ID } from "../lib/smoke/constants";
import { smokeTargetLabel } from "../lib/smoke/target";
import {
  linkTestUserSpotifyRefresh,
  testSpotifyRefreshTokenFromEnv,
} from "../lib/dev/linkTestUserSpotifyRefresh";
import { createSpotifyPlaylist } from "../lib/spotify/userPlaylistSpotify";
import { createAdminClient } from "../lib/supabase/admin";

import { smokeFetch, smokeLogin, SMOKE_BASE_URL } from "./smoke-lib.mts";

const BUDGET_OK_MS = 2_000;
const BUDGET_SLOW_MS = 5_000;
const BUDGET_BAD_MS = 10_000;
const USER_REPORT_MS = 30_000;
const RUNS = 3;

type SaveSample = {
  run: number;
  ms: number;
  status: number;
  error?: string;
  ratingId?: string;
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

const PERF_PLAYLIST_NAME = "perf-probe-playlist";

async function spotifyAccessFromEnv(): Promise<string> {
  const refreshToken = testSpotifyRefreshTokenFromEnv();
  if (!refreshToken) {
    throw new Error("WAM_TEST_SPOTIFY_REFRESH_TOKEN missing in .env.local");
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET missing");
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify refresh failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Spotify refresh returned no access_token");
  return body.access_token;
}

/** Admin + env Spotify token — smoke cookie lacks provider_token for POST /api/playlists. */
async function ensurePerfPlaylist(userId: string, email: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existingRows, error: listErr } = await admin
    .from("wam_playlists")
    .select("id, name, spotify_playlist_id")
    .eq("user_id", userId)
    .eq("name", PERF_PLAYLIST_NAME);

  if (listErr) {
    throw new Error(`Could not list playlists: ${listErr.message}`);
  }

  if (existingRows && existingRows.length > 0) {
    console.log("[perf:rating-save] using existing playlist:", PERF_PLAYLIST_NAME);
    return;
  }

  await linkTestUserSpotifyRefresh(userId, email);

  console.log("[perf:rating-save] creating playlist:", PERF_PLAYLIST_NAME);
  const t0 = Date.now();
  const accessToken = await spotifyAccessFromEnv();
  const created = await createSpotifyPlaylist(
    accessToken,
    PERF_PLAYLIST_NAME,
    "Auto-created for rating save perf probes",
  );
  const filters = playlistFiltersToDbColumns({
    filter_genres: [],
    filter_moments: [],
    filter_min_score: 0,
    filter_vibes: [],
    filter_tempo_min: null,
    filter_tempo_max: null,
    filter_intensity_min: null,
    filter_intensity_max: null,
    filter_release_year_min: null,
    filter_release_year_max: null,
  });

  const { data: inserted, error: insertErr } = await admin
    .from("wam_playlists")
    .insert({
      user_id: userId,
      spotify_playlist_id: created.id,
      name: PERF_PLAYLIST_NAME,
      description: "Auto-created for rating save perf probes",
      ...filters,
      sort_order: "recently_rated",
      track_count: 0,
      last_synced_at: null,
    })
    .select("id, name")
    .single();

  const createMs = Date.now() - t0;
  if (insertErr || !inserted) {
    throw new Error(
      `Playlist DB insert failed (${createMs}ms): ${insertErr?.message ?? "unknown"}`,
    );
  }
  console.log("[perf:rating-save] playlist created", {
    ms: createMs,
    id: inserted.id,
    spotifyId: created.id,
    name: inserted.name,
  });
}

function savePayload(score: number) {
  return {
    spotify_id: SMOKE_TRACK_ID,
    score,
    comment: "perf rating save probe",
    genre_ids: [] as number[],
    moment_ids: [] as number[],
    item: {
      type: "track" as const,
      name: "Perf Save Probe Track",
      artist_name: "WAM Perf",
      image_url: null,
    },
  };
}

async function timeSave(
  cookie: string,
  score: number,
  run: number,
): Promise<SaveSample> {
  const t0 = Date.now();
  const res = await smokeFetch("/api/ratings?lite=1", cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(savePayload(score)),
    cache: "no-store",
  });
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    rating?: { id?: string };
  };
  return {
    run,
    ms,
    status: res.status,
    error: body.error,
    ratingId: body.rating?.id,
  };
}

async function main(): Promise<void> {
  const ensurePlaylist = process.argv.includes("--with-playlist");
  const target = smokeTargetLabel(SMOKE_BASE_URL);
  console.log("[perf:rating-save] target:", target, SMOKE_BASE_URL);
  const { cookie, email, userId } = await smokeLogin();
  console.log("[perf:rating-save] logged in as", email);

  if (ensurePlaylist) {
    await ensurePerfPlaylist(userId, email);
  }

  const playlistsRes = await smokeFetch("/api/playlists", cookie, {
    cache: "no-store",
  });
  const playlistsBody = (await playlistsRes.json().catch(() => ({}))) as {
    playlists?: { id: string; name: string; track_count: number }[];
  };
  const playlistCount = playlistsBody.playlists?.length ?? 0;
  console.log(
    "[perf:rating-save] WAM playlists on account:",
    playlistCount,
    playlistCount > 0
      ? `(${playlistsBody.playlists!.map((p) => p.name).join(", ")})`
      : "",
  );

  const samples: SaveSample[] = [];
  const scores = [71, 72, 73];

  for (let i = 0; i < RUNS; i++) {
    const sample = await timeSave(cookie, scores[i]!, i + 1);
    samples.push(sample);
    if (!sample.ratingId || sample.status >= 400) {
      console.error(
        `[perf:rating-save] run ${sample.run} failed (${sample.status}, ${sample.ms}ms):`,
        sample.error ?? "no rating id",
      );
      process.exit(1);
    }
  }

  const ratingId = samples.at(-1)?.ratingId;
  let deleteMs: number | null = null;
  if (ratingId) {
    const t0 = Date.now();
    const delRes = await smokeFetch(`/api/ratings/${ratingId}`, cookie, {
      method: "DELETE",
      cache: "no-store",
    });
    deleteMs = Date.now() - t0;
    if (!delRes.ok) {
      const body = (await delRes.json().catch(() => ({}))) as { error?: string };
      console.warn(
        `[perf:rating-save] cleanup delete failed (${delRes.status}):`,
        body.error ?? "unknown",
      );
    }
  }

  const times = samples.map((s) => s.ms);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  console.log("");
  console.log("POST /api/ratings?lite=1 (item/player save path)");
  console.log("─".repeat(60));
  console.log(pad("Run", 8) + pad("ms", 10) + "Grade");
  console.log("─".repeat(60));
  for (const s of samples) {
    console.log(pad(String(s.run), 8) + pad(`${s.ms}ms`, 10) + grade(s.ms));
  }
  console.log("─".repeat(60));
  console.log(`min ${min}ms · avg ${avg}ms · max ${max}ms`);
  if (deleteMs != null) {
    console.log(`DELETE cleanup: ${deleteMs}ms ${grade(deleteMs)}`);
  }
  console.log("");
  console.log(
    `Budget: ≤${BUDGET_OK_MS}ms ok · ≤${BUDGET_SLOW_MS}ms slow · ≤${BUDGET_BAD_MS}ms BAD · user-reported freeze ~${USER_REPORT_MS}ms+`,
  );

  if (max >= USER_REPORT_MS) {
    console.log("");
    console.log(
      "⚠ Confirms user-reported freeze tier on POST save — playlist sync likely blocks the HTTP response.",
    );
  } else if (max >= BUDGET_BAD_MS) {
    console.log("");
    console.log("⚠ Save is very slow but below 30s — still needs optimization.");
  } else if (max >= BUDGET_SLOW_MS) {
    console.log("");
    console.log("△ Save is sluggish — UI will feel stuck on Saving…");
  } else {
    console.log("");
    console.log(
      ensurePlaylist
        ? "✓ POST save stayed fast with a matching WAM playlist — 30–60s freeze is likely live/Test WAM or client-side, not playlist sync blocking this path."
        : "✓ POST save is fast in this probe — if UI still freezes 30–60s, check live/Test WAM path or client-side blocking.",
    );
  }
}

main().catch((err) => {
  console.error("[perf:rating-save] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
