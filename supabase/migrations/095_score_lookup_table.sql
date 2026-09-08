-- Таблица «сырой балл → θ → балл → уровень» на вариант. ТЗ §R.6.
--
-- ПОЧЕМУ ТАБЛИЦА ВОЗМОЖНА. При полных данных в уравнение оценки способности
-- входит только ЧИСЛО верных ответов:
--
--   U_W(θ) = r − Σ_i P_i(θ) + J(θ)/(2·I(θ)),   где r = Σ_i x_i
--
-- Суммы считаются по сложностям варианта и от θ; какие именно задания решены
-- верно, в уравнение не входит вообще (§B.6 — достаточность сырого балла).
-- Значит у всех, набравших r верных, способность одна и та же.
--
-- СЛЕДСТВИЕ, которое надо понимать правильно: одинаковое число верных даёт
-- один и тот же балл, и это НЕ дефект. Это свойство модели Раша, ради которого
-- её и берут: измерение не зависит от того, какие именно задания попались.
-- На 55 заданиях возможных баллов ровно 56 — больше их быть не может ни при
-- какой реализации. Владелец спрашивал, почему баллы повторяются: вот строка
-- таблицы, которая это объясняет вместо рассуждений про итерации.
--
-- Чего это НЕ означает: одинаковый ПРОЦЕНТ на РАЗНЫХ вариантах одинаковую
-- способность не даёт (§B.7). Поэтому таблица строится НА ВАРИАНТ и переносить
-- её на другой вариант нельзя — уникальность по (mock_test_id, raw_score).
--
-- ЗАЧЕМ ХРАНИТЬ. Так работает и сам БМБА: балл берётся поиском по строке.
-- Отсюда детерминированность (один вариант — один ответ на один сырой балл),
-- аудируемость (таблицу можно показать методисту и сверить глазами) и
-- прослеживаемость (§199: видно, каким оценщиком и по какой точке отсчёта
-- получено каждое число).
--
-- Модель и способ оценки θ эта миграция НЕ меняет: таблица считается тем же
-- WLE против тех же калиброванных сложностей, просто один раз на сырой балл
-- вместо одного раза на ученика. Живая логика — src/lib/score-table.ts.

CREATE TABLE IF NOT EXISTS public.mock_score_lookup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,

  -- Число верных ответов. Строк на вариант — item_count + 1, от 0 до L.
  raw_score integer NOT NULL,

  -- Способность и её погрешность в этой точке (§C.8, §D.4).
  theta numeric NOT NULL,
  theta_se numeric,
  test_information numeric,

  -- T-балл раздела Раша, 0–75. Промежуточная величина.
  section_score numeric NOT NULL,

  -- Итоговый балл и уровень. NULL у варианта со ВТОРЫМ разделом: там итог есть
  -- среднее разделов, и по одному сырому баллу его не определить
  -- (Baholash_mezoni.pdf стр. 4). Подставлять сюда T первого раздела значило бы
  -- выставить неверный балл.
  score numeric,
  grade_level text,

  -- Статусы: OK / LOW_INFORMATION / INSUFFICIENT_INFORMATION у измерения и
  -- OK / NON_CONVERGED / NO_RESPONSES у уравнения (§215, §217, §C.4).
  measurement_status text,
  wle_status text,

  -- Провенанс (§109, §199): без них строку нельзя ни объяснить, ни
  -- воспроизвести. estimator — «WLE_WARM_1989/1.0», reference_version —
  -- версия точки отсчёта шкалы («v2-zero»).
  estimator text NOT NULL,
  reference_version text NOT NULL,
  item_count integer NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mock_score_lookup IS
  'Таблица «сырой балл → θ → балл → уровень» на вариант (ТЗ §R.6). Балл ученику берётся поиском по строке. Одинаковое число верных даёт одну строку — это §B.6, а не слипание баллов.';
COMMENT ON COLUMN public.mock_score_lookup.raw_score IS
  'Число верных ответов. Единственное, от чего зависит θ при полных данных (§B.6).';
COMMENT ON COLUMN public.mock_score_lookup.score IS
  'Итоговый балл. NULL у варианта с сочинением: итог есть среднее разделов, по сырому баллу не определяется.';

-- Один вариант — одна строка на сырой балл. Без этого таблица теряет смысл
-- справочника: два разных ответа на один и тот же сырой балл означали бы, что
-- балл всё-таки зависит от чего-то ещё.
CREATE UNIQUE INDEX IF NOT EXISTS mock_score_lookup_test_raw_uq
  ON public.mock_score_lookup (mock_test_id, raw_score);

ALTER TABLE public.mock_score_lookup
  DROP CONSTRAINT IF EXISTS mock_score_lookup_raw_range_check;
ALTER TABLE public.mock_score_lookup
  ADD CONSTRAINT mock_score_lookup_raw_range_check
  CHECK (raw_score >= 0 AND raw_score <= item_count);

ALTER TABLE public.mock_score_lookup
  DROP CONSTRAINT IF EXISTS mock_score_lookup_measurement_status_check;
ALTER TABLE public.mock_score_lookup
  ADD CONSTRAINT mock_score_lookup_measurement_status_check
  CHECK (measurement_status IS NULL
         OR measurement_status IN ('OK', 'LOW_INFORMATION', 'INSUFFICIENT_INFORMATION'));

ALTER TABLE public.mock_score_lookup
  DROP CONSTRAINT IF EXISTS mock_score_lookup_wle_status_check;
ALTER TABLE public.mock_score_lookup
  ADD CONSTRAINT mock_score_lookup_wle_status_check
  CHECK (wle_status IS NULL OR wle_status IN ('OK', 'NON_CONVERGED', 'NO_RESPONSES'));

-- ═══ Доступ ═══
--
-- Читать может тот, кому доступен сам мок: таблица объясняет ученику, почему у
-- него именно этот балл, и учителю — почему у двоих он одинаковый. Секрета в
-- ней нет: правильных ответов она не содержит, только соответствие «столько
-- верных → такой балл».
--
-- Писать не может никто: заполняется service-role из /api/rasch/recalculate,
-- как и калибровка. Ручная правка строки означала бы подделку балла.
ALTER TABLE public.mock_score_lookup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mock_score_lookup_read ON public.mock_score_lookup;
CREATE POLICY mock_score_lookup_read ON public.mock_score_lookup
  FOR SELECT USING (public.can_access_mock(mock_test_id));

-- Существующие баллы миграцией НЕ пересчитываются: таблица заполнится при
-- следующем прогоне /api/rasch/recalculate. Балл при этом не изменится —
-- таблица считает то же самое тем же оценщиком, и это закреплено тестом
-- «θ из таблицы совпадает с прямым прогоном WLE до последнего бита».

NOTIFY pgrst, 'reload schema';
