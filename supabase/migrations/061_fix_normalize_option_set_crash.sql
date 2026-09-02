-- Critical bug fix: normalize_option_set (021_fix_mock_grading_case_mismatch.sql)
-- crashes with "cannot extract elements from a scalar" whenever a
-- multiple_choice question is left unanswered. submit_mock computes
-- `v_selected := COALESCE(p_answers->question_id, 'null'::jsonb)` for a
-- skipped question — that's the JSON *null literal* (a jsonb scalar), not
-- SQL NULL, so `COALESCE(p_value, '[]'::jsonb)` inside this function never
-- catches it, and jsonb_array_elements_text('null'::jsonb) raises a hard
-- Postgres error. Confirmed live: submitting a real mock with an unanswered
-- multiple_choice question aborts submit_mock entirely — no mock_results
-- row is written, the student's submission fails outright. Reachable in
-- ordinary use: the exam UI allows finishing with blank questions (just a
-- confirm() warning), and the scheduled auto-submit at ends_at sends
-- whatever was answered so far, blank questions included.
CREATE OR REPLACE FUNCTION public.normalize_option_set(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(lower(value) ORDER BY lower(value)), ARRAY[]::text[])
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE '[]'::jsonb END
  ) AS value;
$$;

NOTIFY pgrst, 'reload schema';
