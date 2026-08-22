import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { replaceRatingTags } from "../replaceRatingTags";

type InsertCall = { table: string; rows: unknown[] };

function mockSupabase(config: {
  prevGenres?: { genre_tag_id: number }[];
  prevMoments?: { moment_tag_id: number }[];
  genreInsertError?: string;
  momentInsertError?: string;
  deleteGenreError?: string;
}) {
  const inserts: InsertCall[] = [];

  const from = (table: string) => ({
    select: (_cols: string) => ({
      eq: (_col: string, _val: string) =>
        Promise.resolve({
          data:
            table === "rating_genres"
              ? (config.prevGenres ?? [])
              : (config.prevMoments ?? []),
          error: null,
        }),
    }),
    delete: () => ({
      eq: (_col: string, _val: string) =>
        Promise.resolve({
          error:
            table === "rating_genres" && config.deleteGenreError
              ? { message: config.deleteGenreError }
              : null,
        }),
    }),
    insert: (rows: unknown[] | Record<string, unknown>) => {
      const list = Array.isArray(rows) ? rows : [rows];
      inserts.push({ table, rows: list });
      if (table === "rating_genres" && config.genreInsertError) {
        return Promise.resolve({ error: { message: config.genreInsertError } });
      }
      if (table === "rating_moments" && config.momentInsertError) {
        return Promise.resolve({ error: { message: config.momentInsertError } });
      }
      return Promise.resolve({ error: null });
    },
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    inserts,
  };
}

describe("replaceRatingTags", () => {
  it("replaces tags on success", async () => {
    const { supabase, inserts } = mockSupabase({
      prevGenres: [{ genre_tag_id: 1 }],
      prevMoments: [{ moment_tag_id: 10 }],
    });

    const result = await replaceRatingTags(supabase, "rating-1", [2, 3], [20]);

    assert.equal(result.error, null);
    const genreInserts = inserts.filter((c) => c.table === "rating_genres");
    const momentInserts = inserts.filter((c) => c.table === "rating_moments");
    assert.equal(genreInserts.length, 1);
    assert.equal(momentInserts.length, 1);
    assert.deepEqual(
      genreInserts[0]?.rows,
      [
        { rating_id: "rating-1", genre_tag_id: 2 },
        { rating_id: "rating-1", genre_tag_id: 3 },
      ],
    );
  });

  it("restores previous genres when new genre insert fails", async () => {
    const { supabase, inserts } = mockSupabase({
      prevGenres: [{ genre_tag_id: 1 }, { genre_tag_id: 2 }],
      prevMoments: [],
      genreInsertError: "insert failed",
    });

    const result = await replaceRatingTags(supabase, "rating-1", [99], []);

    assert.equal(result.error, "insert failed");
    const genreInserts = inserts.filter((c) => c.table === "rating_genres");
    assert.equal(genreInserts.length, 2);
    assert.deepEqual(genreInserts[1]?.rows, [
      { rating_id: "rating-1", genre_tag_id: 1 },
      { rating_id: "rating-1", genre_tag_id: 2 },
    ]);
  });

  it("restores previous moments when new moment insert fails", async () => {
    const { supabase, inserts } = mockSupabase({
      prevGenres: [],
      prevMoments: [{ moment_tag_id: 5 }],
      momentInsertError: "moment insert failed",
    });

    const result = await replaceRatingTags(supabase, "rating-1", [], [88]);

    assert.equal(result.error, "moment insert failed");
    const momentInserts = inserts.filter((c) => c.table === "rating_moments");
    assert.equal(momentInserts.length, 2);
    assert.deepEqual(momentInserts[1]?.rows, [
      { rating_id: "rating-1", moment_tag_id: 5 },
    ]);
  });

  it("returns delete error without attempting insert", async () => {
    const { supabase, inserts } = mockSupabase({
      deleteGenreError: "delete blocked",
    });

    const result = await replaceRatingTags(supabase, "rating-1", [1], [2]);

    assert.equal(result.error, "delete blocked");
    assert.equal(inserts.length, 0);
  });
});
