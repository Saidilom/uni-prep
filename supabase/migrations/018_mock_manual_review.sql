-- Migration 018: manual review for writing/extended Mock responses.

ALTER TABLE public.mock_answer_details
  ADD COLUMN IF NOT EXISTS max_points int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_feedback text,
  ADD COLUMN IF NOT EXISTS reviewed_by text REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE public.mock_answer_details mad
SET max_points = GREATEST(0, COALESCE(q.points, 1))
FROM public.mock_questions q
WHERE q.id = mad.question_id;

CREATE OR REPLACE FUNCTION public.set_mock_answer_max_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT GREATEST(0, COALESCE(points, 1)) INTO NEW.max_points
  FROM public.mock_questions WHERE id = NEW.question_id;
  NEW.max_points := COALESCE(NEW.max_points, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_mock_answer_max_points_trg ON public.mock_answer_details;
CREATE TRIGGER set_mock_answer_max_points_trg
  BEFORE INSERT ON public.mock_answer_details
  FOR EACH ROW EXECUTE FUNCTION public.set_mock_answer_max_points();

DROP POLICY IF EXISTS mock_answer_details_teacher ON public.mock_answer_details;
CREATE POLICY mock_answer_details_teacher ON public.mock_answer_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.mock_results r
      JOIN public.mock_tests mt ON mt.id = r.mock_test_id AND mt.created_by = auth.uid()::text
      WHERE r.id = result_id
        AND (
          EXISTS (
            SELECT 1 FROM public.mock_student_assignments msa
            WHERE msa.mock_test_id = r.mock_test_id AND msa.student_id = r.user_id AND msa.assigned_by = auth.uid()::text
          )
          OR EXISTS (
            SELECT 1
            FROM public.mock_class_assignments mca
            JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
            JOIN public.class_members cm ON cm.class_id = c.id AND cm.student_id = r.user_id
            WHERE mca.mock_test_id = r.mock_test_id
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.review_mock_response(
  p_detail_id uuid,
  p_points int,
  p_feedback text DEFAULT ''
)
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
  v_score int;
  v_max_score int;
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
  IF v_detail.review_status <> 'pending' THEN RAISE EXCEPTION 'Response is not pending review'; END IF;
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
  v_accuracy := CASE WHEN v_max_score > 0 THEN round(v_score::numeric / v_max_score * 100) ELSE 0 END;

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

REVOKE ALL ON FUNCTION public.review_mock_response(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_mock_response(uuid, int, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

