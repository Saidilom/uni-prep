-- 107. Рисунок задания как отдельная картинка.
--
-- ═══ ЧТО БЫЛО ═══
--
-- Отдельного рисунка не существовало. Задание с needsSourceImage получало
-- ссылку на ВЕСЬ исходный PDF, и на экране открывался просмотрщик файла
-- целиком. Ученик видел не свой рисунок, а страницу — на странице 9
-- математики их четыре, от заданий 40a, 40b, 41a и 41b, — и мог листать
-- остальные листы теста прямо во время экзамена.
--
-- ═══ ЧТО СТАЛО ═══
--
-- Модель возвращает рамку рисунка (figureBox), импорт вырезает её из PDF в
-- PNG и кладёт в хранилище, а в задание приезжает ссылка. Функция публикации
-- ниже её сохраняет.
--
-- Тело publish_imported_mock не переписано: взято действующее определение и
-- добавлены ровно две строки — колонка image_url и её значение. Так правка
-- видна целиком и не может незаметно изменить что-то ещё.

-- ═══ Хранилище рисунков ═══
--
-- Отдельное от test-imports и ПУБЛИЧНОЕ. Публичное осознанно: картинку надо
-- отдать ученику на экзамене, а через подписанные ссылки пришлось бы гонять
-- каждый показ через свой роут.
--
-- Утечки это не добавляет, наоборот. Сейчас ученику отдаётся подписанная
-- ссылка на ВЕСЬ файл теста, и по ней видно все задания разом. Здесь по
-- ссылке видно один рисунок, а путь содержит uuid импорта и не угадывается.
-- Ответов в рисунке нет: это график или схема из условия.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('question-figures', 'question-figures', true, 5242880, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png'];

-- Читают все (bucket публичный), пишет только service-role из импорта —
-- отдельной INSERT-политики нет ни для одной роли, как у audit_log.
DROP POLICY IF EXISTS question_figures_public_read ON storage.objects;
CREATE POLICY question_figures_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'question-figures');

CREATE OR REPLACE FUNCTION public.publish_imported_mock(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_oylik_set_id uuid;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid()::text;
  IF v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Комплект — только админский путь: у учителя его тесты и так class_only.
  v_oylik_set_id := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'oylikSetId', '')::uuid ELSE NULL END;
  IF v_oylik_set_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.oylik_sets WHERE id = v_oylik_set_id) THEN
    RAISE EXCEPTION 'Oylik set not found';
  END IF;

  v_is_free := COALESCE((p_payload->>'isFree')::boolean, false);
  v_type := CASE
              WHEN v_role <> 'admin' THEN 'class_only'
              WHEN v_oylik_set_id IS NOT NULL THEN 'class_only'
              WHEN v_is_free THEN 'free'
              ELSE 'paid'
            END;
  v_price := CASE
               WHEN v_role = 'admin' AND v_oylik_set_id IS NULL AND NOT v_is_free
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
    starts_at, ends_at, results_publish_at, source_pdf_paths, oylik_set_id
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
    v_source_pdf_paths,
    v_oylik_set_id
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
        source_file_index, group_key, requires_manual_review, image_url
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
        COALESCE((v_question->>'requiresManualReview')::boolean, false),
        -- Вырезанный рисунок задания. Кладёт его импорт (см. pdf-figure-crop.ts),
        -- сюда приезжает готовая ссылка. Пусто у заданий без рисунка и у тех,
        -- где модель не назвала рамку, — тогда экран показывает старый разворот
        -- страницы, а не пустую картинку.
        NULLIF(v_question->>'imageUrl', '')
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
$function$
;

NOTIFY pgrst, 'reload schema';
