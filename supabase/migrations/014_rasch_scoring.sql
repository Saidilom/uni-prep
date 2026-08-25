-- Migration 014: Rasch scoring (Группа 7 из PLAN-REGISTAN-V3.md, задачи 36-38)
-- ============================================
-- rasch_score is its own column, completely separate from
-- mock_results.accuracy/score/correct_answers (the % shown to the
-- student) — never derived from or written into those columns, and never
-- read by the student-facing result screen. It's an internal ability
-- estimate (theta, in logits) for admin/teacher analysis, produced by a
-- dedicated calculation service (src/lib/rasch.ts + the
-- /api/rasch/recalculate route), NOT by submit_mock — item difficulty
-- calibration needs the full set of responses across everyone who has
-- taken the test, not just the person who just submitted, so the whole
-- test is recalibrated each time a new attempt comes in (fire-and-forget,
-- triggered client-side right after a successful submit_mock call).

ALTER TABLE public.mock_results ADD COLUMN IF NOT EXISTS rasch_score numeric;

CREATE TABLE IF NOT EXISTS public.mock_item_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  difficulty numeric NOT NULL,
  sample_size int NOT NULL DEFAULT 0,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mock_test_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_item_calibration_test ON public.mock_item_calibration(mock_test_id);

ALTER TABLE public.mock_item_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_item_calibration_admin ON public.mock_item_calibration
  FOR ALL USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
