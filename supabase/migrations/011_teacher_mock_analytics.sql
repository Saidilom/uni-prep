-- Migration 011: Teacher Results / Analytics (Группа 3 из PLAN-REGISTAN-V3.md)
-- ============================================
-- Two gaps found while building this:
--
-- 1. submit_mock() (migration 003) computes a per-question answer array
--    (questionId/selectedAnswer/isCorrect/pointsEarned) but only ever
--    RETURNs it to the caller — nothing persists it. mock_results only
--    stores the summary (score/total/accuracy). A teacher opening a
--    student's attempt later has nothing to read. This adds
--    mock_answer_details (mirrors placement_answer_details' shape, but
--    also stores correct_answer + question_text so a teacher can see the
--    full breakdown without a fresh RPC call — mock_questions itself has
--    no general SELECT policy, by design, to keep correct answers from
--    leaking to students on retakes).
--
-- 2. public.mock_results has policies for the owning student
--    (mock_results_student) and admin (mock_results_admin, fixed in
--    migration 009) but NONE for teachers — a teacher session reading
--    mock_results (e.g. the "X/Y прошли" count already shown on
--    /classes/[id]) gets zero rows back, RLS-filtered to nothing. Adding
--    a scoped teacher policy: only for mock_results whose mock_test_id is
--    assigned (mock_class_assignments) to a class the teacher owns AND
--    the result's student is actually a member of that same class — not
--    a blanket "teacher sees all their students' results everywhere".

CREATE TABLE IF NOT EXISTS public.mock_answer_details (
  id uuid PRIMARY KEY,
  result_id uuid NOT NULL REFERENCES public.mock_results(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  question_text text NOT NULL,
  selected_answer text NOT NULL DEFAULT '',
  correct_answer text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  points_earned int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mock_answer_details_result_id ON public.mock_answer_details(result_id);

ALTER TABLE public.mock_answer_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY mock_answer_details_student ON public.mock_answer_details
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.mock_results r WHERE r.id = result_id AND r.user_id = auth.uid()::text)
  );

CREATE POLICY mock_answer_details_teacher ON public.mock_answer_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.mock_results r
      JOIN public.mock_class_assignments mca ON mca.mock_test_id = r.mock_test_id
      JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
      JOIN public.class_members cm ON cm.class_id = mca.class_id AND cm.student_id = r.user_id
      WHERE r.id = result_id
    )
  );

CREATE POLICY mock_answer_details_admin ON public.mock_answer_details
  FOR ALL USING (public.is_admin());

CREATE POLICY mock_results_teacher ON public.mock_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.mock_class_assignments mca
      JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
      JOIN public.class_members cm ON cm.class_id = mca.class_id AND cm.student_id = mock_results.user_id
      WHERE mca.mock_test_id = mock_results.mock_test_id
    )
  );

-- Re-declare submit_mock to also persist mock_answer_details (identical
-- scoring logic to migration 003, plus the insert loop at the end).
CREATE OR REPLACE FUNCTION public.submit_mock(
  p_mock_test_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mock_test record;
  v_section record;
  v_question record;
  v_result_id uuid;
  v_score int := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_answers jsonb := '[]'::jsonb;
  v_section_scores jsonb := '{}'::jsonb;
  v_section_score int;
  v_section_total int;
  v_user_name text;
  v_user_surname text;
  v_selected text;
  v_is_correct boolean;
  v_points int;
BEGIN
  SELECT * INTO v_mock_test FROM mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mock_access
    WHERE user_id = auth.uid()::text AND mock_test_id = p_mock_test_id
  ) THEN
    RAISE EXCEPTION 'No access to this mock test';
  END IF;

  SELECT name, surname INTO v_user_name, v_user_surname FROM users WHERE id = auth.uid()::text;

  FOR v_section IN
    SELECT * FROM mock_sections WHERE mock_test_id = p_mock_test_id ORDER BY "order"
  LOOP
    v_section_score := 0;
    v_section_total := 0;

    FOR v_question IN
      SELECT * FROM mock_questions WHERE section_id = v_section.id ORDER BY "order"
    LOOP
      v_total := v_total + 1;
      v_section_total := v_section_total + 1;
      IF p_answers->>v_question.id::text = v_question.correct_answer THEN
        v_correct := v_correct + 1;
        v_score := v_score + COALESCE(v_question.points, 1);
        v_section_score := v_section_score + COALESCE(v_question.points, 1);
      END IF;

      v_answers := v_answers || jsonb_build_object(
        'questionId', v_question.id,
        'sectionId', v_section.id,
        'selectedAnswer', COALESCE(p_answers->>v_question.id::text, ''),
        'isCorrect', (p_answers->>v_question.id::text = v_question.correct_answer),
        'pointsEarned', CASE WHEN p_answers->>v_question.id::text = v_question.correct_answer THEN COALESCE(v_question.points, 1) ELSE 0 END
      );
    END LOOP;

    v_section_scores := v_section_scores || jsonb_build_object(
      v_section.id,
      jsonb_build_object(
        'title', v_section.title,
        'score', v_section_score,
        'total', v_section_total
      )
    );
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO mock_results (
    id, user_id, mock_test_id, mock_test_title, score, total_questions, correct_answers,
    accuracy, section_scores, time_spent_seconds, completed_at
  ) VALUES (
    gen_random_uuid(),
    auth.uid()::text,
    p_mock_test_id,
    v_mock_test.title,
    v_score,
    v_total,
    v_correct,
    v_percentage,
    v_section_scores,
    p_time_spent_seconds,
    now()
  ) RETURNING id INTO v_result_id;

  FOR v_section IN
    SELECT * FROM mock_sections WHERE mock_test_id = p_mock_test_id ORDER BY "order"
  LOOP
    FOR v_question IN
      SELECT * FROM mock_questions WHERE section_id = v_section.id ORDER BY "order"
    LOOP
      v_selected := COALESCE(p_answers->>v_question.id::text, '');
      v_is_correct := (v_selected = v_question.correct_answer);
      v_points := CASE WHEN v_is_correct THEN COALESCE(v_question.points, 1) ELSE 0 END;

      INSERT INTO mock_answer_details (
        id, result_id, question_id, question_text, selected_answer, correct_answer, is_correct, points_earned
      ) VALUES (
        gen_random_uuid(), v_result_id, v_question.id, v_question.text, v_selected, v_question.correct_answer, v_is_correct, v_points
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'resultId', v_result_id,
    'score', v_score,
    'total', v_total,
    'percentage', v_percentage,
    'sectionScores', v_section_scores,
    'answers', v_answers
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
