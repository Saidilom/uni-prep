// A mock test's total points must always sum to exactly 75 (product
// decision — every mock, paid or free, scores on the same 75-point scale
// regardless of how many questions it has or what an admin/teacher typed
// per question). This proportionally rescales whatever points are already
// on the draft so their relative weight is preserved, then fixes the
// leftover rounding cent on the largest question so the sum is exact —
// naive per-item rounding alone drifts to 74.99/75.01 on real question counts.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fixRemainder(values: number[], target: number): number[] {
  if (values.length === 0) return values;
  const result = [...values];
  let diff = round2(target - result.reduce((sum, value) => sum + value, 0));
  if (diff === 0) return result;

  // A negative drift grows with item count on near-uniform weights (each
  // item rounds up by a fraction of a cent, and that compounds) — dumping
  // the whole thing onto a single item and clamping at 0 silently drops
  // whatever didn't fit instead of applying it, breaking the "always sums
  // to exactly `target`" guarantee. Spread it across items largest-first,
  // taking as much as each can give without going below 0, until the
  // correction is fully absorbed. A positive drift never has this problem
  // (there's no upper clamp), so it's applied to the single largest item.
  const order = result.map((_, index) => index).sort((a, b) => result[b] - result[a]);
  for (const index of order) {
    if (diff === 0) break;
    if (diff > 0) {
      result[index] = round2(result[index] + diff);
      diff = 0;
    } else {
      const take = Math.min(result[index], -diff);
      result[index] = round2(result[index] - take);
      diff = round2(diff + take);
    }
  }
  return result;
}

export const MOCK_TOTAL_POINTS = 75;

export function normalizePointsTo75(points: number[]): number[] {
  if (points.length === 0) return [];
  const total = points.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const even = round2(MOCK_TOTAL_POINTS / points.length);
    return fixRemainder(points.map(() => even), MOCK_TOTAL_POINTS);
  }
  const scaled = points.map((value) => round2((value / total) * MOCK_TOTAL_POINTS));
  return fixRemainder(scaled, MOCK_TOTAL_POINTS);
}

export function sumPoints(points: number[]): number {
  return round2(points.reduce((sum, value) => sum + value, 0));
}
