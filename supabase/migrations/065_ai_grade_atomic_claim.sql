-- Bug fix: ai_grade_mock_response's only guard against being invoked twice
-- for the same detail was a read-then-write check (SELECT review_status,
-- then a plain UPDATE with no matching WHERE condition) — not atomic. The
-- client fires this fire-and-forget with a .catch(() => undefined)
-- (src/app/mock/[id]/page.tsx), so a retry while the first call is still in
-- flight could have both calls pass the check and both write, silently
-- letting whichever finishes last win with no error. Folding
-- review_status = 'pending' into the UPDATE's own WHERE clause makes the
-- claim atomic — only one concurrent call can ever match and update the
-- row; the loser sees ROW_COUNT = 0 and raises the same error it always did.
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
  v_claimed int;
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
  IF p_points < 0 OR p_points > v_detail.max_points THEN RAISE EXCEPTION 'Points out of range'; END IF;

  UPDATE public.mock_answer_details
  SET points_earned = p_points,
      is_correct = (p_points = max_points AND max_points > 0),
      review_status = 'ai_graded',
      review_feedback = NULLIF(trim(p_feedback), ''),
      reviewed_at = now()
  WHERE id = p_detail_id AND review_status = 'pending';

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN RAISE EXCEPTION 'Response is not pending review'; END IF;

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

NOTIFY pgrst, 'reload schema';
