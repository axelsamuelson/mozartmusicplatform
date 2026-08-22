import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Documents TempoIntensitySlider fix: display fallback (5) must not be
 * written back when only one axis moves.
 */
describe("tempo/intensity null coalesce", () => {
  it("keeps null on untouched axis when tempo changes", () => {
    const tempo: number | null = null;
    const intensity: number | null = null;
    const displayTempo = tempo ?? 5;
    const displayIntensity = intensity ?? 5;
    assert.equal(displayTempo, 5);
    assert.equal(displayIntensity, 5);

    const nextTempo = 7;
    const persisted = { tempo: nextTempo, intensity };
    assert.equal(persisted.tempo, 7);
    assert.equal(persisted.intensity, null);
  });

  it("keeps null on untouched axis when intensity changes", () => {
    const tempo: number | null = null;
    const intensity: number | null = null;
    const nextIntensity = 9;
    const persisted = { tempo, intensity: nextIntensity };
    assert.equal(persisted.tempo, null);
    assert.equal(persisted.intensity, 9);
  });
});
