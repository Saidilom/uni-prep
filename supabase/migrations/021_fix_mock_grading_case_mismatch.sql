-- Migration 021: Fix mock grading — option-id case mismatch
-- ============================================
-- Root cause (found via near-zero real scores on live-tested imported mocks):
-- publish_imported_mock lowercases option keys when building mock_questions.options
-- (`lower(v_option->>'id')`), but never lowercased the correct-answer side
-- (`correctOptionIds` -> mock_questions.correct_answer / answer_key.values).
-- Gemini commonly returns correctOptionIds as printed on the exam ("A"/"B"/"C"/"D"),
-- so a student could only ever click a lowercase option id (that's the only
-- thing rendered), while the stored correct answer was "B" — an exact-string
-- comparison in submit_mock made single_choice/true_false/matching/multiple_choice
-- questions fail even when the student picked the right option. Verified against
-- prod data: mock_questions.options had {"a":..,"b":..}, correct_answer was "B".
--
-- Fixed on both ends:
-- 1. submit_mock: case-insensitive comparison (both the summary loop and the
--    mock_answer_details loop carry a full copy of this logic — both patched).
-- 2. publish_imported_mock: lowercase correctOptionIds at publish time too, so
--    future imports store consistent casing rather than relying solely on the
--    grading function to paper over it.
-- Neither touches acceptedAnswers (free-text answers for short_text/numeric/etc,
-- already compared case-insensitively via the existing regexp branch — those
-- are real text, not option ids, so must not be lowercased on write).
--
-- Not backfilling already-submitted mock_results — the only rows in prod so
-- far are the developer's own QA runs on the one test class, not real student
-- attempts; they should just retake the test to confirm the fix.

CREATE OR REPLACE FUNCTION public.normalize_option_set(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(lower(value) ORDER BY lower(value)), ARRAY[]::text[])
  FROM jsonb_array_elements_text(COALESCE(p_value, '[]'::jsonb)) AS value;
$$;

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
  v_score int := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_answers jsonb := '[]'::jsonb;
  v_section_scores jsonb := '{}'::jsonb;
  v_section_score int;
  v_section_total int;
  v_selected jsonb;
  v_selected_text text;
  v_is_correct boolean;
  v_points int;
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
        -- correctOptionIds are option ids and must match the lowercased keys
        -- above — Gemini/manual entry commonly gives "A"/"B" as printed.
        COALESCE(lower(v_question->'correctOptionIds'->>0), v_question->'acceptedAnswers'->>0, ''),
        GREATEST(0, COALESCE((v_question->>'points')::int, 1)),
        COALESCE((v_question->>'order')::int, 0),
        COALESCE(v_question->>'type', 'single_choice'),
        jsonb_build_object(
          'number', COALESCE(v_question->>'number', ''),
          'sharedStimulus', v_question->'sharedStimulus',
          'needsSourceImage', COALESCE((v_question->>'needsSourceImage')::boolean, false),
          'confidence', COALESCE((v_question->>'confidence')::numeric, 0),
          'reviewNote', v_question->'reviewNote'
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

-- Repair already-published (but not-yet-retaken) questions in place so
-- existing tests grade correctly too, not just newly published ones.
UPDATE public.mock_questions
SET
  correct_answer = lower(correct_answer),
  answer_key = jsonb_set(
    answer_key,
    '{values}',
    COALESCE(
      (SELECT jsonb_agg(lower(value)) FROM jsonb_array_elements_text(COALESCE(answer_key->'values', '[]'::jsonb)) AS value),
      '[]'::jsonb
    )
  )
WHERE correct_answer <> lower(correct_answer)
   OR answer_key->'values' <> (
        SELECT COALESCE(jsonb_agg(lower(value)), '[]'::jsonb)
        FROM jsonb_array_elements_text(COALESCE(answer_key->'values', '[]'::jsonb)) AS value
      );

NOTIFY pgrst, 'reload schema';
