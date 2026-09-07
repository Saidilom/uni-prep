-- Пересчёт уже выставленных баллов без промежуточных округлений.
--
-- Балл по модели Раша округлялся ТРИЖДЕ по дороге от логитов к экрану:
-- в raschThetaToT (θ → T-шкала), в combineSectionScores (среднее разделов) и в
-- tScoreToCertificate (T → шкала предмета). Каждое округление срезало точность
-- независимо, и балл выходил целым — 56, 68 — тогда как по методике Агентства
-- у него есть десятая. Особенно грубо на сотенной шкале: шаг целого T после
-- перевода равен 100/75 = 1,33 балла, поэтому баллы прыгали 61 → 64 → 65 → 67,
-- а по родному языку деление на два сливало РАЗНЫЕ результаты в одинаковые
-- баллы — 54 ученика уместились в 18 значений.
--
-- В коде осталось одно округление, последнее (roundScore,
-- src/lib/certificate-scale.ts). Эта миграция приводит к тому же виду баллы,
-- выставленные до правки — на 2026-09-06 мок сдали 90 учеников.
--
-- Считаем из уже сохранённой mock_results.rasch_score: θ лежит в базе с полной
-- точностью, поэтому модель Раша заново прогонять не нужно и результат не может
-- «уехать» из-за нового прогона. Тот же приём, что в миграции 077.
--
-- grade_level НЕ трогаем. Буква считается от ближайшего целого T (решение
-- владельца: «если ближе к 65 баллам, то уровень тот, что получает 65» —
-- см. gradeLevelFromScore), а от округления T до целого буква не зависит.
-- Проверено запросом: ни у одного из 90 учеников буква не меняется. Это важно
-- отдельно: результаты уже открыты ученикам 2026-09-06 в 08:30 UTC, и понижать
-- кого-то задним числом нельзя.
--
-- Схема не меняется, поэтому NOTIFY здесь не нужен.

-- ═══ Общий расчёт ═══
--
-- Разделы теста те же, что в /api/rasch/recalculate: сочинение считается
-- ОТДЕЛЬНЫМ разделом (Baholash_mezoni.pdf, стр. 3-4), и наличие эссе — само по
-- себе основание делить на два, независимо от предмета.
-- Временная ТАБЛИЦА, а не view: считается один раз и читается трижды
-- (самопроверка, отчёт, запись). View пересчитывался бы на каждое обращение, а
-- последнее из них — UPDATE по той же mock_results, которую он читает.
CREATE TEMP TABLE score_recalc AS
WITH cohort AS (
  -- μ и σ по каждому моку отдельно: Z-стандартизация идёт по тем, кто сдавал
  -- ИМЕННО ЭТОТ мок. stddev_pop, а не stddev_samp — как в src/lib/rasch.ts.
  SELECT mock_test_id,
         avg(rasch_score) AS m,
         COALESCE(stddev_pop(rasch_score), 0) AS sd
  FROM public.mock_results
  WHERE rasch_score IS NOT NULL
  GROUP BY mock_test_id
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
         mr.level_score AS stored,
         mr.level_score_max AS max_scale,
         COALESCE(e.max_points, 0) > 0 AS has_essay,
         COALESCE(e.earned, 0) AS essay_earned,
         -- T = clamp(50 + 10·Z, 0, 75). Вырожденная когорта (σ ≈ 0)
         -- отсчитывается от самого банка вопросов, а не от когорты — ровно как
         -- в raschThetaToT.
         greatest(0, least(75,
           50 + 10 * (mr.rasch_score - CASE WHEN c.sd < 1e-6 THEN 0 ELSE c.m END)
                    / CASE WHEN c.sd < 1e-6 THEN 1 ELSE c.sd END)) AS t_test
  FROM public.mock_results mr
  JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
  JOIN cohort c ON c.mock_test_id = mr.mock_test_id
  LEFT JOIN essay e ON e.result_id = mr.id
  WHERE mr.rasch_score IS NOT NULL
    AND mr.level_score IS NOT NULL
    AND mr.level_score_max > 0
)
SELECT
  id, subject_id, stored, max_scale, has_essay, essay_earned, t_test,
  -- Старая цепочка, ровно как она работала до правки: round на каждом шаге.
  -- Нужна только для самопроверки ниже.
  round(
    (CASE WHEN has_essay THEN round(round(t_test) / 2) ELSE round(t_test) END)
    / 75.0 * max_scale
  ) AS level_old,
  -- Новая: точный расчёт, округление одно и последнее — до одной десятой,
  -- как roundScore в TS.
  round(
    (CASE WHEN has_essay THEN t_test / 2 ELSE t_test END)
    / 75.0 * max_scale
  , 1) AS level_new
FROM base;

-- ═══ Самопроверка ДО записи ═══
--
-- Если старая цепочка не воспроизводит текущий level_score хотя бы в одной
-- строке — значит либо θ, либо когортная статистика, либо состав разделов не те,
-- из которых балл когда-то считался, и новые значения писать нельзя. Исключение
-- откатывает всю миграцию.
DO $$
DECLARE
  v_total    int;
  v_mismatch int;
  v_essay    int;
BEGIN
  SELECT count(*) INTO v_total FROM score_recalc;

  -- Строка считается «своей», если её текущий балл — это ЛИБО результат старой
  -- цепочки (миграция ещё не применялась), ЛИБО уже результат новой (применялась
  -- ранее). Второе условие обязательно: без него повторный прогон падал бы на
  -- собственной самопроверке, а миграция, которую нельзя прогнать дважды,
  -- ломает `supabase db push` для всех последующих.
  SELECT count(*) INTO v_mismatch
  FROM score_recalc
  WHERE level_old IS DISTINCT FROM stored
    AND level_new IS DISTINCT FROM stored;

  -- Ненулевое сочинение в SQL не пересчитать: перевод 24-балльного критерия в
  -- 75-балльную шкалу задан ТАБЛИЦЕЙ из документа (ESSAY24_TO_SCORE75,
  -- src/lib/native-cert.ts), а у английского — своей, другой. Ноль там особый
  -- случай и по документу даёт ровно 0, поэтому такие строки считаются честно, а
  -- на любой ненулевой балл за эссе миграция отказывается работать вместо того,
  -- чтобы выставить неверное число.
  SELECT count(*) INTO v_essay FROM score_recalc WHERE has_essay AND essay_earned <> 0;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Нет ни одной строки с rasch_score — пересчитывать нечего, проверь данные';
  END IF;

  IF v_essay > 0 THEN
    RAISE EXCEPTION
      'У % работ ненулевой балл за сочинение — их перевод задан таблицей и в SQL не воспроизводится. Пересчитай эти моки через /api/rasch/recalculate',
      v_essay;
  END IF;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION
      'level_score в % из % строк не совпал ни со старой цепочкой, ни с новой — исходные данные не те, из которых балл считался. Запись отменена',
      v_mismatch, v_total;
  END IF;

  RAISE NOTICE 'Самопроверка пройдена на % баллах', v_total;
END;
$$;

-- ═══ Запись ═══
--
-- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md), и он же сужает запись
-- до строк, где балл реально меняется.
UPDATE public.mock_results mr
SET level_score = sr.level_new
FROM score_recalc sr
WHERE mr.id = sr.id
  AND mr.level_score IS DISTINCT FROM sr.level_new;

DROP TABLE score_recalc;
