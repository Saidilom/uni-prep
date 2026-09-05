-- Балл 0-75 не показывался НИ НА ОДНОМ моке: level_score был пуст во всех
-- строках mock_results. Единственным числом на экране результатов оставался
-- логит (θ), из-за чего это и заметили.
--
-- Как до этого дошло. Миграция 076 вычистила подставные level_score = 50,
-- которые старый код писал на вырожденной когорте, — это было правильно, 50 у
-- отличника и у двоечника не результат. Но заполниться заново им было не с
-- чего: пересчёт level_score запускает только новая сдача того же теста, а
-- пересдачи запрещены (§13). Существующие моки так и остались без балла.
--
-- Вторым слоем: даже свежий пересчёт вырожденному моку не помогал бы, потому
-- что /api/rasch/recalculate в этом случае намеренно писал NULL. Это поведение
-- снято вместе с этой миграцией — см. raschThetaToT в src/lib/rasch.ts.
--
-- Здесь — разовый ремонт уже накопленных строк. Формула повторяет
-- raschThetaToT (T = Z*10 + 50, клампы 0..75), пороги букв —
-- gradeLevelFromScore из src/lib/mock-grade-level.ts. Меняешь пороги там —
-- меняй и здесь; дублирование осознанное, разовую миграцию не хочется делать
-- зависимой от приложения.
--
-- Вырожденность определяется тем же признаком, что в коде: stddev_pop < 1e-6
-- (в TS stdev() возвращает 0 при length < 2 — Postgres на одной строке даёт
-- то же самое). В этом случае отсчёт идёт не от когорты, а от банка вопросов:
-- центр 0, разброс 1 логит, потому что estimateRasch центрирует сложности
-- вопросов через recenter() и theta уже абсолютна.
--
-- Строки без rasch_score не трогаются: у них нет исходных данных. Такая есть
-- одна — мок, результаты которого ещё не опубликованы, пересчёт для него не
-- запускался ни разу. Балл появится при нажатии «Готово».
WITH cohort AS (
  SELECT
    mock_test_id,
    avg(rasch_score) AS m,
    COALESCE(stddev_pop(rasch_score), 0) AS sd
  FROM public.mock_results
  WHERE rasch_score IS NOT NULL
  GROUP BY mock_test_id
), scored AS (
  SELECT
    mr.id,
    greatest(0, least(75, round(
      ((mr.rasch_score - CASE WHEN c.sd < 1e-6 THEN 0 ELSE c.m END)
       / CASE WHEN c.sd < 1e-6 THEN 1 ELSE c.sd END) * 10 + 50
    )))::int AS lvl
  FROM public.mock_results mr
  JOIN cohort c ON c.mock_test_id = mr.mock_test_id
  WHERE mr.rasch_score IS NOT NULL
    AND mr.level_score IS NULL
)
UPDATE public.mock_results mr
SET level_score = s.lvl,
    grade_level = CASE
      WHEN s.lvl >= 70 THEN 'A+'
      WHEN s.lvl >= 65 THEN 'A'
      WHEN s.lvl >= 60 THEN 'B+'
      WHEN s.lvl >= 55 THEN 'B'
      WHEN s.lvl >= 50 THEN 'C+'
      WHEN s.lvl >= 46 THEN 'C'
      ELSE 'below_c'
    END
FROM scored s
WHERE mr.id = s.id;
