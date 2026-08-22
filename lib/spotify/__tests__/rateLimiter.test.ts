import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { SpotifyApiError } from "../errors";
import {
  beginSpotifyHalfOpenProbe,
  getSpotifyCircuitState,
  isSpotify429Error,
  isSpotifyCircuitOpen,
  recordSpotify429,
  recordSpotifySuccess,
  releaseSpotifyHalfOpenProbe,
  resetSpotifyCircuitForTests,
  shouldBlockSpotifyRequests,
} from "../rateLimiter";

const OPEN_MS = 5 * 60_000;

function enterHalfOpen(): void {
  recordSpotify429();
  recordSpotify429();
  recordSpotify429();
  assert.equal(isSpotifyCircuitOpen(), true);

  const opened = Date.now();
  const realNow = Date.now;
  Date.now = () => opened + OPEN_MS + 1;
  assert.equal(getSpotifyCircuitState(), "half_open");
  Date.now = realNow;
}

beforeEach(() => {
  resetSpotifyCircuitForTests();
});

afterEach(() => {
  resetSpotifyCircuitForTests();
  Date.now = Date.now; // eslint-disable-line no-self-assign
});

describe("isSpotify429Error", () => {
  it("matches Spotify 429", () => {
    assert.equal(isSpotify429Error(new SpotifyApiError(429, "rate limited")), true);
  });

  it("does not treat circuit-open 503 as a 429", () => {
    assert.equal(
      isSpotify429Error(new SpotifyApiError(503, "Spotify circuit open")),
      false,
    );
  });

  it("does not match generic circuit errors", () => {
    assert.equal(
      isSpotify429Error(new Error("Circuit open — Spotify unavailable")),
      false,
    );
  });
});

describe("half-open probe", () => {
  it("allows only one probe at a time in half-open", () => {
    enterHalfOpen();
    const opened = Date.now();
    Date.now = () => opened + OPEN_MS + 1;

    assert.equal(beginSpotifyHalfOpenProbe(), true);
    assert.equal(shouldBlockSpotifyRequests(), true);
    assert.equal(beginSpotifyHalfOpenProbe(), false);

    releaseSpotifyHalfOpenProbe();
    assert.equal(shouldBlockSpotifyRequests(), false);
    assert.equal(beginSpotifyHalfOpenProbe(), true);

    recordSpotifySuccess();
    assert.equal(getSpotifyCircuitState(), "closed");
  });

  it("re-opens on 429 during half-open probe", () => {
    enterHalfOpen();
    const opened = Date.now();
    Date.now = () => opened + OPEN_MS + 1;

    assert.equal(beginSpotifyHalfOpenProbe(), true);
    recordSpotify429();

    assert.equal(isSpotifyCircuitOpen(), true);
    assert.equal(getSpotifyCircuitState(), "open");
  });
});
