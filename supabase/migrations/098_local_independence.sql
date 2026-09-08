-- Локальная независимость: Yen Q3 и размерность. ТЗ модуль G (§G.1–G.4),
-- плюс §222 (пометить до решения, не удалять).
--
-- ЗАЧЕМ. В обоих реальных вариантах есть testlet-группы — вопросы к одному
-- тексту с общим `group_key`: 11 групп в математике, 9 в узбекском. Модель
-- считает их независимыми, то есть каждый вопрос к тексту приносит полную
-- единицу информации, хотя понимание текста они делят. Из-за этого надёжность
-- теста завышена, а сложности смещены (§G.1).
--
-- ЧТО СЧИТАЕТСЯ (живая логика — src/lib/rasch-q3.ts, 26 тестов):
--
--   Q3(i,j) = corr(X_i − P_i, X_j − P_j)   по персонам, ответившим на ОБА
--   baseline ≈ −1/(L − 1)                  ожидание при независимости
--   флаг при (Q3 − baseline) ≥ 0.2         порог в Q3_EXCESS_THRESHOLD
--
-- Базовый уровень не ноль потому, что θ оценивается по тем же ответам: оценка
-- «съедает» часть общей дисперсии, и остатки выходят слегка
-- антикоррелированными. На 55 заданиях это −0.0185, на 49 — −0.0208.
--
-- ХРАНЯТСЯ ТОЛЬКО ПОМЕЧЕННЫЕ ПАРЫ. Всех пар на 55 заданиях 1485, и держать их
-- целиком незачем: методисту нужны те, где зависимость есть. Сводка по всем
-- парам (максимум, среднее, сколько проверено) лежит рядом, в mock_tests.

CREATE TABLE IF NOT EXISTS public.mock_q3_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,

  -- Пара заданий. Порядок нормализован (a < b по id), чтобы одна пара не
  -- попала в таблицу дважды в разном порядке.
  question_a uuid NOT NULL REFERENCES public.mock_questions(id) ON DELETE CASCADE,
  question_b uuid NOT NULL REFERENCES public.mock_questions(id) ON DELETE CASCADE,

  q3 numeric NOT NULL,
  -- Q3 минус базовый уровень. Именно это сравнивается с порогом.
  q3_excess numeric NOT NULL,
  baseline numeric NOT NULL,
  threshold numeric NOT NULL,
  persons integer NOT NULL,

  -- Задания из одной testlet-группы. Зависимость внутри группы вопросов к
  -- одному тексту ожидаема и объяснима; между несвязанными заданиями — повод
  -- искать дублирование или подсказку.
  same_group boolean NOT NULL,
  flags text[] NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mock_q3_flags IS
  'Пары заданий с зависимостью остатков (Yen Q3, §G.2). ФЛАГИ: §222 запрещает удалять задания до решения человека.';

CREATE UNIQUE INDEX IF NOT EXISTS mock_q3_flags_pair_uq
  ON public.mock_q3_flags (mock_test_id, question_a, question_b);

ALTER TABLE public.mock_q3_flags
  DROP CONSTRAINT IF EXISTS mock_q3_flags_pair_order_check;
ALTER TABLE public.mock_q3_flags
  ADD CONSTRAINT mock_q3_flags_pair_order_check CHECK (question_a < question_b);

ALTER TABLE public.mock_q3_flags ENABLE ROW LEVEL SECURITY;

-- Читает тот, кому доступен мок: правильных ответов таблица не содержит,
-- только «у этих двух заданий связаны остатки». Пишет service-role из
-- /api/rasch/recalculate, как и калибровку.
DROP POLICY IF EXISTS mock_q3_flags_read ON public.mock_q3_flags;
CREATE POLICY mock_q3_flags_read ON public.mock_q3_flags
  FOR SELECT USING (public.can_access_mock(mock_test_id));

-- ═══ Сводка по варианту ═══
--
-- Числа по ВСЕМ парам, а не только по помеченным: без знаменателя «7 флагов»
-- не читается — семь из десяти это одно, семь из тысячи другое.
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS q3_pairs_checked integer,
  ADD COLUMN IF NOT EXISTS q3_pairs_flagged integer,
  ADD COLUMN IF NOT EXISTS q3_max_excess numeric,
  ADD COLUMN IF NOT EXISTS q3_mean_excess numeric,
  -- Собственные значения первых контрастов PCA остатков (§G.4).
  ADD COLUMN IF NOT EXISTS pca_eigenvalues numeric[],
  -- Первый контраст ≥ 2.0 — подозрение на вторую размерность.
  ADD COLUMN IF NOT EXISTS pca_flagged boolean,
  ADD COLUMN IF NOT EXISTS diagnostics_at timestamptz;

COMMENT ON COLUMN public.mock_tests.q3_max_excess IS
  'Максимальное превышение базового уровня Q3 по варианту. Большое ЧИСЛО флагов — сигнал испорченной калибровки, а не «половина теста зависима»: сильный testlet искажает саму оценку θ.';
COMMENT ON COLUMN public.mock_tests.pca_eigenvalues IS
  'Собственные значения первых контрастов PCA стандартизованных остатков (§G.4). Первый ≥ 2.0 — подозрение на вторую размерность.';

-- Существующие баллы этой миграцией НЕ пересчитываются и от диагностики не
-- зависят вовсе: модуль G ничего не меняет в измерении, он только описывает
-- его качество. Колонки заполнятся при следующем прогоне recalculate.

NOTIFY pgrst, 'reload schema';
