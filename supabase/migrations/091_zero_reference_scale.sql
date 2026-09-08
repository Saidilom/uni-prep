-- Нулевой эталон: балл начинает отражать абсолютный уровень.
--
-- Этап 1 снял зависимость балла от когорты, но эталоном стали фактические
-- сдачи 2026-09-06 — те, кто решил 23% и 35% заданий. Абсолютный уровень
-- поэтому остался завышенным: за половину решённого теста выходило 90 баллов,
-- за 28% решённого — 61.
--
-- Владелец выбрал нулевой эталон (μ = 0, σ = 1): 50 баллов по T-шкале означают
-- способность вровень со СРЕДНИМ ЗАДАНИЕМ теста. Ноль не произвольный —
-- estimateRasch центрирует сложности через recenter(). Подробности и
-- ограничения — src/lib/reference-population.ts и design/RASCH.md §268.
--
-- Формула Агентства T = 50 + 10·(θ−μ)/σ не меняется. Меняется точка отсчёта.
--
-- ЦЕНА, принятая владельцем: меняются все уже выставленные баллы, и по
-- математике почти каждая буква. 33 из 36 получат «Ниже C» — честный результат
-- для когорты, решившей 23%, но ученикам уже показали C, C+, B, B+, A и A+.
-- Поэтому пересчёт создаёт РЕВИЗИИ, а не переписывает молча (§239).

-- ═══ 1. Ревизии результатов ═══
--
-- §239 требует прямо: пересчёт создаёт новую ревизию. §197–198 — что
-- исторический результат должно быть возможно воспроизвести. В миграции 085 я
-- переписал 90 баллов на месте; норме это противоречило, и повторять нельзя.
--
-- Таблица хранит снимок значений ДО пересчёта и причину. INSERT-политики нет
-- ни для одной роли: пишется только миграциями, по образцу audit_log
-- (см. CLAUDE.md). Чтение — админу.
CREATE TABLE IF NOT EXISTS public.mock_result_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.mock_results(id) ON DELETE CASCADE,
  revised_at timestamptz NOT NULL DEFAULT now(),
  -- Почему пересчитали. Строкой, а не enum: причины заранее не перечислить, а
  -- «прочая» скрыла бы смысл конкретной правки.
  reason text NOT NULL,
  -- Снимок ДО пересчёта. NULL здесь значит «этого значения не было».
  level_score numeric,
  level_score_max numeric,
  grade_level text,
  rasch_score numeric,
  -- Версия шкалы, по которой был посчитан прежний балл.
  scale_version text
);

COMMENT ON TABLE public.mock_result_revisions IS
  'Снимки баллов до осознанного пересчёта методики (§239). Заполняется только миграциями, как audit_log.';

CREATE INDEX IF NOT EXISTS mock_result_revisions_result_idx
  ON public.mock_result_revisions (result_id, revised_at DESC);

ALTER TABLE public.mock_result_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mock_result_revisions_admin_read ON public.mock_result_revisions;
CREATE POLICY mock_result_revisions_admin_read ON public.mock_result_revisions
  FOR SELECT USING (public.is_admin());

-- ═══ 2. Расчёт ═══
--
-- Считаем из уже сохранённой rasch_score: θ лежит в базе с полной точностью,
-- поэтому модель заново не прогоняется и результат не может «уехать» из-за
-- нового прогона. Тот же приём, что в миграциях 077, 085 и 089.
CREATE TEMP TABLE zero_ref_recalc AS
WITH cohort AS (
  -- Прежний эталон — фактические сдачи по предмету. Нужен только для
  -- самопроверки: доказать, что мы воспроизводим текущие баллы.
  SELECT mt.subject_id,
         avg(mr.rasch_score) AS mu,
         COALESCE(stddev_pop(mr.rasch_score), 0) AS sigma
  FROM public.mock_results mr
  JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
  WHERE mr.rasch_score IS NOT NULL
  GROUP BY mt.subject_id
),
essay AS (
  SELECT ad.result_id,
         COALESCE(SUM(ad.points_earned), 0) AS earned,
         COALESCE(SUM(q.points), 0) AS max_points
  FROM public.mock_answer_details ad
  JOIN public.mock_questions q ON q.id = ad.question_id
  WHERE q.question_type = 'essay'
  GROUP BY ad.result_id
),
base AS (
  SELECT mr.id,
         mt.subject_id,
         mr.level_score AS stored_score,
         mr.level_score_max AS max_scale,
         mr.grade_level AS stored_level,
         mr.rasch_score,
         COALESCE(e.max_points, 0) > 0 AS has_essay,
         COALESCE(e.earned, 0) AS essay_earned,
         -- Прежняя точка отсчёта: эталон по предмету.
         greatest(0, least(75, 50 + 10 * (mr.rasch_score - c.mu)
                                    / CASE WHEN c.sigma < 1e-6 THEN 1 ELSE c.sigma END)) AS t_old,
         -- Новая: нулевой эталон, μ = 0 и σ = 1.
         greatest(0, least(75, 50 + 10 * mr.rasch_score)) AS t_new
  FROM public.mock_results mr
  JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
  JOIN cohort c ON c.subject_id = mt.subject_id
  LEFT JOIN essay e ON e.result_id = mr.id
  WHERE mr.rasch_score IS NOT NULL
    AND mr.level_score IS NOT NULL
    AND mr.level_score_max > 0
)
SELECT
  id, subject_id, stored_score, stored_level, max_scale, rasch_score,
  has_essay, essay_earned,
  -- Родной язык: второй раздел — сочинение, у всех 0. Деление на два не
  -- трогаем: это отдельное открытое решение владельца.
  round((CASE WHEN has_essay THEN t_old / 2 ELSE t_old END) / 75.0 * max_scale, 1) AS score_old,
  round((CASE WHEN has_essay THEN t_new / 2 ELSE t_new END) / 75.0 * max_scale, 1) AS score_new,
  round(CASE WHEN has_essay THEN t_new / 2 ELSE t_new END) AS t_new_rounded
FROM base;

-- ═══ 3. Самопроверка ДО записи ═══
--
-- Если прежняя цепочка не воспроизводит текущий level_score хотя бы в одной
-- строке — значит θ, эталон или состав разделов не те, из которых балл
-- считался, и писать новые значения нельзя. Исключение откатывает миграцию.
DO $$
DECLARE
  v_total    int;
  v_mismatch int;
  v_essay    int;
BEGIN
  SELECT count(*) INTO v_total FROM zero_ref_recalc;
  SELECT count(*) INTO v_mismatch FROM zero_ref_recalc
   WHERE score_old IS DISTINCT FROM stored_score
     AND score_new IS DISTINCT FROM stored_score;  -- вторая ветка: миграция уже применялась
  SELECT count(*) INTO v_essay FROM zero_ref_recalc WHERE has_essay AND essay_earned <> 0;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Нет ни одной строки с rasch_score — пересчитывать нечего, проверь данные';
  END IF;

  -- Ненулевое сочинение в SQL не пересчитать: перевод 24-балльного критерия
  -- задан таблицей из документа (src/lib/native-cert.ts). Ноль по документу
  -- даёт ровно 0, поэтому такие строки считаются честно, а на любой ненулевой
  -- балл миграция отказывается работать вместо выставления неверного числа.
  IF v_essay > 0 THEN
    RAISE EXCEPTION
      'У % работ ненулевой балл за сочинение — их перевод задан таблицей и в SQL не воспроизводится. Пересчитай эти моки через /api/rasch/recalculate',
      v_essay;
  END IF;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION
      'level_score в % из % строк не совпал ни с прежней шкалой, ни с новой — исходные данные не те, из которых балл считался. Запись отменена',
      v_mismatch, v_total;
  END IF;

  RAISE NOTICE 'Самопроверка пройдена на % баллах', v_total;
END;
$$;

-- ═══ 4. Ревизии: снимок ДО правки ═══
--
-- Только те строки, которые реально меняются: ревизия на неизменившийся балл
-- засоряла бы историю и мешала понять, что именно правилось.
INSERT INTO public.mock_result_revisions
  (result_id, reason, level_score, level_score_max, grade_level, rasch_score, scale_version)
SELECT r.id, 'scale_reference_v2_zero', r.stored_score, r.max_scale, r.stored_level, r.rasch_score, 'v1-2026-09'
FROM zero_ref_recalc r
WHERE r.score_new IS DISTINCT FROM r.stored_score;

-- ═══ 5. Запись ═══
--
-- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md) и заодно сужает запись
-- до строк, где балл реально меняется.
--
-- На этот раз меняется и grade_level: буква считается от ближайшего целого T
-- (решение владельца), а T сдвинулся вместе с точкой отсчёта. В миграции 085
-- буква не менялась, здесь — меняется у 28 из 36 по математике.
UPDATE public.mock_results mr
SET level_score = r.score_new,
    grade_level = CASE
      WHEN r.t_new_rounded >= 70 THEN 'A+'
      WHEN r.t_new_rounded >= 65 THEN 'A'
      WHEN r.t_new_rounded >= 60 THEN 'B+'
      WHEN r.t_new_rounded >= 55 THEN 'B'
      WHEN r.t_new_rounded >= 50 THEN 'C+'
      WHEN r.t_new_rounded >= 46 THEN 'C'
      ELSE 'below_c'
    END
FROM zero_ref_recalc r
WHERE mr.id = r.id
  AND mr.level_score IS DISTINCT FROM r.score_new;

DROP TABLE zero_ref_recalc;

NOTIFY pgrst, 'reload schema';
