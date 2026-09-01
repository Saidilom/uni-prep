// Generic post-Mock level, shown for every subject/mock (free or paid) —
// unlike src/lib/english-cefr.ts (which implements one specific government
// document for the English National Certificate), this has no official
// source: it's this platform's own A+..C scale, computed the same
// cohort-relative way (Rasch ability standardized to the same 0-75 scale
// via raschThetaToT — see src/lib/rasch.ts) so it stays comparable across
// subjects and mocks despite differing question counts/difficulty.
export type GradeLevel = "A+" | "A" | "B+" | "B" | "C+" | "C";

export function gradeLevelFromScore(score: number): GradeLevel | null {
  if (score >= 70) return "A+";
  if (score >= 65) return "A";
  if (score >= 60) return "B+";
  if (score >= 55) return "B";
  if (score >= 50) return "C+";
  if (score >= 46) return "C";
  return null;
}
