-- Итоговый балл сертификата: 100 для общеобразовательных, 75 для языков.
--
-- Шкала Раша T = 50 + 10Z с потолком 75 — величина ПРОМЕЖУТОЧНАЯ. В сертификат
-- БМБА и для поступления балл выдаётся по шкале предмета: математика, физика,
-- химия, биология, история, география, родной язык, юриспруденция — 100;
-- иностранные языки (Multilevel) — 75. До сих пор мы показывали ученику
-- промежуточный T, то есть заниженное число, для семи предметов из восьми.
--
-- level_score теперь хранит ИТОГОВЫЙ балл, а не T. Знать, из скольких он, по
-- самому числу нельзя — 60 у англичанина и 60 у математика это разные доли, —
-- поэтому максимум хранится рядом. Показывать его ученику не будем (решение
-- владельца: на экране только сам балл, без знаменателя), но раскраска бейджа
-- считает долю именно от него.
--
-- Уровень A+..C НЕ пересчитывается: пороги 70/65/60/55/50/46 в документе
-- заданы на T-шкале, и grade_level уже посчитан от неё правильно. Считать
-- букву от 100-балльного числа значило бы сдвинуть все границы.
ALTER TABLE public.mock_results
  ADD COLUMN IF NOT EXISTS level_score_max numeric;

COMMENT ON COLUMN public.mock_results.level_score_max IS
  'Максимум шкалы, в которой записан level_score: 100 для общеобразовательных предметов, 75 для иностранных языков (Multilevel). См. src/lib/certificate-scale.ts.';

-- Максимум проставляется всем строкам, даже тем, где балла ещё нет: колонка
-- должна быть осмысленной к моменту, когда балл появится.
UPDATE public.mock_results mr
SET level_score_max = CASE WHEN mt.subject_id = 'english' THEN 75 ELSE 100 END
FROM public.mock_tests mt
WHERE mt.id = mr.mock_test_id
  AND mr.level_score_max IS DISTINCT FROM (CASE WHEN mt.subject_id = 'english' THEN 75 ELSE 100 END);

-- Уже записанные баллы переводятся из T в шкалу предмета. Английский не
-- трогаем — у него шкала и так совпадает с T.
UPDATE public.mock_results mr
SET level_score = round(mr.level_score / 75.0 * 100)
FROM public.mock_tests mt
WHERE mt.id = mr.mock_test_id
  AND mr.level_score IS NOT NULL
  AND mt.subject_id IS DISTINCT FROM 'english';

NOTIFY pgrst, 'reload schema';
