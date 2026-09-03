-- Админский бесплатный Mock: переключатель «платный/бесплатный» при создании.
--
-- До этой миграции `price` управлял тремя разными вещами одновременно, поэтому
-- «сделать тест бесплатным» = поставить price 0 = молча отобрать у теста ровно
-- ту логику, ради которой его создают:
--   1. can_access_mock (048): `mt.price = 0` ОТКЛЮЧАЕТ окно проведения —
--      starts_at/ends_at перестают действовать, тест открыт всегда.
--   2. submit_mock (052): `price > 0` — единственная причина, по которой
--      результат админского мока держится скрытым до finalize_mock_group_results.
--      При цене 0 ученик увидит баллы сразу после сдачи, и writing/эссе никто
--      не успеет проверить.
--   3. publish_imported_mock (047): type и price выводились ТОЛЬКО из роли
--      (admin → 'paid', teacher → 'class_only') и при admin с ценой ≤ 0
--      бросалось исключение — создать бесплатный админский мок было нельзя.
--
-- Решение: развязать «платность» от рабочего процесса. Признаком «держать
-- результаты» становится type, признаком «применять окно» — наличие
-- starts_at/ends_at, а не цена.
--
-- Итоговая семантика:
--   paid       — админский, нужна оплата (mock_access), результаты до «Готово»
--   free       — админский, без оплаты, виден ЛЮБОМУ авторизованному ученику
--                (без флага «Ученик Registan» и без назначения в класс),
--                окно по starts_at/ends_at если заданы, результаты до «Готово»
--   class_only — учительский, только назначенным; через класс — до «Готово»,
--                индивидуально — сразу (как было)
--
-- Проверено на живой БД перед миграцией: строк с type='free' нет ни одной
-- (значение никем не писалось, только DEFAULT колонки), а у всех
-- существующих class_only тестов starts_at IS NULL — поэтому удаление клаузы
-- `mt.price = 0` из окна доступа не меняет поведение ни одной существующей
-- строки. CHECK-констрейнтов на mock_tests.type/.price нет, ALTER не нужен.

-- 1. publish_imported_mock: админ выбирает тип теста через p_payload->>'isFree'.
--    Учитель по-прежнему получает class_only / price 0 / расписание NULL,
--    что бы он ни прислал в payload.
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
  v_is_free boolean;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_results_publish_at timestamptz;
  v_source_pdf_paths jsonb;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid()::text;
  IF v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_is_free := COALESCE((p_payload->>'isFree')::boolean, false);
  v_type := CASE
              WHEN v_role <> 'admin' THEN 'class_only'
              WHEN v_is_free THEN 'free'
              ELSE 'paid'
            END;
  v_price := CASE
               WHEN v_role = 'admin' AND NOT v_is_free
               THEN GREATEST(0, COALESCE((p_payload->>'price')::int, 0))
               ELSE 0
             END;
  IF v_type = 'paid' AND v_price <= 0 THEN
    RAISE EXCEPTION 'Paid mock price must be greater than zero';
  END IF;

  v_starts_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'startsAt', '')::timestamptz ELSE NULL END;
  v_ends_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'endsAt', '')::timestamptz ELSE NULL END;
  v_results_publish_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'resultsPublishAt', '')::timestamptz ELSE NULL END;

  IF v_starts_at IS NOT NULL AND v_ends_at IS NULL THEN
    RAISE EXCEPTION 'End time is required when a start time is set';
  END IF;
  IF v_ends_at IS NOT NULL AND v_starts_at IS NULL THEN
    RAISE EXCEPTION 'Start time is required when an end time is set';
  END IF;
  IF v_starts_at IS NOT NULL AND v_ends_at IS NOT NULL AND v_ends_at <= v_starts_at THEN
    RAISE EXCEPTION 'End time must be after the start time';
  END IF;
  IF v_starts_at IS NOT NULL AND v_results_publish_at IS NOT NULL AND v_results_publish_at < v_starts_at THEN
    RAISE EXCEPTION 'Results publish date must not be before the start date';
  END IF;

  v_source_pdf_paths := COALESCE(p_payload->'sourcePdfPaths', '[]'::jsonb);

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at,
    starts_at, ends_at, results_publish_at, source_pdf_paths
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
    COALESCE(p_payload->>'sourcePdfPath', v_source_pdf_paths->>0),
    COALESCE(p_payload->'importMetadata', '{}'::jsonb),
    now(),
    v_starts_at,
    v_ends_at,
    v_results_publish_at,
    v_source_pdf_paths
  );

  FOR v_section IN SELECT value FROM jsonb_array_elements(p_payload->'sections') LOOP
    v_section_id := gen_random_uuid();
    INSERT INTO public.mock_sections (id, mock_test_id, title, "order", kind)
    VALUES (
      v_section_id,
      v_test_id,
      COALESCE(NULLIF(trim(v_section->>'title'), ''), 'Раздел'),
      COALESCE((v_section->>'order')::int, 0),
      CASE WHEN v_section->>'kind' IN ('general', 'reading', 'listening', 'writing') THEN v_section->>'kind' ELSE 'general' END
    );

    FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
      v_options := '{}'::jsonb;
      FOR v_option IN SELECT value FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) LOOP
        v_options := v_options || jsonb_build_object(lower(v_option->>'id'), v_option->>'text');
      END LOOP;

      INSERT INTO public.mock_questions (
        id, section_id, text, options, correct_answer, points, "order",
        question_type, content, answer_key, accepted_answers, source_page,
        source_file_index, group_key, requires_manual_review
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
        COALESCE((v_question->>'sourceFileIndex')::int, 0),
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

-- 2. can_access_mock: окно проведения больше не зависит от цены (действует
--    всегда, когда starts_at/ends_at заданы), а бесплатный админский мок
--    (type='free') открыт любому авторизованному ученику — без флага
--    isRegistanStudent и без назначения в класс.
CREATE OR REPLACE FUNCTION public.can_access_mock(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mock_tests mt
    WHERE mt.id = p_mock_test_id
      AND (
        public.is_admin()
        OR mt.created_by = auth.uid()::text
        OR (
          mt.status = 'published'
          AND (
            EXISTS (
              SELECT 1 FROM public.mock_results mr
              WHERE mr.mock_test_id = mt.id AND mr.user_id = auth.uid()::text
            )
            OR (
              mt.closed_at IS NULL
              AND (
                mt.starts_at IS NULL
                OR mt.ends_at IS NULL
                OR (
                  now() >= mt.starts_at
                  AND now() <= mt.ends_at + interval '5 minutes'
                )
              )
            )
          )
          AND (
            EXISTS (
              SELECT 1 FROM public.mock_access ma
              WHERE ma.mock_test_id = mt.id AND ma.user_id = auth.uid()::text
            )
            OR mt.type = 'free'
            OR EXISTS (
              SELECT 1 FROM public.mock_student_assignments msa
              WHERE msa.mock_test_id = mt.id AND msa.student_id = auth.uid()::text
            )
            OR EXISTS (
              SELECT 1
              FROM public.mock_class_assignments mca
              JOIN public.class_members cm ON cm.class_id = mca.class_id
              WHERE mca.mock_test_id = mt.id AND cm.student_id = auth.uid()::text
            )
          )
        )
      )
  );
$$;

-- 3. submit_mock: результаты держатся скрытыми для любого АДМИНСКОГО мока
--    (paid и free) и для класс-назначенного учительского. Мгновенно
--    раскрывается только индивидуально назначенный учительский мок — как было.
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
  IF v_mock_test.type IN ('paid', 'free') OR v_via_class THEN
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
