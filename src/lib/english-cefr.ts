// Official English National Certificate scoring
// (tests-pdf/англ/Multilevel-bm.pdf, Bilimni baholash agentligi,
// 2023-03-16) — pure math only, no I/O. The orchestration (fetching
// responses, running Rasch, writing results back) lives in
// /api/mock-tests/[id]/cefr-recalculate. raschThetaToT/mean/stdev moved to
// src/lib/rasch.ts (generic, reused by src/lib/mock-grade-level.ts too) —
// re-exported here so existing importers of this module keep working.
export { raschThetaToT, mean, stdev } from "./rasch";

// Writing: Task 1 (raw 0-10) and Task 2 (raw 0-20) both scale by the same
// x1.2 factor into a combined 0-36 raw sum (10*1.2=12, 20*1.2=24 — matches
// the document's stated 33%/67% split, 12+24=36), which this table then
// converts to the final 0-75 Writing score. Transcribed verbatim from the
// printed table — note some bins are 1.0-wide (27.1-28.0, 28.1-29.0,
// 29.1-30.0, 33.1-34.0, 34.1-35.0, 35.1-36.0) while the rest are 0.5-wide;
// this is not a rounding artifact, it's how the original table is printed.
const WRITING_RAW36_TO_SCORE75: Array<readonly [number, number]> = [
  [0.5, 10], [1.0, 11], [1.5, 12], [2.0, 13], [2.5, 14], [3.0, 15], [3.5, 16], [4.0, 17], [4.5, 18], [5.0, 19],
  [5.5, 20], [6.0, 21], [6.5, 22], [7.0, 23], [7.5, 24], [8.0, 25], [8.5, 26], [9.0, 27], [9.5, 28], [10.0, 29],
  [10.5, 30], [11.0, 31], [11.5, 32], [12.0, 33], [12.5, 34], [13.0, 35], [13.5, 36], [14.0, 37], [14.5, 38], [15.0, 39],
  [15.5, 40], [16.0, 41], [16.5, 42], [17.0, 43], [17.5, 44], [18.0, 45], [18.5, 46], [19.0, 47], [19.5, 48], [20.0, 49],
  [20.5, 50], [21.0, 51], [21.5, 52], [22.0, 53], [22.5, 54], [23.0, 55], [23.5, 56], [24.0, 57], [24.5, 58], [25.0, 59],
  [25.5, 60], [26.0, 61], [26.5, 62], [27.0, 63], [28.0, 64], [29.0, 65], [30.0, 66],
  [30.5, 67], [31.0, 68], [31.5, 69], [32.0, 70], [32.5, 71], [33.0, 72], [34.0, 73], [35.0, 74], [36.0, 75],
];

export function writingRawToScore(raw36: number): number {
  const clamped = Math.max(0, Math.min(36, raw36));
  if (clamped <= 0) return 0;
  for (const [threshold, score] of WRITING_RAW36_TO_SCORE75) {
    if (clamped <= threshold) return score;
  }
  return 75;
}

// Task1 (max 10) and Task2 (max 20) both scale by the same x1.2 factor, so
// this just needs the sum of raw rubric points actually earned across the
// test's writing questions — see writingRawToScore's comment for why 1.2.
export function writingPointsToScore(earnedPoints: number): number {
  return writingRawToScore(earnedPoints * 1.2);
}

export type CefrBand = "C1" | "B2" | "B1" | "<B1";

export function cefrBandFromScore(avgScore: number): CefrBand {
  if (avgScore >= 65) return "C1";
  if (avgScore >= 51) return "B2";
  if (avgScore >= 38) return "B1";
  return "<B1";
}
