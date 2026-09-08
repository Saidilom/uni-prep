-- Точность измерения: погрешность балла и статус измерения.
--
-- Вопрос владельца был «почему баллы такие близкие и повторяются». Ответ в
-- двух частях, и вторая требует схемы.
--
-- Первая часть — теорема: при полных данных число верных ответов является
-- достаточной статистикой для способности (§7–8), поэтому одинаковое число
-- верных даёт в точности одинаковый балл. На проде разброс θ внутри такой
-- группы равен 4e-16, то есть шум двоичной дроби. На 55 заданиях возможных
-- баллов физически не больше 56.
--
-- Вторая часть — то, чего в базе не было: у балла есть погрешность, и она
-- велика. По формуле SE = 1/√I(θ) на реальных сложностях математики вышло
-- ±3,2–4,6 балла, а из 630 пар работ статистически различимы только 206.
-- Значит 31,4 и 32,1 — один и тот же результат, и одна десятая рядом с ними
-- обещает точность, которой нет.
--
-- Колонки ниже дают эту погрешность сохранить и показать. Формулы — ТЗ
-- D.3 (информация теста), D.4 (SE), E.10 (SE сложности), §217 (при нулевой
-- информации возвращать статус, а не число).

-- ═══ 1. Погрешность и статус у работы ═══

ALTER TABLE public.mock_results
  -- Стандартная ошибка способности, логиты. NULL значит «не считалась» либо
  -- «не существует» — различить помогает measurement_status.
  ADD COLUMN IF NOT EXISTS theta_se numeric,
  -- Та же ошибка в баллах шкалы 75. Хранится отдельно, а не выводится на
  -- лету: множитель зависит от эталонной популяции (сейчас σ = 1, то есть
  -- одна логита = 10 баллов), и старые работы должны остаться объяснимыми
  -- даже если эталон однажды сменится.
  ADD COLUMN IF NOT EXISTS score_se numeric,
  -- OK | LOW_INFORMATION | INSUFFICIENT_INFORMATION.
  -- §215 требует различать «результат существует» и «измерение достаточно».
  ADD COLUMN IF NOT EXISTS measurement_status text,
  -- Информация теста в точке θ. Аддитивна по заданиям, в отличие от SE (D.5),
  -- поэтому хранится своей колонкой, а не выводится из score_se.
  ADD COLUMN IF NOT EXISTS test_information numeric;

COMMENT ON COLUMN public.mock_results.theta_se IS
  'SE(θ) = 1/√I(θ), логиты (ТЗ D.4). NULL — информации нет, см. measurement_status.';
COMMENT ON COLUMN public.mock_results.score_se IS
  'Та же погрешность в баллах шкалы 75. Одна логита = 10 баллов при σ = 1.';
COMMENT ON COLUMN public.mock_results.measurement_status IS
  'OK | LOW_INFORMATION (§216) | INSUFFICIENT_INFORMATION (§217). Отличает «плохое измерение» от «нет измерения».';
COMMENT ON COLUMN public.mock_results.test_information IS
  'I(θ) = Σ P(1−P) в точке оценки (ТЗ D.3). Аддитивна по заданиям, SE — нет.';

-- Статус — закрытый список. Опечатка в нём означала бы, что интерфейс молча
-- покажет балл как надёжный, а это то самое, что §215 запрещает.
ALTER TABLE public.mock_results
  DROP CONSTRAINT IF EXISTS mock_results_measurement_status_check;
ALTER TABLE public.mock_results
  ADD CONSTRAINT mock_results_measurement_status_check
  CHECK (measurement_status IS NULL
         OR measurement_status IN ('OK', 'LOW_INFORMATION', 'INSUFFICIENT_INFORMATION'));

-- ═══ 2. Погрешность у сложности задания (E.10) ═══

ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS difficulty_se numeric,
  -- §165/E.9: задание, на которое все ответили одинаково, не калибруется —
  -- b уходит в ±∞. Такое надо помечать, а не держать наравне с остальными.
  ADD COLUMN IF NOT EXISTS item_status text;

COMMENT ON COLUMN public.mock_item_calibration.difficulty_se IS
  'SE(b) из информационной матрицы (ТЗ E.10). При sample_size < 250–300 (E.8) велика.';
COMMENT ON COLUMN public.mock_item_calibration.item_status IS
  'OK | EXTREME_SCORE (все верно/все неверно, b не оценивается, §165) | NO_OBSERVATIONS.';

ALTER TABLE public.mock_item_calibration
  DROP CONSTRAINT IF EXISTS mock_item_calibration_item_status_check;
ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_item_status_check
  CHECK (item_status IS NULL
         OR item_status IN ('OK', 'EXTREME_SCORE', 'NO_OBSERVATIONS'));

-- ═══ 3. Сходимость: перестаёт теряться ═══
--
-- `converged` и `iterations` уходили в HTTP-ответ /api/rasch/recalculate и
-- нигде не сохранялись, хотя §18 требует не выдавать «тихий» результат при
-- недостижении сходимости, а P.3 — прослеживаемость каждого балла.
ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS converged boolean,
  ADD COLUMN IF NOT EXISTS iterations integer;

COMMENT ON COLUMN public.mock_item_calibration.converged IS
  'Сошлась ли оценка (§17–18). false означает NON_CONVERGED: балл выдан, но доверять ему нельзя.';

-- Существующие 90 работ НЕ пересчитываются: колонки остаются NULL до
-- следующего прогона /api/rasch/recalculate. Это осознанно — балл этих работ
-- правился уже дважды (нулевой эталон, шкала 75), и трогать его в третий раз
-- ради погрешности незачем. Интерфейс обязан показывать балл без «±», когда
-- score_se пуст, а не подставлять что-то своё (§233).

NOTIFY pgrst, 'reload schema';
