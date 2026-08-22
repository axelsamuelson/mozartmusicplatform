import { test, expect } from "@playwright/test";

import { SMOKE_TRACK_ID } from "@/lib/smoke/constants";

test.describe("rating save UI", () => {
  test.beforeEach(async ({ request }) => {
    const saveRes = await request.post("/api/ratings?lite=1", {
      data: {
        spotify_id: SMOKE_TRACK_ID,
        score: 65,
        comment: "e2e seed",
        genre_ids: [],
        moment_ids: [],
        item: {
          type: "track",
          name: "Smoke Test Track",
          artist_name: "WAM Smoke",
          image_url: null,
        },
      },
    });
    expect(saveRes.ok()).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    const getRes = await request.get(
      `/api/ratings?spotify_id=${encodeURIComponent(SMOKE_TRACK_ID)}`,
    );
    if (!getRes.ok()) return;
    const body = (await getRes.json()) as { rating?: { id?: string } | null };
    const id = body.rating?.id;
    if (id) {
      await request.delete(`/api/ratings/${id}`);
    }
  });

  test("item page saves rating without hanging on Saving…", async ({ page }) => {
    await page.goto(`/item/${SMOKE_TRACK_ID}?type=track`);

    await expect(page.getByRole("heading", { level: 2, name: "Your rating" })).toBeVisible({
      timeout: 30_000,
    });

    const submit = page.getByRole("button", { name: /Update rating|Save rating/ });
    await expect(submit).toBeVisible({ timeout: 30_000 });
    await expect(submit).toBeEnabled();

    const t0 = Date.now();
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/ratings") &&
          res.request().method() === "POST" &&
          res.status() < 500,
        { timeout: 15_000 },
      ),
      submit.click(),
    ]);
    const elapsed = Date.now() - t0;

    expect(saveResponse.ok()).toBeTruthy();
    const saveBody = (await saveResponse.json()) as {
      rating?: { score?: number };
      error?: string;
    };
    expect(saveBody.rating?.score).toBeTruthy();
    expect(elapsed).toBeLessThan(12_000);

    await expect(submit).not.toHaveText("Saving…", { timeout: 5_000 });
    await expect(submit).toHaveText(/Update rating|Save rating/);
  });
});
