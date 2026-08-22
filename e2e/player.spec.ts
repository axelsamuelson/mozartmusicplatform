import { test, expect } from "@playwright/test";

async function hasSpotifyPlaybackToken(
  request: import("@playwright/test").APIRequestContext,
): Promise<boolean> {
  const res = await request.get("/api/spotify/playback");
  if (res.status() === 401) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error !== "no_token";
  }
  return res.ok();
}

test.describe("player", () => {
  test("player shell visible when authenticated", async ({ page, request }) => {
    const linked = await hasSpotifyPlaybackToken(request);

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    if (linked) {
      await expect(page.getByText("Spotify connection lost")).not.toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: /^(Play|Pause)$/ }).first(),
      ).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(page.getByText("Spotify connection lost")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
    }
  });

  test("playback API responds for authenticated user", async ({ request }) => {
    const res = await request.get("/api/spotify/playback");
    const body = (await res.json()) as { error?: string; isPlaying?: boolean };

    if (res.status() === 401) {
      expect(body.error).toBe("no_token");
      return;
    }

    expect(res.ok()).toBeTruthy();
    expect(typeof body.isPlaying).toBe("boolean");
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
