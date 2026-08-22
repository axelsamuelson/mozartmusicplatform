import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SpotifyPlaybackApiResponse } from "../currentlyPlaying";
import { advancePlaybackProgress } from "../playbackDedup";

describe("advancePlaybackProgress", () => {
  it("leaves paused payloads alone", () => {
    const body = {
      isPlaying: false,
      progressMs: 1000,
      durationMs: 10_000,
      trackId: "a",
    } as SpotifyPlaybackApiResponse;
    assert.deepEqual(advancePlaybackProgress(body, Date.now() - 2000), body);
  });

  it("advances playing progress by elapsed time and clamps", () => {
    const sampledAt = 1_000_000;
    const now = sampledAt + 1500;
    const next = advancePlaybackProgress(
      {
        isPlaying: true,
        progressMs: 9000,
        durationMs: 10_000,
        trackId: "a",
      } as SpotifyPlaybackApiResponse,
      sampledAt,
      now,
    );
    assert.equal(
      "progressMs" in next && next.progressMs === 10_000,
      true,
    );
  });
});
