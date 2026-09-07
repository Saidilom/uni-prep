-- Средние — тоже с десятой.
--
-- После миграции 085 балл ученика дробный, а средние по группе, филиалу и
-- рейтингу продолжали возвращаться как int. Группа из 66.4 / 67.3 / 68.1
-- показывала среднее «67» — та же жалоба владельца, только уровнем выше.
--
-- Меняется ТИП возвращаемых колонок, поэтому CREATE OR REPLACE не годится —
-- нужен DROP перед CREATE (см. CLAUDE.md). Тела функций перенесены из миграции
-- 081 без изменений: правится ровно две вещи — тип колонки и round(...) → 1
-- знак. Живые определения перед этим сверены с 081 (pg_get_functiondef),
-- расхождений не было; REVOKE/GRANT восстанавливаются ниже, иначе DROP снёс бы
-- права на EXECUTE.
--
-- Порядок ранжирования НЕ меняется: RANK() и там, и тут сортирует по
-- неокруглённому avg_score, округление только на выходе.
--
-- get_my_class_subject_ranking не трогаем — она с самого начала отдаёт
-- ROUND(avg_score, 1).

-- ═══ Сводка по филиалам ═══
DROP FUNCTION IF EXISTS public.get_branch_overview();
CREATE FUNCTION public.get_branch_overview()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  class_count int,
  teacher_count int,
  student_count int,
  avg_score numeric,
  avg_oylik numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT b.id, b.name
    FROM public.branches b
    WHERE public.is_admin()
       OR (public.is_branch_admin() AND b.id = public.current_branch_id())
  ),
  -- §12: месячный балл считается по ПОСЛЕДНЕМУ опубликованному комплекту.
  -- Решение владельца: так видно, как филиал сдал в этом месяце, а не
  -- усреднённую за всё время картину, в которой плохой месяц растворяется.
  latest_set AS (
    SELECT id FROM public.oylik_sets
    WHERE published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 1
  ),
  class_avg AS (
    SELECT
      c.id AS class_id,
      c.branch_id,
      AVG(mr.level_score / mr.level_score_max * 100) AS avg_score,
      AVG(mr.level_score / mr.level_score_max * 100)
        FILTER (WHERE mt.oylik_set_id IN (SELECT id FROM latest_set)) AS avg_oylik
    FROM public.classes c
    JOIN public.class_members cm ON cm.class_id = c.id
    JOIN public.mock_results mr ON mr.user_id = cm.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE c.branch_id IS NOT NULL
      AND mr.revealed_at IS NOT NULL
      AND mr.level_score IS NOT NULL
      AND mr.level_score_max > 0
    GROUP BY c.id, c.branch_id
  )
  SELECT
    v.id,
    v.name,
    (SELECT count(*)::int FROM public.classes c WHERE c.branch_id = v.id),
    (SELECT count(*)::int FROM public.users u WHERE u.branch_id = v.id AND u.role = 'teacher'),
    (SELECT count(DISTINCT cm.student_id)::int
       FROM public.class_members cm
       JOIN public.classes c ON c.id = cm.class_id
      WHERE c.branch_id = v.id),
    (SELECT round(AVG(ca.avg_score), 1) FROM class_avg ca WHERE ca.branch_id = v.id),
    (SELECT round(AVG(ca.avg_oylik), 1) FROM class_avg ca WHERE ca.branch_id = v.id AND ca.avg_oylik IS NOT NULL)
  FROM visible v
  ORDER BY v.name;
$$;

REVOKE ALL ON FUNCTION public.get_branch_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_overview() TO authenticated;

-- ═══ Рейтинг ученика ═══
DROP FUNCTION IF EXISTS public.get_my_rating(text, text);
CREATE FUNCTION public.get_my_rating(p_kind text, p_scope text)
RETURNS TABLE (
  my_rank int,
  total_students int,
  my_avg_score numeric,
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

  SELECT c.branch_id INTO v_branch_id
  FROM public.class_members cm
  JOIN public.classes c ON c.id = cm.class_id
  WHERE cm.student_id = v_student_id AND c.branch_id IS NOT NULL
  LIMIT 1;

  IF p_scope = 'branch' AND v_branch_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH peers AS (
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
      AVG(mr.level_score / mr.level_score_max * 100) AS avg_score,
      count(*)::int AS attempts
    FROM peers p
    JOIN public.mock_results mr ON mr.user_id = p.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mr.revealed_at IS NOT NULL
      AND mr.level_score IS NOT NULL
      AND mr.level_score_max > 0
      AND (p_kind = 'overall' OR mt.oylik_set_id IS NOT NULL)
    GROUP BY p.student_id
  ),
  ranked AS (
    SELECT
      s.student_id,
      s.avg_score,
      s.attempts,
      RANK() OVER (ORDER BY s.avg_score DESC, s.attempts DESC, s.student_id ASC) AS rnk,
      count(*) OVER () AS total
    FROM scored s
  )
  SELECT r.rnk::int, r.total::int, round(r.avg_score, 1), r.attempts
  FROM ranked r
  WHERE r.student_id = v_student_id;  -- наружу уходит одна строка: своя
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rating(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rating(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
