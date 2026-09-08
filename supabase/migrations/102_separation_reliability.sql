-- 102. Separation и reliability варианта. ТЗ §N.5.
--
-- Сводка живёт на mock_tests рядом с q3_*/pca_* (миграция 098): это
-- характеристика ВАРИАНТА и когорты, которая его писала, а не отдельной работы.
-- Одна строка на вариант, переписывается при каждом пересчёте.
--
-- ═══ ПОЧЕМУ КОЛОНОК СТОЛЬКО, А НЕ ДВЕ ═══
--
-- Хранить одну reliability мало: число 0.5 не говорит, тест ли плох, когорта ли
-- однородна, или всё испортила одна крайняя работа. Разложение на SD и RMSE
-- отвечает на это сразу, без повторного прогона модели:
--
--   SD_observed  — насколько вообще разошлись ученики;
--   RMSE         — насколько точно мы каждого померили;
--   SD_true      — что осталось от разброса после вычета погрешности.
--
-- На реальных данных это и понадобилось. У математики person reliability 0.495,
-- и по одному числу вывод был бы «тест не работает». На деле SD_true = 0.52
-- против RMSE = 0.52 — разброс есть, но измерение грубое, и виновата ОДНА
-- работа с нулём верных: её SE 2.18 против 0.38 у остальных, а в RMSE она
-- входит квадратом. Без неё reliability 0.736.
--
-- ═══ ПОЧЕМУ КРАЙНИЕ МЕРЫ ИСКЛЮЧЕНЫ ИЗ ОСНОВНОГО ЧИСЛА ═══
--
-- У работы с нулём верных (или со всеми верными) способности по Рашу не
-- существует: правдоподобие монотонно, максимум уходит в бесконечность. Число,
-- которое мы для неё показываем, получено соглашением — поправкой 0.3
-- (Wright & Panchapakesan), — и её SE не измерена, а назначена. Пускать
-- назначенную SE в RMSE наравне с измеренными значит портить оценку точности
-- теста данными, которых нет.
--
-- Поэтому основное число считается без крайних мер, но:
--   * сколько их было — в *_extreme_count, и это видно;
--   * person_reliability_with_extremes хранит вариант со всеми, чтобы решение
--     об исключении можно было проверить, а не принять на веру.
-- §233: никаких молчаливых подстановок — обе величины лежат рядом.

alter table public.mock_tests
    -- ── Персоны ──
    add column if not exists person_separation numeric,
    add column if not exists person_reliability numeric,
    add column if not exists person_strata numeric,
    add column if not exists person_sd_observed numeric,
    add column if not exists person_rmse numeric,
    add column if not exists person_sd_true numeric,
    add column if not exists person_measure_count integer,
    add column if not exists person_extreme_count integer,
    -- Тот же расчёт со всеми работами: показывает цену исключения.
    add column if not exists person_reliability_with_extremes numeric,
    -- OK | NOT_SEPARABLE | TOO_FEW. §217: отсутствие разделения — это статус,
    -- а не нулевая надёжность, иначе «не смогли измерить» читалось бы как
    -- «измерили и вышло плохо».
    add column if not exists person_separation_status text,

    -- ── Задания ──
    add column if not exists item_separation numeric,
    add column if not exists item_reliability numeric,
    add column if not exists item_strata numeric,
    add column if not exists item_sd_observed numeric,
    add column if not exists item_rmse numeric,
    add column if not exists item_sd_true numeric,
    add column if not exists item_measure_count integer,
    add column if not exists item_extreme_count integer,
    add column if not exists item_separation_status text,

    add column if not exists separation_at timestamptz;

alter table public.mock_tests
    drop constraint if exists mock_tests_person_separation_status_check;
alter table public.mock_tests
    add constraint mock_tests_person_separation_status_check
    check (person_separation_status is null
           or person_separation_status in ('OK', 'NOT_SEPARABLE', 'TOO_FEW'));

alter table public.mock_tests
    drop constraint if exists mock_tests_item_separation_status_check;
alter table public.mock_tests
    add constraint mock_tests_item_separation_status_check
    check (item_separation_status is null
           or item_separation_status in ('OK', 'NOT_SEPARABLE', 'TOO_FEW'));

-- Надёжность — доля дисперсии, она обязана лежать в 0…1. Ограничение здесь не
-- «на всякий случай»: отрицательная величина означала бы, что SD_true² ушёл в
-- минус и всё-таки просочился корнем, — ровно та ошибка, ради которой в коде
-- заведён статус NOT_SEPARABLE.
alter table public.mock_tests
    drop constraint if exists mock_tests_reliability_range_check;
alter table public.mock_tests
    add constraint mock_tests_reliability_range_check
    check ((person_reliability is null or (person_reliability >= 0 and person_reliability <= 1))
       and (item_reliability is null or (item_reliability >= 0 and item_reliability <= 1))
       and (person_reliability_with_extremes is null
            or (person_reliability_with_extremes >= 0 and person_reliability_with_extremes <= 1)));

comment on column public.mock_tests.person_separation is
    'G = SD_true/RMSE по ученикам, без крайних баллов (§N.5)';
comment on column public.mock_tests.person_reliability is
    'G²/(1+G²) по ученикам, без крайних баллов. Ориентир высоких ставок ≥ 0.8 (§N.5)';
comment on column public.mock_tests.person_strata is
    '(4G+1)/3 — сколько статистически различимых уровней даёт тест (§N.5)';
comment on column public.mock_tests.person_reliability_with_extremes is
    'То же со всеми работами, включая крайние баллы: цена исключения видна';
comment on column public.mock_tests.item_reliability is
    'Надёжность порядка сложностей заданий: воспроизведётся ли он на другой когорте (§N.5)';

notify pgrst, 'reload schema';
