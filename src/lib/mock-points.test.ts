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
});
