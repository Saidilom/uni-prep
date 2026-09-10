-- 112. Шкала показанного балла закрепляется за тестом.
--
-- Решение владельца от 2026-09-10: балл показывается из 100 у всех предметов
-- и из 75 у английского. Прежние 75-балльные результаты при этом НЕ
-- пересчитываются.
--
-- ═══ ПОЧЕМУ ЭТО СВОЙСТВО ТЕСТА, А НЕ ДАТЫ ═══
--
-- «Только новые сдачи» само собой не выходит. /api/rasch/recalculate при
-- каждом запуске перезаписывает level_score у ВСЕХ работ мока — а запускается
-- он после каждой сдачи. Первая же новая сдача в старый тест утянула бы на
-- новую шкалу все прежние работы того теста, включая уже показанные ученикам.
--
-- Поэтому шкала становится колонкой у теста: роут читает её, а не выводит из
-- предмета заново. Так «прежнее не меняется» — свойство данных, а не
-- совпадение по времени.
--
-- NULL означает «по предмету» и годится для тестов, созданных после этой
-- миграции: у них шкала определится сама, из certificateMaxForSubject.
-- Существующим тестам ставим 75 явно.

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS certificate_scale_max numeric;

COMMENT ON COLUMN public.mock_tests.certificate_scale_max IS
  'Максимум показанного балла у этого теста. 75 у тестов до 2026-09-10 — их результаты не пересчитываются. NULL = определить по предмету (100, у английского 75).';

-- Только там, где ещё не задано: миграция должна быть безопасна к повтору.
UPDATE public.mock_tests
SET certificate_scale_max = 75
WHERE certificate_scale_max IS NULL;

-- Шкала не может быть нулевой или отрицательной: балл из неё считается
-- делением, и ноль дал бы бесконечность вместо балла.
ALTER TABLE public.mock_tests
  DROP CONSTRAINT IF EXISTS mock_tests_certificate_scale_max_check;
ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_certificate_scale_max_check
  CHECK (certificate_scale_max IS NULL OR certificate_scale_max > 0);

NOTIFY pgrst, 'reload schema';
