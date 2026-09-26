-- 126: дробные веса OPLM.
--
-- Целые веса 1/2/3 (миграция 125) оставили много одинаковых баллов: сумма
-- весов решённых заданий — достаточная статистика OPLM, а у целых весов
-- разные наборы ответов часто дают одну сумму. Теперь вес идёт линейно по
-- сложности от 1 до 3 без округления (design/RASCH.md, «Нижняя ступень — OPLM»).
-- Диапазон тот же, меняется только тип.

ALTER TABLE public.mock_item_calibration
    ALTER COLUMN item_weight TYPE double precision USING item_weight::double precision;

COMMENT ON COLUMN public.mock_item_calibration.item_weight IS
    'Вес задания OPLM: линейно по сложности от 1 (самое лёгкое) до 3 (самое трудное); NULL у остальных моделей.';

NOTIFY pgrst, 'reload schema';
