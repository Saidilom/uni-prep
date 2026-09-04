-- Две связанные правки из design/FIX.md: §15 (авто-анализ) и §3/§4 (одна шкала
-- баллов вместо двух). Они в одной миграции, потому что обе переписывают
-- finalize_mock_group_results — делать это двумя миграциями подряд значит
-- писать один и тот же текст функции дважды и рисковать тем, что версии
-- разъедутся.
--
-- ═══ §3/§4. Перевзвешивание по сложности убирается ═══
--
-- В проекте жили ДВЕ независимые шкалы «из 75», и ученик видел рядом обе:
--   1. score/max_score — сырая сумма баллов за вопросы, принудительно
--      подогнанная под 75 (normalizePointsTo75 при публикации + вот это
--      перевзвешивание при закрытии). Шапка 053 честно называет это
--      «product-designed heuristic inspired by item difficulty, NOT the
--      official Rasch/BBA method».
--   2. level_score — Rasch-способность θ, Z-стандартизованная по когорте
--      (raschThetaToT), из неё же выводится буква A+..C (миграция 034). Это и
--      есть механика Агентства знаний: логиты → шкала 0–75 → уровень.
--
-- По решению владельца остаётся вторая. Сложность вопроса модель Раша учитывает
-- сама, поэтому эвристическое перевзвешивание — дублирование, которое к тому же
-- вырождается на малых группах (см. арифметику в шапке 069). Функция теперь
-- всегда идёт по той ветке, которая раньше была «для когорты меньше 10»:
-- score = сумма заработанного, max_score = сумма возможного, accuracy и
-- correct_answers — из тех же строк, поэтому противоречить друг другу не могут.
--
-- ═══ §15. Авто-анализ ═══
--
-- Публикация результатов была строго ручной: «Закрыть» → «Готово». Теперь то же
-- самое умеет запускаться само — когда сдал последний назначенный ученик или
-- когда прошло ends_at. Вызывающая сторона (роуты /api/mock-tests/[id]/
-- auto-finalize и /api/cron/auto-finalize) работает под service_role, а
-- finalize_mock_group_results проверяет auth.uid() и из-под service_role не
-- проходит — отсюда отдельная _system-версия.
--
-- auto_finalized_at — не журнал, а замок: два автоматических пути могут
-- совпасть по времени (последний ученик сдал ровно на границе ends_at), и без
-- захвата оба прогонят проверку эссе и пересчёт. Ручную кнопку замок не
-- трогает — она по-прежнему работает всегда.

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS auto_finalized_at timestamptz;

-- Сама работа, без единой проверки прав: и ручной, и системный путь делают
-- ровно одно и то же, различаются только тем, кому позволено их звать.
-- Идемпотентна по построению — берёт только строки с revealed_at IS NULL,
-- поэтому повторный вызов вернёт revealedCount = 0 и ничего не испортит.
CREATE OR REPLACE FUNCTION public.reveal_mock_results_internal(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revealed_count int;
  v_cohort_size int;
BEGIN
  SELECT count(*) INTO v_cohort_size
  FROM public.mock_results
  WHERE mock_test_id = p_mock_test_id AND revealed_at IS NULL;

  IF v_cohort_size = 0 THEN
    RETURN jsonb_build_object('revealedCount', 0, 'cohortSize', 0);
  END IF;

  UPDATE public.mock_results mr
  SET score = sub.total_score,
      max_score = sub.total_max,
      correct_answers = sub.correct_count,
      accuracy = CASE WHEN sub.total_max > 0 THEN round(sub.total_score / sub.total_max * 100) ELSE 0 END,
      revealed_at = now()
  FROM (
    SELECT mad.result_id,
           COALESCE(sum(mad.points_earned), 0) AS total_score,
           COALESCE(sum(mad.max_points), 0) AS total_max,
           count(*) FILTER (WHERE mad.is_correct) AS correct_count
    FROM public.mock_answer_details mad
    WHERE mad.result_id IN (
      SELECT id FROM public.mock_results WHERE mock_test_id = p_mock_test_id AND revealed_at IS NULL
    )
    GROUP BY mad.result_id
  ) sub
  WHERE mr.id = sub.result_id;

  GET DIAGNOSTICS v_revealed_count = ROW_COUNT;
  RETURN jsonb_build_object('revealedCount', v_revealed_count, 'cohortSize', v_cohort_size);
END;
$$;

-- Внутренняя, вызывается только двумя обёртками ниже (обе SECURITY DEFINER,
-- поэтому их собственных прав достаточно) — снаружи не нужна никому.
REVOKE ALL ON FUNCTION public.reveal_mock_results_internal(uuid) FROM PUBLIC;

-- Ручной путь: кнопка «Готово» у учителя и админа. Проверки те же, что были.
CREATE OR REPLACE FUNCTION public.finalize_mock_group_results(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  IF NOT (v_mock_test.created_by = auth.uid()::text OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to finalize this mock test';
  END IF;
  IF v_mock_test.closed_at IS NULL THEN
    RAISE EXCEPTION 'Close the mock to new entries before finalizing results';
  END IF;
  IF v_mock_test.results_publish_at IS NOT NULL AND now() < v_mock_test.results_publish_at THEN
    RAISE EXCEPTION 'Cannot finalize before the announced results date';
  END IF;

  RETURN public.reveal_mock_results_internal(p_mock_test_id);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_mock_group_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_mock_group_results(uuid) TO authenticated;

-- Автоматический путь. Ownership не проверяется (звать будет сервер, не
-- человек), зато остаются оба содержательных условия — тест закрыт и
-- объявленная дата результатов наступила, — плюс замок от двойного запуска.
CREATE OR REPLACE FUNCTION public.finalize_mock_group_results_system(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
  v_claimed uuid;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  IF v_mock_test.closed_at IS NULL THEN
    RAISE EXCEPTION 'Close the mock to new entries before finalizing results';
  END IF;
  IF v_mock_test.results_publish_at IS NOT NULL AND now() < v_mock_test.results_publish_at THEN
    RAISE EXCEPTION 'Cannot finalize before the announced results date';
  END IF;

  -- Захват и проверка одним оператором: между SELECT и UPDATE второй
  -- параллельный вызов успел бы проскочить.
  UPDATE public.mock_tests
  SET auto_finalized_at = now()
  WHERE id = p_mock_test_id AND auto_finalized_at IS NULL
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('revealedCount', 0, 'alreadyFinalized', true);
  END IF;

  RETURN public.reveal_mock_results_internal(p_mock_test_id);
END;
$$;

-- Только service_role: у обычного залогиненного пользователя эта функция
-- обошла бы проверку владельца из ручной версии.
REVOKE ALL ON FUNCTION public.finalize_mock_group_results_system(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_mock_group_results_system(uuid) TO service_role;

-- ═══ Проверка эссе тем же автоматическим путём ═══
--
-- Публикация обязана идти ПОСЛЕ проверки письменных работ, иначе эссе попадут
-- в итоговый балл нулями. Ручная кнопка гоняет grade-essays в цикле до конца,
-- и авто-путь должен уметь то же самое — но ai_grade_mock_responses_batch (068)
-- сверяет владельца по auth.uid(), которого у сервера нет. Как и с
-- финализацией: общее тело вынесено, сверху две разные проверки прав.
--
-- p_actor_id вместо auth.uid() в audit_log: у автоматического прохода нет
-- человека-автора, и записывать туда NULL значит потерять сам факт, что балл
-- поставлен машиной без участия учителя.
CREATE OR REPLACE FUNCTION public.ai_grade_mock_responses_batch_internal(
  p_mock_test_id uuid,
  p_grades jsonb,
  p_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade jsonb;
  v_detail record;
  v_points numeric;
  v_claimed int;
  v_graded int := 0;
  v_skipped int := 0;
  v_result_ids uuid[] := '{}';
BEGIN
  FOR v_grade IN SELECT value FROM jsonb_array_elements(COALESCE(p_grades, '[]'::jsonb)) LOOP
    -- Ответ обязан принадлежать именно этому тесту: иначе владелец одного
    -- теста мог бы переписать баллы в чужом.
    SELECT mad.id, mad.result_id, mad.max_points
    INTO v_detail
    FROM public.mock_answer_details mad
    JOIN public.mock_results mr ON mr.id = mad.result_id
    WHERE mad.id = (v_grade->>'detailId')::uuid
      AND mr.mock_test_id = p_mock_test_id;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Балл зажимаем, а не отвергаем: модель иногда возвращает чуть больше
    -- максимума, и терять из-за этого всю работу ученика незачем.
    v_points := GREATEST(0, LEAST(COALESCE((v_grade->>'points')::numeric, 0), v_detail.max_points));

    UPDATE public.mock_answer_details
    SET points_earned = v_points,
        is_correct = (v_points = max_points AND max_points > 0),
        review_status = 'ai_graded',
        review_feedback = NULLIF(trim(v_grade->>'feedback'), ''),
        reviewed_at = now()
    WHERE id = v_detail.id AND review_status = 'pending';

    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      -- Уже проверено (учителем вручную или предыдущим заходом) — не трогаем.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_graded := v_graded + 1;
    IF NOT (v_detail.result_id = ANY(v_result_ids)) THEN
      v_result_ids := array_append(v_result_ids, v_detail.result_id);
    END IF;

    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      p_actor_id,
      'mock_response_ai_graded',
      'mock_answer_detail',
      v_detail.id::text,
      jsonb_build_object('resultId', v_detail.result_id, 'points', v_points, 'maxPoints', v_detail.max_points, 'batch', true)
    );
  END LOOP;

  -- Пересчёт итогов затронутых результатов одним оператором, а не по одному
  -- на ученика. Это те же формулы, что в ai_grade_mock_response (065).
  IF array_length(v_result_ids, 1) > 0 THEN
    UPDATE public.mock_results mr
    SET score = agg.total_points,
        correct_answers = agg.correct_count,
        accuracy = CASE WHEN agg.total_max > 0 THEN round(agg.total_points / agg.total_max * 100) ELSE 0 END
    FROM (
      SELECT mad.result_id,
             COALESCE(sum(mad.points_earned), 0) AS total_points,
             COALESCE(sum(mad.max_points), 0) AS total_max,
             count(*) FILTER (WHERE mad.is_correct) AS correct_count
      FROM public.mock_answer_details mad
      WHERE mad.result_id = ANY(v_result_ids)
      GROUP BY mad.result_id
    ) agg
    WHERE mr.id = agg.result_id;
  END IF;

  RETURN jsonb_build_object('graded', v_graded, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_grade_mock_responses_batch_internal(uuid, jsonb, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ai_grade_mock_responses_batch(
  p_mock_test_id uuid,
  p_grades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  IF NOT (v_mock_test.created_by = auth.uid()::text OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to grade this mock test';
  END IF;

  RETURN public.ai_grade_mock_responses_batch_internal(p_mock_test_id, p_grades, auth.uid()::text);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_grade_mock_responses_batch(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_grade_mock_responses_batch(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_grade_mock_responses_batch_system(
  p_mock_test_id uuid,
  p_grades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mock_tests WHERE id = p_mock_test_id) THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  RETURN public.ai_grade_mock_responses_batch_internal(p_mock_test_id, p_grades, 'system');
END;
$$;

REVOKE ALL ON FUNCTION public.ai_grade_mock_responses_batch_system(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_grade_mock_responses_batch_system(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
