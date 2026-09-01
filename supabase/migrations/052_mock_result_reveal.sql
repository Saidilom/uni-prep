-- Difficulty-weighted point redistribution (see PLAN discussion in this
-- session): a mock's per-question points are no longer final the moment a
-- student submits. For any paid mock, or any free mock taken via a class/
-- group assignment, the result is held back (revealed_at IS NULL) until the
-- teacher/admin explicitly finalizes the whole cohort via
-- finalize_mock_group_results (053_finalize_mock_group_results.sql), which
-- reweights points by how the group actually performed and bakes the final
-- score in permanently. Only a free mock taken individually (no class
-- involved) still reveals its score immediately, same as before.

ALTER TABLE public.mock_results ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

-- Every result that already exists predates this feature entirely — it was
-- already shown to its student, so it must not retroactively disappear.
UPDATE public.mock_results SET revealed_at = completed_at WHERE revealed_at IS NULL;

CREATE OR REPLACE FUNCTION public.submit_mock(
  p_mock_test_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
  v_section record;
  v_question record;
  v_result_id uuid;
  v_score numeric := 0;
  v_max_score numeric := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_answers jsonb := '[]'::jsonb;
  v_section_scores jsonb := '{}'::jsonb;
  v_section_score numeric;
  v_section_total int;
  v_selected jsonb;
  v_selected_text text;
  v_is_correct boolean;
  v_points numeric;
  v_max_points numeric;
  v_manual boolean;
  v_has_pending_review boolean;
  v_via_class boolean;
  v_revealed_at timestamptz;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND OR NOT public.can_access_mock(p_mock_test_id) THEN
    RAISE EXCEPTION 'No access to this mock test';
  END IF;

  v_via_class := EXISTS (
    SELECT 1 FROM public.mock_class_assignments mca
    JOIN public.class_members cm ON cm.class_id = mca.class_id
    WHERE mca.mock_test_id = p_mock_test_id AND cm.student_id = auth.uid()::text
  );
  IF v_mock_test.price > 0 OR v_via_class THEN
    v_revealed_at := NULL;
  ELSE
    v_revealed_at := now();
  END IF;

  FOR v_section IN
    SELECT * FROM public.mock_sections WHERE mock_test_id = p_mock_test_id ORDER BY "order"
  LOOP
    v_section_score := 0;
    v_section_total := 0;

    FOR v_question IN
      SELECT * FROM public.mock_questions WHERE section_id = v_section.id ORDER BY "order"
    LOOP
      v_total := v_total + 1;
      v_section_total := v_section_total + 1;
      v_max_points := GREATEST(0, COALESCE(v_question.points, 1));
      v_max_score := v_max_score + v_max_points;
      v_selected := COALESCE(p_answers->v_question.id::text, 'null'::jsonb);
      v_selected_text := COALESCE(v_selected #>> '{}', v_selected::text, '');
      v_manual := v_question.requires_manual_review OR v_question.question_type = 'essay';

      IF v_manual THEN
        v_is_correct := false;
      ELSIF v_question.question_type = 'multiple_choice' THEN
        v_is_correct := public.normalize_option_set(v_selected) = public.normalize_option_set(v_question.answer_key->'values');
      ELSIF v_question.question_type IN ('short_text', 'number', 'numeric', 'math_expression') THEN
        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_question.accepted_answers, '[]'::jsonb)) AS accepted(value)
          WHERE lower(regexp_replace(trim(accepted.value), '\s+', '', 'g')) =
                lower(regexp_replace(trim(v_selected_text), '\s+', '', 'g'))
        ) INTO v_is_correct;
      ELSE
        v_is_correct := lower(v_selected_text) = lower(COALESCE(
          v_question.answer_key->'values'->>0,
          v_question.answer_key->>'value',
          v_question.correct_answer
        ));
      END IF;

      v_points := CASE WHEN v_is_correct THEN v_max_points ELSE 0 END;
      IF v_is_correct THEN
        v_correct := v_correct + 1;
        v_score := v_score + v_points;
        v_section_score := v_section_score + v_points;
      END IF;

      v_answers := v_answers || jsonb_build_object(
        'questionId', v_question.id,
        'sectionId', v_section.id,
        'selectedAnswer', v_selected,
        'isCorrect', v_is_correct,
        'pointsEarned', v_points,
        'reviewStatus', CASE WHEN v_manual THEN 'pending' ELSE 'auto_graded' END
      );
    END LOOP;

    v_section_scores := v_section_scores || jsonb_build_object(
      v_section.id,
      jsonb_build_object('title', v_section.title, 'score', v_section_score, 'total', v_section_total)
    );
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO public.mock_results (
    id, user_id, mock_test_id, mock_test_title, score, max_score, total_questions, correct_answers,
    accuracy, section_scores, time_spent_seconds, completed_at, revealed_at
  ) VALUES (
    gen_random_uuid(), auth.uid()::text, p_mock_test_id, v_mock_test.title, v_score, v_max_score,
    v_total, v_correct, v_percentage, v_section_scores, GREATEST(0, p_time_spent_seconds), now(), v_revealed_at
  ) RETURNING id INTO v_result_id;

  FOR v_question IN
    SELECT q.* FROM public.mock_questions q
    JOIN public.mock_sections s ON s.id = q.section_id
    WHERE s.mock_test_id = p_mock_test_id
  LOOP
    v_selected := COALESCE(p_answers->v_question.id::text, 'null'::jsonb);
    v_selected_text := COALESCE(v_selected #>> '{}', v_selected::text, '');
    v_manual := v_question.requires_manual_review OR v_question.question_type = 'essay';
    IF v_manual THEN
      v_is_correct := false;
    ELSIF v_question.question_type = 'multiple_choice' THEN
      v_is_correct := public.normalize_option_set(v_selected) = public.normalize_option_set(v_question.answer_key->'values');
    ELSIF v_question.question_type IN ('short_text', 'number', 'numeric', 'math_expression') THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_question.accepted_answers, '[]'::jsonb)) AS accepted(value)
        WHERE lower(regexp_replace(trim(accepted.value), '\s+', '', 'g')) =
              lower(regexp_replace(trim(v_selected_text), '\s+', '', 'g'))
      ) INTO v_is_correct;
    ELSE
      v_is_correct := lower(v_selected_text) = lower(COALESCE(v_question.answer_key->'values'->>0, v_question.answer_key->>'value', v_question.correct_answer));
    END IF;
    v_points := CASE WHEN v_is_correct THEN COALESCE(v_question.points, 1) ELSE 0 END;

    INSERT INTO public.mock_answer_details (
      id, result_id, question_id, question_text, selected_answer, correct_answer,
      is_correct, points_earned, selected_response, answer_key_json, review_status
    ) VALUES (
      gen_random_uuid(), v_result_id, v_question.id, v_question.text, v_selected_text,
      COALESCE(v_question.answer_key::text, ''), v_is_correct, v_points, v_selected,
      v_question.answer_key, CASE WHEN v_manual THEN 'pending' ELSE 'auto_graded' END
    );
  END LOOP;

  v_has_pending_review := EXISTS (
    SELECT 1 FROM public.mock_answer_details mad
    WHERE mad.result_id = v_result_id AND mad.review_status = 'pending'
  );

  IF v_revealed_at IS NULL THEN
    RETURN jsonb_build_object(
      'resultId', v_result_id,
      'resultsPending', true,
      'resultsPublishAt', v_mock_test.results_publish_at,
      'hasPendingReview', v_has_pending_review
    );
  END IF;

  RETURN jsonb_build_object(
    'resultId', v_result_id, 'score', v_score, 'maxScore', v_max_score, 'total', v_total,
    'percentage', v_percentage, 'sectionScores', v_section_scores, 'answers', v_answers,
    'hasPendingReview', v_has_pending_review
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
