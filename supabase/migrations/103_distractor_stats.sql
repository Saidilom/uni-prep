-- 103. Анализ дистракторов закрытых заданий. ТЗ §R.7.
--
-- Одна строка на пару «задание × вариант»: доля выбравших, средняя θ выбравших
-- и флаги. Заполняется из /api/rasch/recalculate, как калибровка и Q3-флаги.
--
-- ═══ ПОЧЕМУ ЧИТАТЬ МОГУТ ТОЛЬКО АДМИН И УЧИТЕЛЬ ═══
--
-- Это единственная диагностическая таблица в проекте, которая РАСКРЫВАЕТ
-- ПРАВИЛЬНЫЙ ОТВЕТ. Причём двумя независимыми путями: колонкой is_correct
-- напрямую и через mean_theta — вариант с самой высокой средней способностью
-- почти всегда верный.
--
-- Поэтому здесь НЕ используется can_access_mock(), как в mock_q3_flags: та
-- таблица говорит «у этих двух заданий связаны остатки» и ключа не выдаёт, а
-- эта выдаёт. Ученик, которому доступен мок, не должен иметь возможности
-- прочитать ответы к нему до сдачи.
--
-- ═══ ПОЧЕМУ ТАБЛИЦА ПЛОСКАЯ ═══
--
-- respondents, omitted, correct_mean_theta и question_status одинаковы у всех
-- строк одного задания — это денормализация. Сделано осознанно: отчёт читается
-- одной выборкой без join, а строк здесь порядка «заданий × вариантов» (на
-- нашем самом большом варианте 130 × 4 ≈ 520), то есть экономить нечего.
-- Целостность держится тем, что все строки задания пишутся одной транзакцией
-- пересчёта и никогда не правятся по одной.
--
-- ═══ ФЛАГИ, А НЕ УДАЛЕНИЕ ═══
--
-- §222 и §224: помеченное задание остаётся в расчёте. Ни одного механизма
-- автоматического исключения здесь нет и быть не должно — флаг это повод
-- посмотреть глазами, а решение принимает человек.

CREATE TABLE IF NOT EXISTS public.mock_distractor_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mock_questions(id) ON DELETE CASCADE,

  -- Ключ варианта, как он лежит в mock_questions.options: 'a', 'b', …
  option_key text NOT NULL,
  is_correct boolean NOT NULL,

  choice_count integer NOT NULL,
  -- Доля от ОТВЕТИВШИХ, не от всех сдававших. У множественного выбора сумма
  -- долей по варианту может превышать 1 — один ученик отмечает несколько.
  choice_share numeric NOT NULL,
  -- Средняя θ выбравших этот вариант. NULL — не выбрал никто.
  mean_theta numeric,
  flags text[] NOT NULL DEFAULT '{}',

  -- Контекст задания (одинаков у всех его строк, см. шапку).
  respondents integer NOT NULL,
  omitted integer NOT NULL,
  correct_mean_theta numeric,
  -- OK | TOO_FEW_RESPONSES | NO_CORRECT_RESPONSES.
  question_status text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mock_distractor_stats IS
  'Разбор закрытых заданий по вариантам (§R.7). РАСКРЫВАЕТ КЛЮЧ — читают только админ и учитель. ФЛАГИ: §222 запрещает удалять задания автоматически.';
COMMENT ON COLUMN public.mock_distractor_stats.mean_theta IS
  'Средняя способность выбравших вариант. Выше, чем у верного варианта → подозрение на ошибку ключа';
COMMENT ON COLUMN public.mock_distractor_stats.flags IS
  'OUTPERFORMS_CORRECT | DEAD_DISTRACTOR | LOW_COUNT. Ставятся только при respondents >= 10';

CREATE UNIQUE INDEX IF NOT EXISTS mock_distractor_stats_option_uq
  ON public.mock_distractor_stats (mock_test_id, question_id, option_key);

-- Отчёт всегда начинается с помеченных заданий, а их меньшинство.
CREATE INDEX IF NOT EXISTS mock_distractor_stats_flagged_idx
  ON public.mock_distractor_stats (mock_test_id)
  WHERE array_length(flags, 1) > 0;

ALTER TABLE public.mock_distractor_stats
  DROP CONSTRAINT IF EXISTS mock_distractor_stats_status_check;
ALTER TABLE public.mock_distractor_stats
  ADD CONSTRAINT mock_distractor_stats_status_check
  CHECK (question_status IN ('OK', 'TOO_FEW_RESPONSES', 'NO_CORRECT_RESPONSES'));

ALTER TABLE public.mock_distractor_stats
  DROP CONSTRAINT IF EXISTS mock_distractor_stats_counts_check;
ALTER TABLE public.mock_distractor_stats
  ADD CONSTRAINT mock_distractor_stats_counts_check
  CHECK (choice_count >= 0 AND respondents >= 0 AND omitted >= 0 AND choice_share >= 0);

ALTER TABLE public.mock_distractor_stats ENABLE ROW LEVEL SECURITY;

-- Только админ и учитель. Ученику нельзя: см. шапку — таблица содержит ключ.
-- INSERT-политики нет ни для кого: пишет service-role из /api/rasch/recalculate.
DROP POLICY IF EXISTS mock_distractor_stats_read ON public.mock_distractor_stats;
CREATE POLICY mock_distractor_stats_read ON public.mock_distractor_stats
  FOR SELECT USING (public.is_admin() OR public.is_teacher());

-- ═══ Сводка по варианту ═══
--
-- Без знаменателя число флагов не читается: «19 подозрений на ошибку ключа»
-- это одно на варианте из 20 заданий и совсем другое на варианте из 130.
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS distractor_questions_checked integer,
  ADD COLUMN IF NOT EXISTS distractor_questions_flagged integer,
  -- Подозрения на ошибку ключа: средняя θ дистрактора выше верного варианта.
  ADD COLUMN IF NOT EXISTS distractor_key_suspects integer,
  -- Варианты, которые не выбрал никто.
  ADD COLUMN IF NOT EXISTS distractor_dead_options integer,
  ADD COLUMN IF NOT EXISTS distractor_at timestamptz;

NOTIFY pgrst, 'reload schema';
