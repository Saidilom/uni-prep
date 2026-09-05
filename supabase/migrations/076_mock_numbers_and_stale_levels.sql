-- Две правки, обе про «какой это был мок и сколько за него на самом деле».
--
-- ═══ 1. Номера моков ═══
--
-- В базе лежат четыре теста с абсолютно одинаковым названием «Tarix fanidan
-- namunaviy test topshiriqlari» (26.08, 01.09 и два от 02.09), и ученики одной
-- группы сдавали РАЗНЫЕ из них. Ни в списке назначений, ни в результатах
-- ученика их было не различить — везде одна и та же строка.
--
-- Номер считается на лету, а не хранится колонкой: удаление или добавление
-- теста иначе оставило бы дыры и пересечения в уже показанных номерах.
-- Нумерация идёт внутри предмета по дате создания — так «Тарих №1» остаётся
-- первым по истории независимо от того, кому какой тест назначен.
--
-- SECURITY DEFINER здесь принципиален: у учителя RLS показывает только его
-- собственные и назначенные тесты, у админа — все. Считай функция номер по
-- видимым строкам, один и тот же тест был бы «№2» для учителя и «№4» для
-- админа, и номер перестал бы быть общим языком.
DROP FUNCTION IF EXISTS public.get_mock_numbers(uuid[]);
CREATE FUNCTION public.get_mock_numbers(p_ids uuid[])
RETURNS TABLE (mock_test_id uuid, seq int)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH numbered AS (
    SELECT
      mt.id,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(mt.subject_id, '(none)')
        ORDER BY mt.created_at, mt.id
      )::int AS seq
    FROM public.mock_tests mt
  )
  SELECT n.id, n.seq
  FROM numbered n
  WHERE n.id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.get_mock_numbers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mock_numbers(uuid[]) TO authenticated;

-- ═══ 2. Чистка подставных Rasch-баллов ═══
--
-- До миграции 071 raschThetaToT при вырожденной когорте возвращал ровно 50 —
-- середину шкалы — и это записывалось всем подряд. Пока балл был вторым числом
-- на экране, он читался как «предварительно»; после того как Rasch-балл стал
-- ГЛАВНЫМ баллом мока, те же 50 стали выглядеть как настоящий результат,
-- одинаковый у отличника и у двоечника.
--
-- Новый код такого больше не пишет (пишет NULL), но старые строки остались.
-- Критерий здесь буква в букву совпадает с cohortIsDegenerate в
-- src/app/api/rasch/recalculate/route.ts: меньше двух работ либо нулевой
-- разброс способностей — сравнивать не с чем.
--
-- Данные не теряются: score, accuracy и correct_answers не трогаются, а
-- level_score пересчитается сам при следующем запуске /api/rasch/recalculate,
-- когда мок сдаст достаточно людей.
UPDATE public.mock_results
SET level_score = NULL,
    grade_level = NULL
WHERE (level_score IS NOT NULL OR grade_level IS NOT NULL)
  AND mock_test_id IN (
    SELECT mock_test_id
    FROM public.mock_results
    GROUP BY mock_test_id
    HAVING count(*) < 2 OR COALESCE(stddev_pop(rasch_score), 0) < 1e-6
  );

NOTIFY pgrst, 'reload schema';
