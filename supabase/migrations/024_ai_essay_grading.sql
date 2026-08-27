-- Migration 024: AI grading for writing/essay tasks
-- Writing tasks (English/Russian/Uzbek) previously sat in review_status =
-- 'pending' forever unless a teacher opened the class results page and
-- entered a score by hand — most teachers never did, so students never saw
-- a final score for a whole section of the exam. Gemini now grades these
-- immediately after submit_mock using the same official rubric knowledge
-- already used at import time (see essay-grading-prompt.ts), through this
-- new function. A teacher can still override the AI score afterwards
-- exactly like a pending one — review_mock_response now also accepts
-- review_status = 'ai_graded' as its starting state.

CREATE OR REPLACE FUNCTION public.ai_grade_mock_response(p_detail_id uuid, p_points numeric, p_feedback text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detail record;
  v_score numeric;
  v_max_score numeric;
  v_correct int;
  v_accuracy int;
BEGIN
  SELECT mad.*, r.user_id
  INTO v_detail
  FROM public.mock_answer_details mad
  JOIN public.mock_results r ON r.id = mad.result_id
  WHERE mad.id = p_detail_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;

  -- Only the student who owns this result may trigger AI grading of their
  -- own just-submitted answer — this runs from the student's own session
  -- right after submit_mock, it is not a teacher action.
  IF v_detail.user_id <> auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_detail.review_status <> 'pending' THEN RAISE EXCEPTION 'Response is not pending review'; END IF;
  IF p_points < 0 OR p_points > v_detail.max_points THEN RAISE EXCEPTION 'Points out of range'; END IF;

  UPDATE public.mock_answer_details
  SET points_earned = p_points,
      is_correct = (p_points = max_points AND max_points > 0),
      review_status = 'ai_graded',
      review_feedback = NULLIF(trim(p_feedback), ''),
      reviewed_at = now()
  WHERE id = p_detail_id;

  SELECT COALESCE(sum(points_earned), 0), COALESCE(sum(max_points), 0), count(*) FILTER (WHERE is_correct)
  INTO v_score, v_max_score, v_correct
  FROM public.mock_answer_details WHERE result_id = v_detail.result_id;
  v_accuracy := CASE WHEN v_max_score > 0 THEN round(v_score / v_max_score * 100) ELSE 0 END;

  UPDATE public.mock_results
  SET score = v_score, correct_answers = v_correct, accuracy = v_accuracy
  WHERE id = v_detail.result_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'mock_response_ai_graded',
    'mock_answer_detail',
    p_detail_id::text,
    jsonb_build_object('resultId', v_detail.result_id, 'points', p_points, 'maxPoints', v_detail.max_points)
  );

  RETURN jsonb_build_object('score', v_score, 'maxScore', v_max_score, 'accuracy', v_accuracy);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_grade_mock_response(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_grade_mock_response(uuid, numeric, text) TO authenticated;

-- A teacher can still correct an AI-assigned score exactly like a pending
-- one — the only change from the previous version is the allowed starting
-- review_status.
CREATE OR REPLACE FUNCTION public.review_mock_response(p_detail_id uuid, p_points numeric, p_feedback text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detail record;
  v_result record;
  v_is_admin boolean := public.is_admin();
  v_allowed boolean := false;
  v_score numeric;
  v_max_score numeric;
  v_correct int;
  v_accuracy int;
BEGIN
  SELECT mad.*, r.mock_test_id, r.user_id
  INTO v_detail
  FROM public.mock_answer_details mad
  JOIN public.mock_results r ON r.id = mad.result_id
  WHERE mad.id = p_detail_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;

  IF v_is_admin THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = v_detail.mock_test_id AND mt.created_by = auth.uid()::text
        AND (
          EXISTS (
            SELECT 1 FROM public.mock_student_assignments msa
            WHERE msa.mock_test_id = mt.id AND msa.student_id = v_detail.user_id AND msa.assigned_by = auth.uid()::text
          )
          OR EXISTS (
            SELECT 1 FROM public.mock_class_assignments mca
            JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
            JOIN public.class_members cm ON cm.class_id = c.id AND cm.student_id = v_detail.user_id
            WHERE mca.mock_test_id = mt.id
          )
        )
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_detail.review_status NOT IN ('pending', 'ai_graded') THEN RAISE EXCEPTION 'Response is not pending review'; END IF;
  IF p_points < 0 OR p_points > v_detail.max_points THEN RAISE EXCEPTION 'Points out of range'; END IF;

  UPDATE public.mock_answer_details
  SET points_earned = p_points,
      is_correct = (p_points = max_points AND max_points > 0),
      review_status = 'reviewed',
      review_feedback = NULLIF(trim(p_feedback), ''),
      reviewed_by = auth.uid()::text,
      reviewed_at = now()
  WHERE id = p_detail_id;

  SELECT COALESCE(sum(points_earned), 0), COALESCE(sum(max_points), 0), count(*) FILTER (WHERE is_correct)
  INTO v_score, v_max_score, v_correct
  FROM public.mock_answer_details WHERE result_id = v_detail.result_id;
  v_accuracy := CASE WHEN v_max_score > 0 THEN round(v_score / v_max_score * 100) ELSE 0 END;

  UPDATE public.mock_results
  SET score = v_score, correct_answers = v_correct, accuracy = v_accuracy
  WHERE id = v_detail.result_id
  RETURNING * INTO v_result;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'mock_response_reviewed',
    'mock_answer_detail',
    p_detail_id::text,
    jsonb_build_object('resultId', v_detail.result_id, 'points', p_points, 'maxPoints', v_detail.max_points)
  );

  RETURN jsonb_build_object('score', v_score, 'maxScore', v_max_score, 'accuracy', v_accuracy);
END;
$$;

REVOKE ALL ON FUNCTION public.review_mock_response(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_mock_response(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
