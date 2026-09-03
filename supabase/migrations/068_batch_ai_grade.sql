-- Пакетная запись AI-оценок за письменные задания по всей группе.
--
-- Зачем нужна отдельная функция: ai_grade_mock_response (065) жёстко требует
-- `v_detail.user_id = auth.uid()::text` — её может вызвать только сам ученик
-- для своего же ответа. Это правильно для сценария «сдал и сразу получил
-- балл», но именно поэтому владелец теста не может проверить работы группы.
--
-- Новая схема: проверка эссе перестаёт запускаться на каждой сдаче и
-- выполняется один раз при публикации результатов, пачками по 20-25 учеников
-- на один запрос к модели. Так вместо ~200 обращений к Gemini на группу из 100
-- (текущий код вызывает модель на КАЖДЫЙ ответ) получается несколько, и модель
-- видит сразу много работ по одному заданию, то есть ставит баллы по одной
-- планке.
--
-- Клейм остаётся атомарным ровно по той же причине, что в 065:
-- `review_status = 'pending'` входит в WHERE самого UPDATE, поэтому повторный
-- вызов (в том числе при обрыве роута на середине и повторном нажатии
-- «Готово») не перезапишет уже проверенное — он просто ничего не найдёт.
-- Это и делает публикацию возобновляемой.
--
-- Все UPDATE здесь с WHERE: у роли authenticator подключён pg_safeupdate,
-- который валит оператор без WHERE (см. миграцию 067 — на этом годами не
-- работала публикация результатов).
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
  v_grade jsonb;
  v_detail record;
  v_points numeric;
  v_claimed int;
  v_graded int := 0;
  v_skipped int := 0;
  v_result_ids uuid[] := '{}';
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;
  IF NOT (v_mock_test.created_by = auth.uid()::text OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to grade this mock test';
  END IF;

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
      auth.uid()::text,
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

REVOKE ALL ON FUNCTION public.ai_grade_mock_responses_batch(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_grade_mock_responses_batch(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
