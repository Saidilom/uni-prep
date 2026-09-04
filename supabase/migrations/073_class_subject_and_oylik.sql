-- §6 и вторая половина §7 из design/FIX.md: предмет у группы, «Ойлик тест» и
-- закрытие мока по отдельной группе.
--
-- Замысел владельца: супер-админ загружает комплект из семи предметных тестов,
-- а ученику достаётся тест ПО ПРЕДМЕТУ ЕГО ГРУППЫ — для этого учитель при
-- создании группы указывает, что он преподаёт. Дальше учитель сам закрывает
-- мок своей группы, а если не закрыл, у супер-админа есть кнопка закрыть
-- отдельную группу или все сразу.
--
-- Новый тип теста НЕ вводится. Комплект публикуется как обычный 'class_only' —
-- у can_access_mock для него уже ровно нужная семантика «только назначенным», —
-- просто теперь его может создать и админ, если в payload пришёл oylikSetId.

-- ═══ Предмет группы ═══
--
-- Без DEFAULT и без NOT NULL: у существующих групп предмета нет, и выдумывать
-- его за учителя нельзя — он проставит сам. Форма создания группы требует
-- предмет на клиенте, так что новые группы приходят уже с ним.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS subject_id text;
CREATE INDEX IF NOT EXISTS idx_classes_subject_id ON public.classes(subject_id);

-- ═══ Комплекты «Ойлик тест» ═══
--
-- Жёсткого расписания нет (решение владельца): комплект грузится тогда, когда
-- нужно, хоть каждый день, хоть раз в месяц. Поэтому здесь нет ни периода, ни
-- месяца — только дата создания и дата публикации.
CREATE TABLE IF NOT EXISTS public.oylik_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE public.mock_tests ADD COLUMN IF NOT EXISTS oylik_set_id uuid REFERENCES public.oylik_sets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mock_tests_oylik_set_id ON public.mock_tests(oylik_set_id);

ALTER TABLE public.oylik_sets ENABLE ROW LEVEL SECURITY;

-- Комплекты — инструмент супер-админа. Учителю они не нужны: он видит уже
-- назначенные его группам тесты обычным путём.
DROP POLICY IF EXISTS oylik_sets_admin ON public.oylik_sets;
CREATE POLICY oylik_sets_admin ON public.oylik_sets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═══ Закрытие мока по отдельной группе ═══
--
-- mock_tests.closed_at (048) закрывает тест целиком — это и есть «закрыть все
-- сразу». Для «закрыть определённой группы» нужна отметка на самом назначении:
-- один и тот же предметный тест комплекта назначен многим группам, и одна может
-- закончить раньше другой.
ALTER TABLE public.mock_class_assignments ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Учитель закрывает назначение своей группы сам. Политика по образцу
-- mock_results_teacher (011): доступ строго через свои классы, а не ко всем
-- назначениям вообще.
DROP POLICY IF EXISTS mock_class_assignments_teacher_close ON public.mock_class_assignments;
CREATE POLICY mock_class_assignments_teacher_close ON public.mock_class_assignments
  FOR UPDATE USING (
    public.is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = mock_class_assignments.class_id AND c.teacher_id = auth.uid()::text
    )
  ) WITH CHECK (
    public.is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = mock_class_assignments.class_id AND c.teacher_id = auth.uid()::text
    )
  );

-- can_access_mock: к трём существующим воротам (статус, окно, closed_at)
-- добавляется четвёртое — закрытие конкретного назначения. Всё остальное
-- дословно как в 066, включая карве-аут «у кого уже есть результат — пускаем
-- всегда», чтобы сдавший мог открыть свой разбор.
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
              WHERE mca.mock_test_id = mt.id
                AND cm.student_id = auth.uid()::text
                -- Закрытое назначение больше не пускает в тест — но только
                -- новых: тот, у кого уже есть результат, прошёл выше по ветке
                -- «есть mock_results» и сюда не доходит.
                AND mca.closed_at IS NULL
            )
          )
        )
      )
  );
$$;

-- ═══ Публикация теста из комплекта ═══
--
-- publish_imported_mock выводил тип строго из роли: админ → paid/free, учитель
-- → class_only. Теперь у админа появился третий случай — тест комплекта. Всё
-- остальное поведение сохранено дословно.
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

-- ═══ Раздача комплекта по группам ═══
--
-- Каждый тест комплекта уходит тем группам, чей предмет совпадает с предметом
-- теста. Внутри RPC, а не в клиенте: назначений может быть сотня, и делать их
-- по одному запросу из браузера значит получить полураспределённый комплект
-- при первом же обрыве связи.
CREATE OR REPLACE FUNCTION public.publish_oylik_set(p_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_tests int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oylik_sets WHERE id = p_set_id) THEN
    RAISE EXCEPTION 'Oylik set not found';
  END IF;

  SELECT count(*) INTO v_tests FROM public.mock_tests WHERE oylik_set_id = p_set_id;
  IF v_tests = 0 THEN
    RAISE EXCEPTION 'Add at least one test to this set before publishing';
  END IF;

  -- ON CONFLICT, а не «проверить и вставить»: у mock_class_assignments есть
  -- UNIQUE (mock_test_id, class_id), и повторная публикация комплекта должна
  -- быть безобидной, а не падать на полпути.
  WITH inserted AS (
    INSERT INTO public.mock_class_assignments (id, mock_test_id, class_id)
    SELECT gen_random_uuid(), mt.id, c.id
    FROM public.mock_tests mt
    JOIN public.classes c ON c.subject_id IS NOT NULL AND c.subject_id = mt.subject_id
    WHERE mt.oylik_set_id = p_set_id
    ON CONFLICT (mock_test_id, class_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_assigned FROM inserted;

  UPDATE public.oylik_sets SET published_at = now() WHERE id = p_set_id;

  RETURN jsonb_build_object('testCount', v_tests, 'assignedCount', v_assigned);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_oylik_set(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_oylik_set(uuid) TO authenticated;

-- Закрыть мок сразу во всех группах — одной кнопкой у супер-админа, без
-- перебора назначений в клиенте.
CREATE OR REPLACE FUNCTION public.close_mock_for_all_classes(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int;
BEGIN
  IF NOT (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.mock_tests WHERE id = p_mock_test_id AND created_by = auth.uid()::text
  )) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.mock_class_assignments
  SET closed_at = now()
  WHERE mock_test_id = p_mock_test_id AND closed_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.mock_tests SET closed_at = now() WHERE id = p_mock_test_id AND closed_at IS NULL;

  RETURN jsonb_build_object('closedAssignments', v_closed);
END;
$$;

REVOKE ALL ON FUNCTION public.close_mock_for_all_classes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_mock_for_all_classes(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
