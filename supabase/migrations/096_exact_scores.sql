-- Балл хранится БЕЗ округления. ТЗ §202–203.
--
-- Решение владельца от 2026-09-09: «балл не должен округляться, он должен
-- остаться каким он есть».
--
-- ЧТО БЫЛО. level_score записывался уже округлённым до одной десятой. Это
-- округление В СЕРЕДИНЕ цепочки: балл потом усредняется по группе, учителю и
-- филиалу, и в каждое среднее уходила уже срезанная точность. §202–203 требует
-- обратного: внутренние вычисления в полной точности double, округление один
-- раз и только на выводе.
--
-- ЧТО СТАНОВИТСЯ. В базе лежит точное значение. Одну десятую даёт только показ
-- (formatScore на экране, §L.8 — правило округления отчётного балла).
--
-- ПОБОЧНО ВСКРЫЛСЯ ДЕФЕКТ МИГРАЦИИ 092. Она переводила баллы с сотенной шкалы
-- на 75-балльную выражением round(level_score * 75/100, 1) — то есть брала УЖЕ
-- ОКРУГЛЁННОЕ до 0,1 значение, умножала на 0.75 и округляла ВТОРОЙ раз. Ровно
-- то, что §202 запрещает: округление в середине цепочки.
--
-- Замер: точный балл расходится с сохранённым до 0,065. При одном округлении
-- до 0,1 расхождение не может превышать 0,05 — это и есть подпись двойного
-- округления.
--
-- Поэтому показанный балл ИЗМЕНИТСЯ, и вот насколько:
--
--   узбекский:  14 из 54 работ, ровно на 0,1
--   математика:  1 из 36 работ, ровно на 0,1
--   буква:       НЕ меняется ни у одной из 90
--
-- Изменение на одну десятую — мелочь, но это всё-таки изменение показанного
-- результата, поэтому ревизия создаётся (§239), а не пропускается.

-- ═══ 1. Пересчёт из сохранённой θ ═══
--
-- Точный балл восстанавливается из rasch_score: level_score = T · max / 75, а
-- T = 10·θ + 50 при нулевом эталоне (μ = 0, σ = 1). У родного языка итог есть
-- среднее двух разделов, и сочинение у всех нулевое, поэтому делится на два —
-- ту же цепочку считали миграции 091 и 092.
CREATE TEMP TABLE exact_scores AS
WITH essay AS (
  SELECT ad.result_id,
         COALESCE(SUM(ad.points_earned), 0) AS earned,
         COALESCE(SUM(q.points), 0) AS max_points
  FROM public.mock_answer_details ad
  JOIN public.mock_questions q ON q.id = ad.question_id
  WHERE q.question_type = 'essay'
  GROUP BY ad.result_id
)
SELECT mr.id,
       mt.subject_id,
       mr.level_score AS stored_score,
       mr.level_score_max AS max_scale,
       mr.grade_level AS stored_level,
       COALESCE(e.max_points, 0) > 0 AS has_essay,
       COALESCE(e.earned, 0) AS essay_earned,
       -- Точный балл, без единого округления по пути.
       (CASE WHEN COALESCE(e.max_points, 0) > 0
             THEN greatest(0, least(75, 50 + 10 * mr.rasch_score)) / 2
             ELSE greatest(0, least(75, 50 + 10 * mr.rasch_score))
        END) / 75.0 * mr.level_score_max AS score_exact
FROM public.mock_results mr
JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
LEFT JOIN essay e ON e.result_id = mr.id
WHERE mr.rasch_score IS NOT NULL
  AND mr.level_score IS NOT NULL
  AND mr.level_score_max > 0;

-- ═══ 2. Самопроверка ДО записи ═══
--
-- Проверяем два условия. Первое: БУКВА обязана совпасть у всех — уровень от
-- уточнения точности меняться не должен, и если поменялся, значит балл и буква
-- разошлись раньше. Второе: расхождение показанного балла не больше 0,1 —
-- столько даёт двойное округление 092, а больше означало бы, что θ или состав
-- разделов не те, из которых балл считался.
DO $$
DECLARE
  v_total    int;
  v_mismatch int;
  v_letter   int;
  v_essay    int;
BEGIN
  SELECT count(*) INTO v_total FROM exact_scores;
  -- Расхождение больше 0,1 объяснить двойным округлением нельзя.
  SELECT count(*) INTO v_mismatch FROM exact_scores
   WHERE abs(score_exact::numeric - stored_score) > 0.1;
  -- Буква тоже обязана остаться: она считается от точного балла, а он не менялся.
  SELECT count(*) INTO v_letter FROM exact_scores
   WHERE stored_level IS DISTINCT FROM CASE
     WHEN score_exact >= 70 THEN 'A+'
     WHEN score_exact >= 65 THEN 'A'
     WHEN score_exact >= 60 THEN 'B+'
     WHEN score_exact >= 55 THEN 'B'
     WHEN score_exact >= 50 THEN 'C+'
     WHEN score_exact >= 46 THEN 'C'
     ELSE 'below_c'
   END;
  SELECT count(*) INTO v_essay FROM exact_scores WHERE has_essay AND essay_earned <> 0;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Нет ни одного балла для уточнения — проверь данные';
  END IF;

  -- Ненулевое сочинение в SQL не воспроизвести: перевод задан таблицей из
  -- документа (src/lib/native-cert.ts). Ноль даёт ровно 0, поэтому такие строки
  -- считаются честно, а на любой ненулевой балл миграция отказывается работать.
  IF v_essay > 0 THEN
    RAISE EXCEPTION
      'У % работ ненулевой балл за сочинение — их перевод задан таблицей и в SQL не воспроизводится. Пересчитай эти моки через /api/rasch/recalculate',
      v_essay;
  END IF;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION
      'У % из % работ точный балл расходится с сохранённым больше чем на 0,1 — двойным округлением это не объяснить. Запись отменена',
      v_mismatch, v_total;
  END IF;

  IF v_letter > 0 THEN
    RAISE EXCEPTION
      'У % работ буква не совпала с точным баллом — значит буква и балл разошлись раньше. Запись отменена',
      v_letter;
  END IF;

  RAISE NOTICE 'Самопроверка пройдена на % баллах: буква не меняется, расхождение не больше 0,1', v_total;
END;
$$;

-- ═══ 3. Ревизии: снимок ДО правки (§239) ═══
--
-- Только те строки, где меняется ПОКАЗАННОЕ число. Там, где добавляются лишь
-- невидимые знаки, ревизия засоряла бы историю: результат не изменился.
INSERT INTO public.mock_result_revisions
  (result_id, reason, level_score, level_score_max, grade_level, rasch_score, scale_version)
SELECT e.id, 'exact_score_no_rounding', e.stored_score, e.max_scale, e.stored_level,
       mr.rasch_score, 'v2-zero/rounded-0.1'
FROM exact_scores e
JOIN public.mock_results mr ON mr.id = e.id
WHERE round(e.score_exact::numeric, 1) IS DISTINCT FROM e.stored_score;

-- ═══ 4. Запись ═══
--
-- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md) и заодно сужает запись
-- до строк, где точность реально добавляется. grade_level не трогаем:
-- самопроверка выше доказала, что он уже соответствует точному баллу.
UPDATE public.mock_results mr
SET level_score = e.score_exact
FROM exact_scores e
WHERE mr.id = e.id
  AND mr.level_score IS DISTINCT FROM e.score_exact;

DROP TABLE exact_scores;

-- ═══ 5. Агрегаты: среднее считается от точных баллов ═══
--
-- round(...,1) в этих функциях — округление ОТЧЁТНОГО среднего, и оно остаётся:
-- §L.8 требует зафиксировать правило округления на выводе. Меняется вход:
-- раньше усреднялись уже округлённые баллы, то есть точность терялась дважды.
-- Теперь level_score точен, и round на выходе — единственное округление.
--
-- Сами тела функций не переписываются: выражение AVG(...) уже читает
-- level_score, и после этой миграции оно читает точное значение само.

COMMENT ON COLUMN public.mock_results.level_score IS
  'Итоговый балл БЕЗ округления (ТЗ §202–203). Одну десятую даёт только показ — formatScore, §L.8.';

NOTIFY pgrst, 'reload schema';
