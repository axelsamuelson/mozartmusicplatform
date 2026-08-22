import {
  SMOKE_BASE_URL,
  SMOKE_TRACK_ID,
  smokeFetch,
  smokeLogin,
} from "./smoke-lib.mts";

export async function runRatingsSmoke(): Promise<void> {
  console.log("[smoke:ratings] base URL:", SMOKE_BASE_URL);
  const { cookie, email } = await smokeLogin();
  console.log("[smoke:ratings] logged in as", email);

  const savePayload = {
    spotify_id: SMOKE_TRACK_ID,
    score: 73,
    comment: "smoke test",
    genre_ids: [] as number[],
    moment_ids: [] as number[],
    item: {
      type: "track" as const,
      name: "Smoke Test Track",
      artist_name: "WAM Smoke",
      image_url: null,
    },
  };

  const t0 = Date.now();
  const saveRes = await smokeFetch("/api/ratings?lite=1", cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(savePayload),
  });
  const saveMs = Date.now() - t0;
  const saveBody = (await saveRes.json().catch(() => ({}))) as {
    error?: string;
    rating?: { id?: string; score?: number };
  };

  if (!saveRes.ok || !saveBody.rating?.id) {
    throw new Error(
      `Save failed (${saveRes.status}, ${saveMs}ms): ${saveBody.error ?? "no rating"}`,
    );
  }
  console.log("[smoke:ratings] save OK", {
    ms: saveMs,
    score: saveBody.rating.score,
    id: saveBody.rating.id,
  });
  if (saveMs > 5000) {
    console.warn("[smoke:ratings] WARN: save took >5s");
  }

  const batchRes = await smokeFetch(
    `/api/ratings?spotify_ids=${encodeURIComponent(SMOKE_TRACK_ID)}`,
    cookie,
    { cache: "no-store" },
  );
  const batchBody = (await batchRes.json().catch(() => ({}))) as {
    scores?: Record<string, number>;
    error?: string;
  };
  if (!batchRes.ok || batchBody.scores?.[SMOKE_TRACK_ID] !== 73) {
    throw new Error(
      `Batch scores failed: ${batchBody.error ?? JSON.stringify(batchBody)}`,
    );
  }
  console.log("[smoke:ratings] batch scores OK");

  const histRes = await smokeFetch(
    `/api/ratings?spotify_id=${encodeURIComponent(SMOKE_TRACK_ID)}`,
    cookie,
    { cache: "no-store" },
  );
  const histBody = (await histRes.json().catch(() => ({}))) as {
    rating?: { score?: number };
    score_history?: unknown[];
    error?: string;
  };
  if (!histRes.ok || histBody.rating?.score !== 73) {
    throw new Error(`History GET failed: ${histBody.error ?? histRes.status}`);
  }
  console.log("[smoke:ratings] history GET OK", {
    historyEntries: histBody.score_history?.length ?? 0,
  });

  const delRes = await smokeFetch(
    `/api/ratings/${saveBody.rating.id}`,
    cookie,
    { method: "DELETE" },
  );
  if (!delRes.ok) {
    const delBody = (await delRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Cleanup delete failed: ${delBody.error ?? delRes.status}`);
  }
  console.log("[smoke:ratings] cleanup delete OK");

  const afterDel = await smokeFetch(
    `/api/ratings?spotify_ids=${encodeURIComponent(SMOKE_TRACK_ID)}`,
    cookie,
    { cache: "no-store" },
  );
  const afterBody = (await afterDel.json().catch(() => ({}))) as {
    scores?: Record<string, number>;
  };
  if (afterDel.ok && afterBody.scores?.[SMOKE_TRACK_ID] !== undefined) {
    throw new Error("Score still present after delete");
  }
  console.log("[smoke:ratings] post-delete scores cleared OK");
}

if (process.argv[1]?.includes("smoke-ratings.mts")) {
  runRatingsSmoke()
    .then(() => console.log("[smoke:ratings] passed"))
    .catch((e) => {
      console.error("[smoke:ratings] FAILED:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
