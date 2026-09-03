-- Две ошибки в публикации результатов, из-за которых баллы у ученика и в
-- админ-панели расходились.
--
-- ОШИБКА 1. Функция перезаписывала score и max_score (перевзвешивание к шкале
-- 75), но НЕ трогала accuracy и correct_answers — они оставались с момента
-- сдачи. В одной строке оказывались три несовместимых числа. Живой пример из
-- прода:
--     score=1.58/75   accuracy=30%   correct_answers=11/50
-- то есть 2%, 30% и 22% одновременно. Любые два экрана, взявшие разные поля,
-- обязаны были разойтись. Теперь accuracy считается из итогового score/max_score,
-- а correct_answers пересчитывается из mock_answer_details.
--
-- ОШИБКА 2. Перевзвешивание вырождается на маленькой группе. Вес вопроса —
-- это доля ошибившихся: то, что решили все, весит 0.05, то, что провалили все,
-- весит 1.0. При одном сдавшем «все» — это он один, поэтому каждый его верный
-- ответ автоматически объявляется лёгким и почти ничего не стоит. Проверено
-- арифметикой на том же примере: 11 верных из 50 дают сумму весов
-- 11*0.05 + 39*1.0 = 39.55, за верный вопрос 75*0.05/39.55 = 0.095 балла,
-- итог ≈ 1.0 из 75 — ровно те 1.58, что лежали в базе.
--
-- Это не баг реализации, а граница применимости самого метода: сравнивать
-- ученика с группой можно только когда группа есть. Ниже порога результаты
-- публикуются как есть — сумма заработанных баллов из суммы возможных, без
-- перевзвешивания. Порог намеренно консервативный; на мероприятии со 100
-- участниками перевзвешивание работает как задумано.
CREATE OR REPLACE FUNCTION public.finalize_mock_group_results(p_mock_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
  v_revealed_count int;
  v_cohort_size int;
  -- Меньше этого числа сдавших — перевзвешивание не имеет смысла (см. шапку).
  v_min_cohort constant int := 10;
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

  SELECT count(*) INTO v_cohort_size
  FROM public.mock_results
  WHERE mock_test_id = p_mock_test_id AND revealed_at IS NULL;

  IF v_cohort_size = 0 THEN
    RETURN jsonb_build_object('revealedCount', 0, 'reweighted', false);
  END IF;

  -- Малая группа: раскрываем как есть, без перевзвешивания. Все четыре поля
  -- считаются из одного источника, поэтому противоречить друг другу не могут.
  IF v_cohort_size < v_min_cohort THEN
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
    RETURN jsonb_build_object('revealedCount', v_revealed_count, 'reweighted', false, 'cohortSize', v_cohort_size);
  END IF;

  DROP TABLE IF EXISTS tmp_question_weights;
  CREATE TEMP TABLE tmp_question_weights ON COMMIT DROP AS
  SELECT
    mad.question_id,
    AVG(mad.points_earned / NULLIF(mad.max_points, 0)) AS avg_ratio
  FROM public.mock_answer_details mad
  JOIN public.mock_results mr ON mr.id = mad.result_id
  WHERE mr.mock_test_id = p_mock_test_id AND mr.revealed_at IS NULL
  GROUP BY mad.question_id;

  IF NOT EXISTS (SELECT 1 FROM tmp_question_weights) THEN
    RETURN jsonb_build_object('revealedCount', 0, 'reweighted', false);
  END IF;

  ALTER TABLE tmp_question_weights ADD COLUMN error_share numeric;
  -- Floor of 0.05 so a question everyone nailed still carries some weight
  -- instead of being reweighted to zero. A NULL avg_ratio (every submission
  -- had max_points=0 for this question — no real signal either way) also
  -- floors instead of ceiling to 1.0.
  -- WHERE true обязателен: у роли authenticator подключён pg_safeupdate,
  -- он валит UPDATE без WHERE (см. миграцию 067).
  UPDATE tmp_question_weights
  SET error_share = CASE WHEN avg_ratio IS NULL THEN 0.05 ELSE GREATEST(1 - avg_ratio, 0.05) END
  WHERE true;

  ALTER TABLE tmp_question_weights ADD COLUMN new_points numeric;
  UPDATE tmp_question_weights t
  SET new_points = ROUND(75 * t.error_share / s.total_share, 2)
  FROM (SELECT SUM(error_share) AS total_share FROM tmp_question_weights) s
  WHERE true;

  -- Per-item rounding drifts the sum off 75.00 by a few cents — dump the
  -- remainder onto the single hardest (highest-weight) question.
  UPDATE tmp_question_weights
  SET new_points = new_points + (75 - (SELECT SUM(new_points) FROM tmp_question_weights))
  WHERE question_id = (SELECT question_id FROM tmp_question_weights ORDER BY new_points DESC LIMIT 1);

  -- COALESCE(..., 0) guards the same max_points=0 case: without it, a
  -- question with old max_points=0 (points_earned was always 0 there too)
  -- divides 0/NULLIF(0,0) -> NULL, leaving points_earned NULL instead of 0
  -- after reweighting.
  UPDATE public.mock_answer_details mad
  SET points_earned = ROUND(COALESCE(mad.points_earned / NULLIF(mad.max_points, 0), 0) * t.new_points, 2),
      max_points = t.new_points
  FROM tmp_question_weights t, public.mock_results mr
  WHERE mad.question_id = t.question_id
    AND mr.id = mad.result_id
    AND mr.mock_test_id = p_mock_test_id
    AND mr.revealed_at IS NULL;

  -- accuracy и correct_answers пересчитываются здесь же, из тех же строк, что
  -- дали score. Раньше они оставались со времени сдачи и противоречили баллу.
  UPDATE public.mock_results mr
  SET score = sub.total_score,
      max_score = 75,
      correct_answers = sub.correct_count,
      accuracy = round(sub.total_score / 75 * 100),
      revealed_at = now()
  FROM (
    SELECT mad.result_id,
           SUM(mad.points_earned) AS total_score,
           count(*) FILTER (WHERE mad.is_correct) AS correct_count
    FROM public.mock_answer_details mad
    WHERE mad.result_id IN (
      SELECT id FROM public.mock_results WHERE mock_test_id = p_mock_test_id AND revealed_at IS NULL
    )
    GROUP BY mad.result_id
  ) sub
  WHERE mr.id = sub.result_id;

  GET DIAGNOSTICS v_revealed_count = ROW_COUNT;

  RETURN jsonb_build_object('revealedCount', v_revealed_count, 'reweighted', true, 'cohortSize', v_cohort_size);
END;
$$;

NOTIFY pgrst, 'reload schema';
