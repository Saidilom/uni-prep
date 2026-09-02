import { describe, expect, it } from "vitest";
import { normalizePointsTo75, sumPoints } from "./mock-points";

describe("normalizePointsTo75", () => {
  it("returns an empty array unchanged", () => {
    expect(normalizePointsTo75([])).toEqual([]);
  });

  it("splits evenly when every input is zero", () => {
    const result = normalizePointsTo75([0, 0, 0]);
    expect(sumPoints(result)).toBe(75);
    expect(result).toEqual([25, 25, 25]);
  });

  it("preserves relative weight while summing to exactly 75", () => {
    const result = normalizePointsTo75([1, 1, 2]);
    expect(sumPoints(result)).toBe(75);
    expect(result[2]).toBeGreaterThan(result[0]);
  });

  it("sums to exactly 75 for a question count that doesn't divide evenly", () => {
    const points = Array(37).fill(1);
    const result = normalizePointsTo75(points);
    expect(sumPoints(result)).toBe(75);
  });

  it("leaves an already-normalized set unchanged", () => {
    const result = normalizePointsTo75([25, 25, 25]);
    expect(result).toEqual([25, 25, 25]);
  });

  it("handles fractional starting weights", () => {
    const result = normalizePointsTo75([2.2, 1, 1]);
    expect(sumPoints(result)).toBe(75);
  });

  it("sums to exactly 75 for a large near-uniform draft without zeroing a question", () => {
    // Regression: dumping the whole rounding-drift correction onto a
    // single item used to clamp it to 0 and silently discard whatever
    // didn't fit, undershooting 75 — this needs many equal-weight items
    // for the per-item rounding drift to add up to more than one item's
    // own share (reproduced at n=200, drift was -1.00 vs a 0.38 share).
    const points = Array(200).fill(1);
    const result = normalizePointsTo75(points);
    expect(sumPoints(result)).toBe(75);
  });

  it("never produces a negative point value while fixing the remainder", () => {
    for (const n of [126, 150, 180, 200, 250]) {
      const result = normalizePointsTo75(Array(n).fill(1));
      expect(sumPoints(result)).toBe(75);
      expect(result.every((value) => value >= 0)).toBe(true);
    }
  });
});
