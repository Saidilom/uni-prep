-- 114. Центрирование балла по потоку и сложность из доли решивших.
--
-- ═══ ЧТО БЫЛО ═══
--
-- Сложности заданий приходили из совместной калибровки JMLE, а Z-стандартизация
-- шла по ЭТАЛОННОЙ популяции (mu = 0, sigma = 1, см. reference-population.ts и
-- миграцию 091). Балл говорил об уровне подготовки: у математики средний вышел
-- 32,89, у Ona Tili — 19,80, и эти числа различались потому, что различалась
-- подготовка групп.
--
-- ═══ ЧТО СТАЛО ═══
--
-- Решение владельца от 2026-09-11 по документу «Что делать на платформе — шаг
-- за шагом»: сложность считать как beta = -ln(p/(1-p)), а mu и sigma брать из
-- ПОТОКА сдавших.
--
-- Последствия замерены до правки и приняты владельцем: средний балл теперь
-- ровно 50 в любом тесте при любой подготовке, все 90 существующих работ меняют
-- букву, сертификат (C и выше) получают 68 вместо 3.
--
-- ═══ ЗАЧЕМ ЗАМОРОЗКА ═══
--
-- mu и sigma зависят от состава сдавших, а /api/rasch/recalculate пересчитывает
-- ВЕСЬ тест после каждой сдачи. Без заморозки каждая новая работа сдвигала бы
-- баллы всем остальным — уже показанные ученикам.
--
-- Документ этого и не требует: расчёт в нём запускается один раз, после
-- закрытия теста. Поэтому статистика потока закрепляется за тестом, как уже
-- закреплена шкала показа (миграция 112), и после заморозки не пересчитывается.

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS cohort_mu numeric,
  ADD COLUMN IF NOT EXISTS cohort_sigma numeric,
  ADD COLUMN IF NOT EXISTS cohort_n integer,
  ADD COLUMN IF NOT EXISTS cohort_frozen_at timestamptz;

COMMENT ON COLUMN public.mock_tests.cohort_mu IS
  'Среднее theta потока, по которому центрируется балл (шаг 5 документа владельца). Пока cohort_frozen_at пуст — пересчитывается на каждом прогоне.';
COMMENT ON COLUMN public.mock_tests.cohort_sigma IS
  'Выборочное отклонение theta потока (делитель n-1). NULL означает, что разброса не было: один сдавший или все с одинаковым результатом. Балл в этом случае не выставляется — подставлять эталон молча нельзя.';
COMMENT ON COLUMN public.mock_tests.cohort_n IS
  'Сколько работ участвовало в расчёте mu и sigma.';
COMMENT ON COLUMN public.mock_tests.cohort_frozen_at IS
  'Когда статистика потока закреплена. Ставится, как только результат теста показан хотя бы одному ученику: с этого момента его балл не должен меняться от того, кто сдаст после него.';

-- sigma либо положительна, либо её нет вовсе. Ноль означал бы деление на ноль
-- при следующем же расчёте Z.
ALTER TABLE public.mock_tests
  DROP CONSTRAINT IF EXISTS mock_tests_cohort_sigma_positive;
ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_cohort_sigma_positive
  CHECK (cohort_sigma IS NULL OR cohort_sigma > 0);

-- ═══ Каким методом посчитана сложность ═══
--
-- Рядом с missing_policy и person_estimator: по ТЗ §109 смена метода обязана
-- быть видна в ДАННЫХ, а не только в коде. Иначе через полгода по строке
-- калибровки нельзя будет сказать, JMLE её посчитал или доля решивших.
ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS difficulty_method text;

COMMENT ON COLUMN public.mock_item_calibration.difficulty_method IS
  'PROPORTION — beta = -ln(p/(1-p)) из доли решивших (документ владельца, шаг 2). JMLE — прежняя совместная калибровка. Старые строки без значения посчитаны JMLE.';

NOTIFY pgrst, 'reload schema';
