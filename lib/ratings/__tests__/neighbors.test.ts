import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isRatingNeighborDirection,
  neighborItemFromCache,
  parseRatingNeighborRows,
} from "../neighbors";

describe("parseRatingNeighborRows", () => {
  it("parses valid below/above rows", () => {
    const rows = parseRatingNeighborRows([
      { direction: "below", track_id: "a", score: 71 },
      { direction: "above", track_id: "b", score: 73 },
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      direction: "below",
      track_id: "a",
      score: 71,
    });
    assert.deepEqual(rows[1], {
      direction: "above",
      track_id: "b",
      score: 73,
    });
  });

  it("drops invalid rows", () => {
    const rows = parseRatingNeighborRows([
      { direction: "sideways", track_id: "a", score: 1 },
      { direction: "below", track_id: "", score: 1 },
      null,
      { direction: "above", track_id: "b", score: "x" },
    ]);
    assert.equal(rows.length, 0);
  });
});

describe("isRatingNeighborDirection", () => {
  it("accepts below and above only", () => {
    assert.equal(isRatingNeighborDirection("below"), true);
    assert.equal(isRatingNeighborDirection("above"), true);
    assert.equal(isRatingNeighborDirection("same"), false);
  });
});

describe("neighborItemFromCache", () => {
  it("falls back to Unknown track when name missing", () => {
    const item = neighborItemFromCache("id1", 50, null);
    assert.equal(item.name, "Unknown track");
    assert.equal(item.score, 50);
    assert.equal(item.track_id, "id1");
  });
});
