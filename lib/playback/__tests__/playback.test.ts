import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyRecentTrackScores } from "../applyRecentTrackScores";
import type { RecentTrack } from "../recentTrack";
import { getCurrentProgressMs } from "../progress";
import { apiPayloadToPlayback, emptyPlayback } from "../mappers";
import type { PlaybackState } from "../types";

function track(
  partial: Partial<RecentTrack> & Pick<RecentTrack, "spotifyId">,
): RecentTrack {
  return {
    name: "Song",
    artistName: "Artist",
    artistId: null,
    imageUrl: null,
    playedAt: new Date().toISOString(),
    score: null,
    ...partial,
  };
}

describe("getCurrentProgressMs", () => {
  it("returns frozen progress when paused", () => {
    const state: PlaybackState = {
      ...emptyPlayback(),
      isPlaying: false,
      progressMsAtSync: 12_000,
      syncedAt: Date.now() - 5_000,
      durationMs: 180_000,
    };
    assert.equal(getCurrentProgressMs(state), 12_000);
  });

  it("interpolates when playing and clamps to duration", () => {
    const syncedAt = Date.now() - 2_000;
    const state: PlaybackState = {
      ...emptyPlayback(),
      isPlaying: true,
      progressMsAtSync: 10_000,
      syncedAt,
      durationMs: 11_500,
    };
    const progress = getCurrentProgressMs(state);
    assert.ok(progress >= 11_500 && progress <= 11_500);
  });

  it("pause-then-freeze pattern keeps display position", () => {
    const syncedAt = Date.now() - 3_000;
    const playing: PlaybackState = {
      ...emptyPlayback(),
      isPlaying: true,
      progressMsAtSync: 20_000,
      syncedAt,
      durationMs: 200_000,
    };
    const display = getCurrentProgressMs(playing);
    const paused: PlaybackState = {
      ...playing,
      isPlaying: false,
      progressMsAtSync: display,
      syncedAt: Date.now(),
    };
    assert.equal(getCurrentProgressMs(paused), display);
  });
});

describe("apiPayloadToPlayback", () => {
  it("maps empty payload to none source without inventing a track", () => {
    const next = apiPayloadToPlayback(
      { isPlaying: false },
      Date.now(),
    );
    assert.equal(next.source, "none");
    assert.equal(next.trackId, null);
    assert.equal(next.isPlaying, false);
  });

  it("applies half-RTT latency to progress", () => {
    const clientReceivedAt = 1_000_000;
    const next = apiPayloadToPlayback(
      {
        isPlaying: true,
        trackId: "abc",
        progressMs: 1000,
        durationMs: 200_000,
        serverTime: clientReceivedAt - 200,
      },
      clientReceivedAt,
    );
    assert.equal(next.progressMsAtSync, 1100);
    assert.equal(next.source, "api");
  });
});

describe("applyRecentTrackScores", () => {
  it("preserves prior scores when merge is non-authoritative", () => {
    const tracks = [track({ spotifyId: "a", score: 80 })];
    const next = applyRecentTrackScores(tracks, {});
    assert.equal(next[0]?.score, 80);
  });

  it("clears scores for authoritative ids missing from map", () => {
    const tracks = [
      track({ spotifyId: "a", score: 80 }),
      track({ spotifyId: "b", score: 40 }),
    ];
    const next = applyRecentTrackScores(tracks, { b: 55 }, ["a", "b"]);
    assert.equal(next[0]?.score, null);
    assert.equal(next[1]?.score, 55);
  });

  it("updates known scores without clearing unrelated rows", () => {
    const tracks = [
      track({ spotifyId: "a", score: 10 }),
      track({ spotifyId: "b", score: 20 }),
    ];
    const next = applyRecentTrackScores(tracks, { a: 99 });
    assert.equal(next[0]?.score, 99);
    assert.equal(next[1]?.score, 20);
  });
});
