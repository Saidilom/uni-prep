-- Миграция 124: провенанс модели для автовыбора 1PL/2PL/3PL по когорте.
--
-- Решение владельца от 2026-09-17: балл считается не всегда одной моделью
-- (сейчас — 3PL), а автоматически выбранной по числу реально сдавших тест —
-- 1PL при N<300, 2PL при 300≤N<1000, 3PL при N≥1000 (пороги и обоснование —
-- design/RASCH.md, «ДЕЙСТВУЮЩИЙ РАСЧЁТ» пункт 3, и Часть V.4).
--
-- До этой миграции провенанс модели жил ТОЛЬКО на уровне отдельного задания
-- (mock_item_calibration.difficulty_method/person_estimator — свободный
-- текст, без CHECK) — то есть узнать, какой моделью посчитан ТЕСТ или
-- КОНКРЕТНЫЙ результат, можно было только читая первую попавшуюся строку
-- калибровки (src/lib/class-utils.ts, fetchIrt3plReport). Раз теперь у
-- одного теста результаты со временем пересчитываются под РАЗНЫМИ моделями
-- по мере роста когорты, историческому баллу нужно самому знать, чем он
-- посчитан (§109, §197-198 RASCH.md) — отсюда колонки на mock_tests,
-- mock_results и mock_result_revisions, не только на калибровке заданий.
--
-- Проверено перед миграцией (supabase db query --linked):
--   select distinct difficulty_method, person_estimator from mock_item_calibration;
--   → единственное текущее значение: difficulty_method='3PL_MMLE',
--     person_estimator='MAP_NEWTON_3PL/3pl-1.1'. CHECK ниже их не оборвёт.
--   select count(*) from mock_tests where cohort_mu is not null; → 3
--   select count(*) from mock_item_calibration where discrimination is not null; → 124

-- ═══ mock_tests: чем и по какому N посчитан ТЕКУЩИЙ результат теста ═══
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS model_type text,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS model_sample_size int,
  ADD COLUMN IF NOT EXISTS model_selected_at timestamptz;

-- Бэкфилл: все уже посчитанные тесты сейчас на 3PL (единственная модель,
-- которая когда-либо считала балл в этом роуте).
UPDATE public.mock_tests
   SET model_type = 'IRT_3PL', model_version = '3pl-1.1'
 WHERE model_type IS NULL AND cohort_mu IS NOT NULL;

ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'IRT_2PL', 'IRT_3PL'));

COMMENT ON COLUMN public.mock_tests.model_type IS
  'RASCH_1PL | IRT_2PL | IRT_3PL. Растёт вместе с числом сдавших; сама не понижается (храповик, src/lib/irt-model-selection.ts selectModel).';
COMMENT ON COLUMN public.mock_tests.model_sample_size IS
  'N, по которому выбрана model_type — число сдавших минимум с одним объективным ответом на момент последнего пересчёта. НЕ равно cohort_n (тот — количество финальных θ ПОСЛЕ оценки способности, этот — вход в выбор модели ДО неё).';

-- ═══ mock_item_calibration: закрытый список моделей ═══
--
-- В отличие от difficulty_method/person_estimator (остаются без CHECK —
-- версия внутри них легитимно меняется без миграции), model_type — именно
-- закрытый идентификатор модели, его стоит защитить constraint'ом сразу.
ALTER TABLE public.mock_item_calibration ADD COLUMN IF NOT EXISTS model_type text;

UPDATE public.mock_item_calibration
   SET model_type = 'IRT_3PL'
 WHERE model_type IS NULL AND discrimination IS NOT NULL;

ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'IRT_2PL', 'IRT_3PL'));

ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_difficulty_method_check
  CHECK (difficulty_method IS NULL OR difficulty_method IN
    ('PROPORTION', 'JMLE', '1PL_JMLE', '2PL_MMLE', '3PL_MMLE'));

COMMENT ON COLUMN public.mock_item_calibration.discrimination IS
  'Параметр a. Под 1PL — технический a = 1/1.702 (не NULL): единственное значение, при котором формула 3PL алгебраически точно вырождается в классический Rasch, а не оценённая дискриминация. NULL остаётся только у строк ДО 2026-09-13.';

-- ═══ mock_results: провенанс на уровне ОТДЕЛЬНОГО результата ═══
ALTER TABLE public.mock_results
  ADD COLUMN IF NOT EXISTS model_type text,
  ADD COLUMN IF NOT EXISTS model_version text;

ALTER TABLE public.mock_results
  ADD CONSTRAINT mock_results_model_type_check
  CHECK (model_type IS NULL OR model_type IN ('RASCH_1PL', 'IRT_2PL', 'IRT_3PL'));

-- ═══ mock_result_revisions: то же у СНИМКА прежнего значения ═══
--
-- Без CHECK: это исторический снимок, в нём законно могут появиться значения
-- из будущих моделей, которых этот constraint ещё не знает.
ALTER TABLE public.mock_result_revisions
  ADD COLUMN IF NOT EXISTS model_type text,
  ADD COLUMN IF NOT EXISTS model_version text;

-- Этот шаг поведенчески no-op: /api/rasch/recalculate пока продолжает писать
-- жёстко 'IRT_3PL' до следующей миграции кода, которая подключит
-- src/lib/irt-model-selection.ts.

NOTIFY pgrst, 'reload schema';
