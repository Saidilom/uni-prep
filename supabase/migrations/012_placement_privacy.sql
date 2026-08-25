-- Migration 012: Diagnostic (Placement) privacy — Группа 4 из PLAN-REGISTAN-V3.md
-- ============================================
-- Decision (see "Решения" at the top of PLAN-REGISTAN-V3.md): the student
-- sees only the final percentage after Placement. No per-question
-- breakdown is shown to anyone — not the student, not the teacher — and
-- none of it is persisted. It's a one-time calculation: compute the %,
-- discard the detail.
--
-- submit_placement() previously built a full per-question answers array
-- (questionId/questionText/selectedAnswer/isCorrect/pointsEarned) and
-- wrote it straight into placement_results.answers (jsonb), then returned
-- it to the caller too — the frontend used that to power a "Подробности
-- ответов" modal. This migration removes both: the RPC now only counts
-- correct/total to compute the score, doesn't build or store the detail
-- array, and returns correctAnswers directly instead of making the caller
-- derive it by filtering the (now-removed) answers array.

CREATE OR REPLACE FUNCTION public.submit_placement(
  p_assignment_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment record;
  v_question record;
  v_result_id uuid;
  v_score int := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_user_name text;
  v_user_surname text;
  v_user_phone text;
  v_test_title text;
BEGIN
  SELECT * INTO v_assignment FROM placement_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_assignment.user_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_assignment.status = 'completed' THEN
    RAISE EXCEPTION 'Assignment already completed';
  END IF;

  SELECT name, surname, phone INTO v_user_name, v_user_surname, v_user_phone
  FROM users WHERE id = v_assignment.user_id;

  SELECT title INTO v_test_title FROM placement_tests WHERE id = v_assignment.test_id;

  FOR v_question IN
    SELECT * FROM placement_questions WHERE test_id = v_assignment.test_id ORDER BY "order"
  LOOP
    v_total := v_total + 1;
    IF p_answers->>v_question.id::text = v_question.correct_answer THEN
      v_correct := v_correct + 1;
      v_score := v_score + COALESCE(v_question.points, 1);
    END IF;
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO placement_results (
    id, assignment_id, user_id, test_id, test_title, user_name, user_surname, user_phone,
    score, total_questions, correct_answers, accuracy, time_spent_seconds, completed_at
  ) VALUES (
    gen_random_uuid(),
    p_assignment_id,
    v_assignment.user_id,
    v_assignment.test_id,
    v_test_title,
    v_user_name,
    v_user_surname,
    v_user_phone,
    v_score,
    v_total,
    v_correct,
    v_percentage,
    p_time_spent_seconds,
    now()
  ) RETURNING id INTO v_result_id;

  UPDATE placement_assignments SET status = 'completed', completed_at = now() WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'resultId', v_result_id,
    'score', v_score,
    'total', v_total,
    'percentage', v_percentage,
    'correctAnswers', v_correct
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
