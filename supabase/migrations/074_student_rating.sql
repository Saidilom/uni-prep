-- §7 из design/FIX.md: раздел «Рейтинг» у ученика.
--
-- Два рейтинга (по последнему ойлик-тесту и по среднему баллу) в трёх областях
-- (группа / филиал / вся платформа).
--
-- Функция построена по образцу get_my_class_subject_ranking (037 → 060) и
-- повторяет два его ключевых свойства:
--
--   1. Ученику возвращается ТОЛЬКО его собственное место и общее число
--      участников. Чужие строки не уходят наружу никогда — RLS на mock_results
--      специально ограничивает ученика его собственными результатами, и
--      рейтинг не должен становиться обходным путём к чужим баллам.
--   2. Обязательный фильтр revealed_at IS NOT NULL. Без него рейтинг протекал
--      бы баллами ещё не опубликованных работ — ровно эту дыру закрывала
--      миграция 060, и здесь её нельзя открыть заново.
--
-- Место считается по AVG(accuracy), а не по сумме баллов: в филиале и на
-- платформе ученики сдают разные тесты с разной суммой баллов, и только доля от
-- максимума между ними сопоставима (см. «Правило отображения баллов»).

DROP FUNCTION IF EXISTS public.get_my_rating(text, text);
CREATE FUNCTION public.get_my_rating(p_kind text, p_scope text)
RETURNS TABLE (
  my_rank int,
  total_students int,
  my_avg_accuracy int,
  my_attempts int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := auth.uid()::text;
  v_branch_id uuid;
BEGIN
  IF p_kind NOT IN ('overall', 'oylik') THEN
    RAISE EXCEPTION 'Unknown rating kind: %', p_kind;
  END IF;
  IF p_scope NOT IN ('class', 'branch', 'platform') THEN
    RAISE EXCEPTION 'Unknown rating scope: %', p_scope;
  END IF;

  -- Филиал ученика — через его группы: у самого ученика branch_id не
  -- проставляется, филиал есть у учителя и у группы.
  SELECT c.branch_id INTO v_branch_id
  FROM public.class_members cm
  JOIN public.classes c ON c.id = cm.class_id
  WHERE cm.student_id = v_student_id AND c.branch_id IS NOT NULL
  LIMIT 1;

  IF p_scope = 'branch' AND v_branch_id IS NULL THEN
    RETURN; -- ученик не приписан ни к одному филиалу — сравнивать не с кем
  END IF;

  RETURN QUERY
  WITH peers AS (
    -- Круг сравнения. Для группы и филиала — ученики тех же групп; для
    -- платформы — все, у кого вообще есть опубликованный результат.
    SELECT DISTINCT cm.student_id
    FROM public.class_members cm
    JOIN public.classes c ON c.id = cm.class_id
    WHERE p_scope <> 'platform'
      AND (
        (p_scope = 'class' AND cm.class_id IN (
          SELECT class_id FROM public.class_members WHERE student_id = v_student_id
        ))
        OR (p_scope = 'branch' AND c.branch_id = v_branch_id)
      )
    UNION
    SELECT DISTINCT mr.user_id
    FROM public.mock_results mr
    WHERE p_scope = 'platform' AND mr.revealed_at IS NOT NULL
  ),
  scored AS (
    SELECT
      p.student_id,
      AVG(mr.accuracy) AS avg_accuracy,
      count(*)::int AS attempts
    FROM peers p
    JOIN public.mock_results mr ON mr.user_id = p.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mr.revealed_at IS NOT NULL
      -- 'oylik' сужает выборку до тестов из комплектов; 'overall' берёт все.
      AND (p_kind = 'overall' OR mt.oylik_set_id IS NOT NULL)
    GROUP BY p.student_id
  ),
  ranked AS (
    SELECT
      s.student_id,
      s.avg_accuracy,
      s.attempts,
      RANK() OVER (ORDER BY s.avg_accuracy DESC, s.attempts DESC, s.student_id ASC) AS rnk,
      count(*) OVER () AS total
    FROM scored s
  )
  SELECT r.rnk::int, r.total::int, round(r.avg_accuracy)::int, r.attempts
  FROM ranked r
  WHERE r.student_id = v_student_id;  -- наружу уходит одна строка: своя
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rating(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rating(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
