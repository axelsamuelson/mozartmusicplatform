import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOptionalScale1to10 } from "../parseScale";

describe("parseOptionalScale1to10", () => {
  it("treats undefined as omit", () => {
    assert.equal(parseOptionalScale1to10(undefined, "tempo"), undefined);
  });

  it("treats null as clear", () => {
    assert.equal(parseOptionalScale1to10(null, "tempo"), null);
  });

  it("accepts integers 1–10", () => {
    assert.equal(parseOptionalScale1to10(1, "tempo"), 1);
    assert.equal(parseOptionalScale1to10(10, "intensity"), 10);
  });

  it("rejects out of range and non-integers", () => {
    assert.throws(() => parseOptionalScale1to10(0, "tempo"));
    assert.throws(() => parseOptionalScale1to10(11, "tempo"));
    assert.throws(() => parseOptionalScale1to10(5.5, "tempo"));
    assert.throws(() => parseOptionalScale1to10("5", "tempo"));
  });
});
