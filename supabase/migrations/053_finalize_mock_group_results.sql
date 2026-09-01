-- Reweights a mock test's questions by how the whole still-hidden cohort
-- actually performed (harder questions — lower average earned ratio — get
-- more of the fixed 75-point pool, easier ones get less), bakes the result
-- into every currently-hidden mock_results/mock_answer_details row for this
-- test, and reveals them all at once. This is a product-designed heuristic
-- inspired by item difficulty, NOT the official Rasch/BBA method — see the
-- plan discussion this migration implements. mock_questions.points (the
-- original admin/teacher-set baseline) is deliberately left untouched, so a
-- later cohort of the same test (another class, or a late payer) starts
-- from the original weights, not from whatever a previous cohort's
-- performance produced.
CREATE OR REPLACE FUNCTION public.finalize_mock_group_results(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
  v_revealed_count int;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  IF NOT (v_mock_test.created_by = auth.uid()::text OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to finalize this mock test';
  END IF;
  IF v_mock_test.closed_at IS NULL THEN
    RAISE EXCEPTION 'Close the mock to new entries before finalizing results';
  END IF;
  IF v_mock_test.results_publish_at IS NOT NULL AND now() < v_mock_test.results_publish_at THEN
    RAISE EXCEPTION 'Cannot finalize before the announced results date';
  END IF;

  DROP TABLE IF EXISTS tmp_question_weights;
  CREATE TEMP TABLE tmp_question_weights ON COMMIT DROP AS
  SELECT
    mad.question_id,
    AVG(mad.points_earned / NULLIF(mad.max_points, 0)) AS avg_ratio
  FROM public.mock_answer_details mad
  JOIN public.mock_results mr ON mr.id = mad.result_id
  WHERE mr.mock_test_id = p_mock_test_id AND mr.revealed_at IS NULL
  GROUP BY mad.question_id;

  IF NOT EXISTS (SELECT 1 FROM tmp_question_weights) THEN
    RETURN jsonb_build_object('revealedCount', 0);
  END IF;

  ALTER TABLE tmp_question_weights ADD COLUMN error_share numeric;
  -- Floor of 0.05 so a question everyone nailed still carries some weight
  -- instead of being reweighted to zero.
  UPDATE tmp_question_weights SET error_share = GREATEST(1 - COALESCE(avg_ratio, 0), 0.05);

  ALTER TABLE tmp_question_weights ADD COLUMN new_points numeric;
  UPDATE tmp_question_weights t
  SET new_points = ROUND(75 * t.error_share / s.total_share, 2)
  FROM (SELECT SUM(error_share) AS total_share FROM tmp_question_weights) s;

  -- Per-item rounding drifts the sum off 75.00 by a few cents — dump the
  -- remainder onto the single hardest (highest-weight) question.
  UPDATE tmp_question_weights
  SET new_points = new_points + (75 - (SELECT SUM(new_points) FROM tmp_question_weights))
  WHERE question_id = (SELECT question_id FROM tmp_question_weights ORDER BY new_points DESC LIMIT 1);

  UPDATE public.mock_answer_details mad
  SET points_earned = ROUND((mad.points_earned / NULLIF(mad.max_points, 0)) * t.new_points, 2),
      max_points = t.new_points
  FROM tmp_question_weights t, public.mock_results mr
  WHERE mad.question_id = t.question_id
    AND mr.id = mad.result_id
    AND mr.mock_test_id = p_mock_test_id
    AND mr.revealed_at IS NULL;

  UPDATE public.mock_results mr
  SET score = sub.total_score,
      max_score = 75,
      revealed_at = now()
  FROM (
    SELECT result_id, SUM(points_earned) AS total_score
    FROM public.mock_answer_details
    WHERE result_id IN (SELECT id FROM public.mock_results WHERE mock_test_id = p_mock_test_id AND revealed_at IS NULL)
    GROUP BY result_id
  ) sub
  WHERE mr.id = sub.result_id;

  GET DIAGNOSTICS v_revealed_count = ROW_COUNT;

  RETURN jsonb_build_object('revealedCount', v_revealed_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_mock_group_results(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
