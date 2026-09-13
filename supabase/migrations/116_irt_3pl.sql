-- 116. Модель 3PL рядом с моделью Раша.
--
-- ═══ ЗАЧЕМ ОТДЕЛЬНЫЕ ТАБЛИЦЫ, А НЕ КОЛОНКИ К СУЩЕСТВУЮЩИМ ═══
--
-- §238 нормы: «если появляется discrimination или guessing parameter — это уже
-- отдельная IRT model». Значит и данные отдельные: балл ученика по-прежнему
-- считает Раш и лежит в mock_results, а 3PL считается РЯДОМ и в чужие таблицы
-- не пишет ни строки.
--
-- ═══ ПОЧЕМУ 3PL НЕ СТАВИТ БАЛЛ ═══
--
-- Он оценивает три параметра на задание вместо одного. На боевом моке 36
-- сдавших при 55 заданиях — около 10 наблюдений на параметр, тогда как для
-- устойчивого 3PL называют порядок 1000 испытуемых на задание.
--
-- Насколько это плохо, измерено, а не предположено. Синтетика с ИЗВЕСТНЫМИ
-- параметрами (src/lib/irt-3pl.test.ts), средняя ошибка восстановления:
--
--   N = 2000 → b 0.074, a 0.126
--   N = 500  → b 0.110, a 0.223
--   N = 100  → b 0.178, a 0.262
--   N = 36   → b 0.341, a 0.380
--
-- То есть код верен (на большой выборке параметры восстанавливаются), а данных
-- для 3PL у нас пока мало. Эти таблицы позволяют увидеть это на собственных
-- работах, ничего им не сделав.

CREATE TABLE IF NOT EXISTS public.mock_item_calibration_3pl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mock_questions(id) ON DELETE CASCADE,

  -- Параметры задания.
  discrimination numeric NOT NULL,
  difficulty numeric NOT NULL,
  guessing numeric NOT NULL,

  -- Центр априорного распределения угадывания: 1/k по числу вариантов. Без
  -- него нельзя понять, оценка это или значение, удержанное априором.
  guessing_prior numeric NOT NULL,
  option_count int,

  sample_size int NOT NULL,
  correct_count int NOT NULL,
  item_status text NOT NULL,

  calibrated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mock_test_id, question_id)
);

COMMENT ON TABLE public.mock_item_calibration_3pl IS
  'Параметры заданий по 3PL. НЕ участвует в расчёте балла — балл считает модель Раша (§238).';
COMMENT ON COLUMN public.mock_item_calibration_3pl.guessing_prior IS
  'Центр априорного Beta для c, равен 1/k. При малой выборке оценка c держится им, а не данными — по этой колонке видно, чем именно.';
COMMENT ON COLUMN public.mock_item_calibration_3pl.item_status IS
  'OK | NONE_CORRECT | ALL_CORRECT | NO_RESPONSES | FIXED_GUESSING (задание со свободным ответом, c закреплён нулём).';

CREATE TABLE IF NOT EXISTS public.mock_result_3pl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.mock_results(id) ON DELETE CASCADE,
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,

  theta numeric NOT NULL,
  theta_se numeric,
  information numeric,
  iterations int,
  theta_status text NOT NULL,

  -- Балл считается ТОЙ ЖЕ трансформацией, что и действующий, — иначе разница
  -- пошла бы от разных шкал, а не от разных моделей.
  scaled_score numeric,
  scaled_score_max numeric,
  grade_level text,

  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_id)
);

COMMENT ON TABLE public.mock_result_3pl IS
  'Оценка ученика по 3PL — для сравнения с действующим баллом. Балл ученику ставит mock_results, эта таблица его не трогает.';

-- ═══ Права ═══
--
-- Как у mock_item_calibration (миграция 104): админ видит всё, учитель — свои
-- тесты. Ученику эти таблицы не нужны: он видит свой балл, а не калибровку.
ALTER TABLE public.mock_item_calibration_3pl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_result_3pl ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mock_item_calibration_3pl_admin ON public.mock_item_calibration_3pl;
CREATE POLICY mock_item_calibration_3pl_admin ON public.mock_item_calibration_3pl
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS mock_item_calibration_3pl_teacher ON public.mock_item_calibration_3pl;
CREATE POLICY mock_item_calibration_3pl_teacher ON public.mock_item_calibration_3pl
  FOR SELECT USING (
    public.is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_item_calibration_3pl.mock_test_id
        AND mt.created_by = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS mock_result_3pl_admin ON public.mock_result_3pl;
CREATE POLICY mock_result_3pl_admin ON public.mock_result_3pl
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS mock_result_3pl_teacher ON public.mock_result_3pl;
CREATE POLICY mock_result_3pl_teacher ON public.mock_result_3pl
  FOR SELECT USING (
    public.is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_result_3pl.mock_test_id
        AND mt.created_by = auth.uid()::text
    )
  );

CREATE INDEX IF NOT EXISTS idx_mock_item_calibration_3pl_test ON public.mock_item_calibration_3pl(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_result_3pl_test ON public.mock_result_3pl(mock_test_id);

NOTIFY pgrst, 'reload schema';
