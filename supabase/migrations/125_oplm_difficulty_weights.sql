-- Миграция 125: OPLM — 1PL с весами заданий по сложности.
--
-- Решение владельца от 2026-09-26 (design/RASCH.md, «ДЕЙСТВУЮЩИЙ РАСЧЁТ»
-- пункт 3): при N < 300 вместо классического Раша считается OPLM —
-- P = logistic(w·(θ−b)) с фиксированными целыми весами w ∈ {1,2,3} по третям
-- сложности. Одинаковое число верных больше не даёт одинаковый балл: решённое
-- трудное задание весит втрое больше лёгкого.
--
-- Схема: новое значение 'OPLM_1PL' в закрытом списке моделей, новый метод
-- калибровки 'OPLM_JMLE' и сам вес задания — чтобы расчёт был воспроизводим
-- по строке калибровки, а не только по коду.
--
-- Проверено перед миграцией (supabase db query --linked):
--   mock_tests.model_type: NULL, RASCH_1PL, IRT_3PL
--   mock_results.model_type: NULL, RASCH_1PL
--   mock_item_calibration.model_type: RASCH_1PL, IRT_3PL
--   mock_item_calibration.difficulty_method: 1PL_JMLE, 3PL_MMLE
--   → все проходят новые CHECK.

ALTER TABLE public.mock_tests DROP CONSTRAINT IF EXISTS mock_tests_model_type_check;
ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'OPLM_1PL', 'IRT_2PL', 'IRT_3PL'));

ALTER TABLE public.mock_results DROP CONSTRAINT IF EXISTS mock_results_model_type_check;
ALTER TABLE public.mock_results
  ADD CONSTRAINT mock_results_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'OPLM_1PL', 'IRT_2PL', 'IRT_3PL'));

ALTER TABLE public.mock_item_calibration DROP CONSTRAINT IF EXISTS mock_item_calibration_model_type_check;
ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'OPLM_1PL', 'IRT_2PL', 'IRT_3PL'));

ALTER TABLE public.mock_item_calibration DROP CONSTRAINT IF EXISTS mock_item_calibration_difficulty_method_check;
ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_difficulty_method_check
  CHECK (difficulty_method IS NULL OR difficulty_method IN
    ('PROPORTION', 'JMLE', '1PL_JMLE', 'OPLM_JMLE', '2PL_MMLE', '3PL_MMLE'));

ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS item_weight smallint;

ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_item_weight_check
  CHECK (item_weight IS NULL OR item_weight BETWEEN 1 AND 3);

COMMENT ON COLUMN public.mock_item_calibration.item_weight IS
  'Вес задания в OPLM (1 — лёгкая треть по b, 2 — средняя, 3 — трудная; NONE_CORRECT — 3). NULL у всех моделей, кроме OPLM_1PL. discrimination при этом = item_weight/1.702.';

NOTIFY pgrst, 'reload schema';
