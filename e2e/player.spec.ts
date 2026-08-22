import { test, expect } from "@playwright/test";

test.describe("player", () => {
  test("player shell visible when authenticated (no Spotify token)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    // Test user has Supabase auth but no Spotify provider token.
    await expect(page.getByText("Spotify connection lost")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  });

  test("playback API responds for authenticated user", async ({ request }) => {
    const res = await request.get("/api/spotify/playback");
    expect([200, 401]).toContain(res.status());
    const body = (await res.json()) as { error?: string; isPlaying?: boolean };
    if (res.status() === 401) {
      expect(body.error).toBe("no_token");
    } else {
      expect(typeof body.isPlaying).toBe("boolean");
    }
  });

  test("dev live quick-start works", async ({ request }) => {
    const res = await request.post("/api/dev/live/quick-start", {
      data: {},
    });
    if (!res.ok()) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`quick-start ${res.status()}: ${err.error ?? "unknown"}`);
    }
    const body = (await res.json()) as {
      sessionId?: string;
      code?: string;
      session?: { id?: string; code?: string };
    };
    expect(body.sessionId ?? body.session?.id).toBeTruthy();
    expect(body.code ?? body.session?.code).toBeTruthy();
  });
});
