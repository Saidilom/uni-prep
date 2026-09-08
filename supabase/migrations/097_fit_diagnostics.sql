-- Fit-диагностика: Infit, Outfit, ZSTD, point-measure. ТЗ модуль F.
--
-- ЗАЧЕМ. До этой миграции ни одно задание не было проверено на соответствие
-- модели. Значит задание с перепутанным ключом, дублирующее другое или просто
-- сломанное участвовало в измерении наравне с исправными, и заметить это было
-- нечем — ни на 90 работах сентября, ни на любых будущих.
--
-- ЧТО СЧИТАЕТСЯ (живая логика — src/lib/rasch-fit.ts, покрыта 28 тестами):
--
--   z_ni    = (X − P)/√(P(1−P))                    §F.3
--   Outfit  = (1/N)·Σ z²                           §F.4, чувствителен к выбросам
--   Infit   = Σ(X − P)² / Σ P(1−P)                 §F.5, взвешен информацией
--   ZSTD    = (MNSQ^⅓ − 1)·(3/q) + q/3             §F.9, Wilson–Hilferty
--   point-measure = corr(балл за задание, θ)       §F.11
--
-- Один и тот же аппарат применяется к заданиям и к персонам (§F.10): меняется
-- только то, по какой оси матрицы ответов суммируем.
--
-- ═══ НИКАКОГО АВТОМАТИЧЕСКОГО УДАЛЕНИЯ ═══
--
-- §224 требует прямо: пометить и оставить решение человеку. Поэтому здесь
-- только колонки со статистикой и текстовые флаги. Ни одно задание не
-- получает статус INVALID автоматически, ни один ответ не исключается из
-- расчёта балла. То же по §222 (локальная зависимость) и §223 (DIF).
--
-- Флаги:
--   MISFIT_UNDERFIT        MNSQ > 1.5 — шум, угадывание, многомерность (§F.8)
--   MISFIT_OVERFIT         MNSQ < 0.5 — зависимость или дублирование (§F.8)
--   NEGATIVE_POINT_MEASURE отрицательная корреляция — проверить ключ (§221)
--   WEAK_POINT_MEASURE     положительная, но от нуля неотличимая (§F.11)
--   TOO_FEW_OBSERVATIONS   наблюдений мало, о fit не судим

-- ═══ 1. Fit задания ═══

ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS infit numeric,
  ADD COLUMN IF NOT EXISTS outfit numeric,
  ADD COLUMN IF NOT EXISTS infit_zstd numeric,
  ADD COLUMN IF NOT EXISTS outfit_zstd numeric,
  ADD COLUMN IF NOT EXISTS point_measure numeric,
  ADD COLUMN IF NOT EXISTS fit_flags text[];

COMMENT ON COLUMN public.mock_item_calibration.infit IS
  'Infit MNSQ = Σ(X−P)²/ΣP(1−P) (§F.5). Взвешен информацией, устойчив к выбросам. 1.0 — идеальное соответствие.';
COMMENT ON COLUMN public.mock_item_calibration.outfit IS
  'Outfit MNSQ = (1/N)Σz² (§F.4). Чувствителен к выбросам: неожиданный ответ на очень лёгкое или трудное задание даёт большой z.';
COMMENT ON COLUMN public.mock_item_calibration.point_measure IS
  'Корреляция балла за задание с θ (§F.11). Обязана быть положительной; отрицательная — подозрение на ошибку ключа (§221).';
COMMENT ON COLUMN public.mock_item_calibration.fit_flags IS
  'Флаги диагностики. ФЛАГ, а не приговор: §224 запрещает удалять задания автоматически.';

-- ═══ 2. Fit персоны ═══
--
-- §F.10 и §N.1: тот же аппарат для строки ученика. Высокий Outfit персоны —
-- аномальный паттерн (лёгкие неверно, трудные верно).
--
-- §N.2 при этом прямо ограничивает выводы: модель Раша списывание НЕ детектит.
-- Она даёт сигнал, вердикта не выносит. Поэтому колонки называются fit, а не
-- «подозрение», и quality_status по ним автоматически не выставляется.
ALTER TABLE public.mock_results
  ADD COLUMN IF NOT EXISTS person_infit numeric,
  ADD COLUMN IF NOT EXISTS person_outfit numeric,
  ADD COLUMN IF NOT EXISTS person_infit_zstd numeric,
  ADD COLUMN IF NOT EXISTS person_outfit_zstd numeric,
  ADD COLUMN IF NOT EXISTS person_fit_flags text[];

COMMENT ON COLUMN public.mock_results.person_outfit IS
  'Outfit MNSQ персоны (§F.10). Высокий — аномальный паттерн ответов. §N.2: это сигнал на просмотр, а не вывод о списывании.';
COMMENT ON COLUMN public.mock_results.person_fit_flags IS
  'Флаги person-fit. Балл и уровень от них НЕ зависят: §215 требует различать «результат есть» и «результат доверенный», а не подменять одно другим.';

-- ═══ 3. Обзор для методиста ═══
--
-- Задания с флагами, по тестам. Нужен потому, что §224 оставляет решение
-- человеку — а значит человеку надо это увидеть, и не запросом руками.
--
-- Порядок: сначала подозрение на ключ (самое дорогое — неверный балл у всех,
-- кто отвечал), потом underfit (§F.8: опаснее для измерения, чем overfit),
-- потом остальное.
-- security_invoker обязателен. Без него view исполняется от имени владельца и
-- ЧИТАЕТ В ОБХОД RLS базовых таблиц: у mock_item_calibration политики есть, и
-- представление молча их обнулило бы — любой авторизованный увидел бы
-- диагностику по всем тестам. С флагом строки фильтруются политиками того, кто
-- смотрит. Postgres на проде 17.6, флаг поддерживается.
CREATE OR REPLACE VIEW public.mock_item_fit_review
WITH (security_invoker = true) AS
SELECT ic.mock_test_id,
       mt.title AS mock_test_title,
       mt.subject_id,
       ic.question_id,
       -- Колонка называется text, а не question_text: имя question_text есть у
       -- mock_answer_details, и я его сюда перенёс по ошибке — миграция на
       -- этом и упала, откатившись целиком.
       q.text AS question_text,
       ic.difficulty,
       ic.difficulty_se,
       ic.sample_size,
       ic.infit,
       ic.outfit,
       ic.infit_zstd,
       ic.outfit_zstd,
       ic.point_measure,
       ic.fit_flags,
       ic.item_status,
       ic.calibrated_at
FROM public.mock_item_calibration ic
JOIN public.mock_tests mt ON mt.id = ic.mock_test_id
LEFT JOIN public.mock_questions q ON q.id = ic.question_id
WHERE ic.fit_flags IS NOT NULL AND array_length(ic.fit_flags, 1) > 0;

COMMENT ON VIEW public.mock_item_fit_review IS
  'Задания с флагами fit-диагностики — для пересмотра человеком (§224: удалять автоматически нельзя).';

-- Доступ определяется политиками mock_item_calibration и mock_tests — именно
-- за это отвечает security_invoker выше.

-- Существующие 90 работ этой миграцией НЕ пересчитываются: колонки заполнятся
-- при следующем прогоне /api/rasch/recalculate. Балл, уровень и θ от fit не
-- зависят вовсе — это диагностика рядом с измерением, а не часть его.

NOTIFY pgrst, 'reload schema';
