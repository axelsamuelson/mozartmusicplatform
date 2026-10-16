import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { neighborVibeTier } from "../neighbors";

describe("neighborVibeTier", () => {
  it("prefers exact tempo/intensity + shared genre", () => {
    assert.equal(
      neighborVibeTier({
        currentTempo: 6,
        currentIntensity: 7,
        currentGenreIds: [1, 2],
        candidateTempo: 6,
        candidateIntensity: 7,
        candidateGenreIds: [2],
      }),
      0,
    );
  });

  it("treats Δ≤1 on tempo/intensity with shared genre as near", () => {
    assert.equal(
      neighborVibeTier({
        currentTempo: 6,
        currentIntensity: 7,
        currentGenreIds: [1],
        candidateTempo: 5,
        candidateIntensity: 8,
        candidateGenreIds: [1, 9],
      }),
      1,
    );
  });

  it("falls back to score-only without genre overlap", () => {
    assert.equal(
      neighborVibeTier({
        currentTempo: 6,
        currentIntensity: 7,
        currentGenreIds: [1],
        candidateTempo: 6,
        candidateIntensity: 7,
        candidateGenreIds: [9],
      }),
      2,
    );
  });

  it("falls back when current track lacks vibe fields", () => {
    assert.equal(
      neighborVibeTier({
        currentTempo: null,
        currentIntensity: 7,
        currentGenreIds: [1],
        candidateTempo: 6,
        candidateIntensity: 7,
        candidateGenreIds: [1],
      }),
      2,
    );
  });
});
