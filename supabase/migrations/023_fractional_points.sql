-- Migration 023: Fractional points (official exams use decimal weights)
-- ============================================
-- Real National Certificate exams print fractional per-question weights —
-- confirmed on a Geography sample paper: "[1,3 ball]", "[2,2 ball]",
-- "[3,2 ball]" (Uzbek decimal comma) on different questions in the SAME
-- test. The official English/Russian/Uzbek writing-rubric conversion tables
-- (added last migration) are fractional too: 0.6, 1.3, 1.9, 2.5 ... 10.0 for
-- English Task 1, so a teacher manually grading an essay per that table
-- needs to enter e.g. 8.8, not round to 9.
--
-- Before this migration, points/max_points/points_earned/score were all
-- `integer`. Two concrete hard-failure points, not just precision loss:
--   1. ImportedQuestionSchema.points was z.number().int() — Gemini
--      returning the printed 2.2 would fail schema validation and abort
--      the whole import with "Gemini вернул JSON не по схеме: points —
--      Invalid input", before publish is ever attempted.
--   2. publish_imported_mock did `(v_question->>'points')::int` — a direct
--      text-to-integer cast. Postgres raises 22P02 "invalid input syntax
--      for type integer" for non-integer-looking text (verified directly:
--      '2.2'::int errors, '2.2'::numeric does not) — this would have
--      crashed the publish transaction outright, not just rounded.
--
-- PostgREST serializes `numeric` columns as bare JSON numbers in this
-- project (verified against the already-numeric mock_results.rasch_score
-- column), so no string-coercion handling is needed on the client side —
-- existing TS code that already treats numeric columns as `number` keeps
-- working unchanged.

ALTER TABLE public.mock_questions
  ALTER COLUMN points TYPE numeric USING points::numeric;

ALTER TABLE public.mock_answer_details
  ALTER COLUMN max_points TYPE numeric USING max_points::numeric,
  ALTER COLUMN points_earned TYPE numeric USING points_earned::numeric;

ALTER TABLE public.mock_results
  ALTER COLUMN score TYPE numeric USING score::numeric;

-- publish_imported_mock: numeric cast instead of a direct-to-int cast that
-- crashes on any non-integer text.
CREATE OR REPLACE FUNCTION public.publish_imported_mock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_test_id uuid := gen_random_uuid();
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_section_id uuid;
  v_options jsonb;
  v_type text;
  v_price int;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid()::text;
  IF v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_type := CASE WHEN v_role = 'admin' THEN 'paid' ELSE 'class_only' END;
  v_price := CASE WHEN v_role = 'admin' THEN GREATEST(0, COALESCE((p_payload->>'price')::int, 0)) ELSE 0 END;
  IF v_role = 'admin' AND v_price <= 0 THEN
    RAISE EXCEPTION 'Paid mock price must be greater than zero';
  END IF;

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at
  ) VALUES (
    v_test_id,
    NULLIF(trim(p_payload->>'title'), ''),
    COALESCE(p_payload->>'description', ''),
    v_type,
    v_price,
    GREATEST(1, COALESCE((p_payload->>'durationMinutes')::int, 60)),
    p_payload->>'subject',
    p_payload->>'language',
    auth.uid()::text,
    'published',
    p_payload->>'sourcePdfPath',
    COALESCE(p_payload->'importMetadata', '{}'::jsonb),
    now()
  );

  FOR v_section IN SELECT value FROM jsonb_array_elements(p_payload->'sections') LOOP
    v_section_id := gen_random_uuid();
    INSERT INTO public.mock_sections (id, mock_test_id, title, "order")
    VALUES (
      v_section_id,
      v_test_id,
      COALESCE(NULLIF(trim(v_section->>'title'), ''), 'Раздел'),
      COALESCE((v_section->>'order')::int, 0)
    );

    FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
      v_options := '{}'::jsonb;
      FOR v_option IN SELECT value FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) LOOP
        v_options := v_options || jsonb_build_object(lower(v_option->>'id'), v_option->>'text');
      END LOOP;

      INSERT INTO public.mock_questions (
        id, section_id, text, options, correct_answer, points, "order",
        question_type, content, answer_key, accepted_answers, source_page,
        group_key, requires_manual_review
      ) VALUES (
        gen_random_uuid(),
        v_section_id,
        COALESCE(v_question->>'prompt', ''),
        v_options,
        COALESCE(lower(v_question->'correctOptionIds'->>0), v_question->'acceptedAnswers'->>0, ''),
        GREATEST(0, COALESCE((v_question->>'points')::numeric, 1)),
        COALESCE((v_question->>'order')::int, 0),
        COALESCE(v_question->>'type', 'single_choice'),
        jsonb_build_object(
          'number', COALESCE(v_question->>'number', ''),
          'sharedStimulus', v_question->'sharedStimulus',
          'needsSourceImage', COALESCE((v_question->>'needsSourceImage')::boolean, false),
          'confidence', COALESCE((v_question->>'confidence')::numeric, 0),
          'reviewNote', v_question->'reviewNote',
          'rubricNote', v_question->'rubricNote'
        ),
        jsonb_build_object(
          'values', COALESCE(
            (SELECT jsonb_agg(lower(value)) FROM jsonb_array_elements_text(COALESCE(v_question->'correctOptionIds', '[]'::jsonb)) AS value),
            '[]'::jsonb
          ),
          'accepted', COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)
        ),
        COALESCE(v_question->'acceptedAnswers', '[]'::jsonb),
        NULLIF(v_question->>'sourcePage', '')::int,
        NULLIF(v_question->>'groupKey', ''),
        COALESCE((v_question->>'requiresManualReview')::boolean, false)
      );
    END LOOP;
  END LOOP;

  IF p_payload->>'importId' IS NOT NULL THEN
    UPDATE public.mock_imports
    SET status = 'published', updated_at = now()
    WHERE id = (p_payload->>'importId')::uuid AND created_by = auth.uid()::text;
  END IF;

  RETURN v_test_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_imported_mock(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_imported_mock(jsonb) TO authenticated;

-- submit_mock: v_score/v_points now numeric so a fractional question weight
-- (or a previously-reviewed fractional essay score) sums correctly instead
-- of silently truncating.
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
  v_manual boolean;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND OR NOT public.can_access_mock(p_mock_test_id) THEN
    RAISE EXCEPTION 'No access to this mock test';
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

      v_points := CASE WHEN v_is_correct THEN COALESCE(v_question.points, 1) ELSE 0 END;
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
    id, user_id, mock_test_id, mock_test_title, score, total_questions, correct_answers,
    accuracy, section_scores, time_spent_seconds, completed_at
  ) VALUES (
    gen_random_uuid(), auth.uid()::text, p_mock_test_id, v_mock_test.title, v_score,
    v_total, v_correct, v_percentage, v_section_scores, GREATEST(0, p_time_spent_seconds), now()
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

  RETURN jsonb_build_object(
    'resultId', v_result_id, 'score', v_score, 'total', v_total,
    'percentage', v_percentage, 'sectionScores', v_section_scores, 'answers', v_answers,
    'hasPendingReview', EXISTS (
      SELECT 1 FROM public.mock_answer_details mad
      WHERE mad.result_id = v_result_id AND mad.review_status = 'pending'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_mock(uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mock(uuid, jsonb, int) TO authenticated;

-- review_mock_response: p_points now numeric so a teacher can enter the
-- exact official conversion-table score (e.g. 8.8) for a manually-graded
-- essay instead of being forced to round. Changing a parameter's type
-- creates a new overload rather than replacing the old one, so the
-- previous (uuid, integer, text) signature is dropped explicitly first.
DROP FUNCTION IF EXISTS public.review_mock_response(uuid, integer, text);

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
