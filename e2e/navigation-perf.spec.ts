import { test, expect } from "@playwright/test";

import { SMOKE_TRACK_ID } from "@/lib/smoke/constants";

import {
  formatPerfReport,
  measureGoto,
  measureNavigation,
  type PerfSample,
} from "./perf-lib";

test.describe("navigation performance", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("click-through report", async ({ page }) => {
    const samples: PerfSample[] = [];

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("items total")).toBeVisible({ timeout: 45_000 });

    // Warm pass — measures client-side nav after first paint.
    samples.push(
      await measureNavigation(page, {
        label: "nav → Search",
        linkName: "Search",
        heading: "Search",
        content: page.getByPlaceholder("Search tracks, albums, artists…"),
        apiPath: "/api/ratings",
        apiQuery: "scores_only=1",
      }),
    );

    samples.push(
      await measureNavigation(page, {
        label: "nav → Playlists",
        linkName: "Playlists",
        heading: /Playlists from your ratings/,
        content: page
          .getByRole("heading", { name: "No playlists yet" })
          .or(page.getByText("Tracks on Spotify"))
          .or(page.getByRole("button", { name: "New playlist" }))
          .first(),
        apiPath: "/api/playlists",
      }),
    );

    samples.push(
      await measureNavigation(page, {
        label: "nav → Profile",
        linkName: "Profile",
        heading: "Profile",
        content: page.getByText("Top 10 tracks"),
        apiPath: "/api/profile/overview",
      }),
    );

    samples.push(
      await measureNavigation(page, {
        label: "nav → Dashboard",
        linkName: "Dashboard",
        heading: "Dashboard",
        content: page.getByText("items total"),
        apiPath: "/api/ratings",
        apiQuery: "stats=1",
      }),
    );

    // Subnav lives on playlist pages — navigate there first.
    await page.getByRole("link", { name: "Playlists", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Playlists from your ratings/ }),
    ).toBeVisible();

    samples.push(
      await measureNavigation(page, {
        label: "subnav → Spotify Library",
        click: () =>
          page.getByRole("link", { name: "Spotify Library", exact: true }).click(),
        heading: "My Spotify Playlists",
        content: page
          .locator('a[href*="open.spotify.com/playlist"]')
          .first()
          .or(page.getByText("No playlists found in your Spotify account.")),
        apiPath: "/api/spotify/my-playlists",
      }),
    );

    samples.push(
      await measureNavigation(page, {
        label: "subnav → WAM Playlists",
        click: () =>
          page.getByRole("link", { name: "WAM Playlists", exact: true }).click(),
        heading: /Playlists from your ratings/,
        content: page
          .getByRole("heading", { name: "No playlists yet" })
          .or(page.getByText("Tracks on Spotify"))
          .first(),
        apiPath: "/api/playlists",
      }),
    );

    samples.push(
      await measureGoto(page, `/item/${SMOKE_TRACK_ID}?type=track`, {
        label: "goto → Item page",
        heading: "Your rating",
        headingLevel: 2,
        content: page.getByRole("button", {
          name: /Update rating|Save rating/,
        }),
      }),
    );

    samples.push(
      await measureGoto(page, "/profile/tracks", {
        label: "goto → Rated tracks",
        heading: "Rated tracks",
        content: page
          .getByText(/No rated tracks yet/)
          .or(page.locator("a[href^='/item/']"))
          .first(),
        apiPath: "/api/ratings",
        apiQuery: "item_type=track",
      }),
    );

    // Search query — type after returning to search.
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

    const searchT0 = Date.now();
    let searchApiMs: number | null = null;
    await Promise.all([
      page
        .waitForResponse(
          (r) =>
            r.url().includes("/api/spotify/search") &&
            r.request().method() === "GET" &&
            r.status() < 500,
          { timeout: 45_000 },
        )
        .then(() => {
          searchApiMs = Date.now() - searchT0;
        }),
      page.getByPlaceholder("Search tracks, albums, artists…").fill("radiohead"),
    ]);
    await page
      .locator("ul li")
      .filter({ hasText: "Radiohead" })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 });
    const searchContentMs = Date.now() - searchT0;
    samples.push({
      label: "search → radiohead",
      shellMs: searchContentMs,
      contentMs: searchContentMs,
      apiMs: searchApiMs,
      apiPath: "/api/spotify/search",
    });

    const report = formatPerfReport(samples);
    console.log(report);
    test.info().attach("navigation-perf.txt", {
      body: report,
      contentType: "text/plain",
    });

    // Soft gate — log slow paths but do not fail CI on latency alone.
    const slow = samples.filter(
      (s) => s.contentMs > 5000 || (s.apiMs != null && s.apiMs > 4000),
    );
    if (slow.length > 0) {
      console.warn(
        `[perf] ${slow.length} scenario(s) exceeded slow budget:`,
        slow.map((s) => s.label).join(", "),
      );
    }

    expect(samples.length).toBeGreaterThan(0);
  });
});
