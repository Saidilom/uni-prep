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
  const sum = values.reduce((total, value) => total + value, 0);
  const diff = round2(target - sum);
  if (diff === 0) return values;
  const maxIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
  const result = [...values];
  result[maxIndex] = Math.max(0, round2(result[maxIndex] + diff));
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
