-- Migration 034: generic post-Mock level (A+/A/B+/B/C+/C, or none below 46)
-- for every subject, not just English's official CEFR (cefr_score/cefr_band
-- stay untouched — separate, document-grounded scale). level_score is the
-- same theta->0-75 Z-standardization already used for CEFR, but run against
-- the whole mock's already-computed rasch_score (person ability) instead of
-- a separate per-section Rasch run, and computed for every subject by
-- /api/rasch/recalculate (which already runs after every Mock submission).

ALTER TABLE public.mock_results
  ADD COLUMN IF NOT EXISTS level_score numeric,
  ADD COLUMN IF NOT EXISTS grade_level text;

NOTIFY pgrst, 'reload schema';
