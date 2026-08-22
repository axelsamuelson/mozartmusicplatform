import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  playlistNeedsResyncForRating,
  ratingMatchesPlaylistFilters,
  type WamPlaylistFilters,
} from "../matchRating";
import type { RatingDetail } from "../../types/ratings";

const baseFilters: WamPlaylistFilters = {
  filter_genres: ["Rock"],
  filter_mood_levels: null,
  filter_moments: null,
  filter_min_score: 50,
  filter_vibes: null,
  filter_tempo_min: null,
  filter_tempo_max: null,
  filter_intensity_min: null,
  filter_intensity_max: null,
  filter_release_year_min: null,
  filter_release_year_max: null,
};

function rating(partial: Partial<RatingDetail> & Pick<RatingDetail, "score">): RatingDetail {
  return {
    id: "r1",
    spotify_id: "t1",
    comment: null,
    created_at: "",
    updated_at: "",
    tempo: null,
    intensity: null,
    genres: [{ id: 1, name: "Rock" }],
    mood: null,
    moments: [],
    item: {
      spotify_id: "t1",
      type: "track",
      name: "Song",
      artist_name: "A",
      image_url: null,
    },
    ...partial,
  };
}

describe("playlistNeedsResyncForRating", () => {
  it("resyncs when new rating matches", () => {
    assert.equal(
      playlistNeedsResyncForRating(rating({ score: 80 }), baseFilters),
      true,
    );
  });

  it("resyncs when only the previous rating matched (tag exit)", () => {
    const previous = rating({
      score: 80,
      genres: [{ id: 1, name: "Rock" }],
    });
    const next = rating({
      score: 80,
      genres: [{ id: 2, name: "Jazz" }],
    });
    assert.equal(ratingMatchesPlaylistFilters(next, baseFilters), false);
    assert.equal(
      playlistNeedsResyncForRating(next, baseFilters, previous),
      true,
    );
  });

  it("does not resync when neither side matches", () => {
    const previous = rating({
      score: 80,
      genres: [{ id: 2, name: "Jazz" }],
    });
    const next = rating({
      score: 80,
      genres: [{ id: 3, name: "Pop" }],
    });
    assert.equal(
      playlistNeedsResyncForRating(next, baseFilters, previous),
      false,
    );
  });

  it("resyncs when score drops below playlist minimum (previous matched)", () => {
    const previous = rating({ score: 80 });
    const next = rating({ score: 30 });
    const minScoreFilters: WamPlaylistFilters = {
      ...baseFilters,
      filter_genres: null,
    };
    assert.equal(ratingMatchesPlaylistFilters(next, minScoreFilters), false);
    assert.equal(
      playlistNeedsResyncForRating(next, minScoreFilters, previous),
      true,
    );
  });

  it("resyncs when tempo exits custom filter range", () => {
    const tempoFilters: WamPlaylistFilters = {
      ...baseFilters,
      filter_genres: null,
      filter_tempo_min: 7,
      filter_tempo_max: 10,
    };
    const previous = rating({ score: 80, tempo: 8, intensity: 5 });
    const next = rating({ score: 80, tempo: 3, intensity: 5 });
    assert.equal(ratingMatchesPlaylistFilters(next, tempoFilters), false);
    assert.equal(
      playlistNeedsResyncForRating(next, tempoFilters, previous),
      true,
    );
  });

  it("resyncs for delete when only previous rating matched", () => {
    const deleted = rating({ score: 80 });
    assert.equal(
      playlistNeedsResyncForRating(deleted, baseFilters, deleted),
      true,
    );
  });
});
