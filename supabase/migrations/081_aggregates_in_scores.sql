-- §8, §12, §16: агрегаты считаются в баллах, а не в процентах.
--
-- Это отменяет прежнее правило из design/FIX.md («агрегаты — в процентах
-- accuracy»). Тогда оно было верным: у моков разная сумма баллов за задания, и
-- сравнивать их напрямую было нельзя. С появлением балла сертификата
-- (миграция 078) появилось общее основание, и владелец решил перевести все
-- средние в баллы. Проценты остаются только у вступительных тестов.
--
-- accuracy и балл сертификата — РАЗНЫЕ числа, а не одно в двух видах:
-- accuracy это доля сырых баллов за задания (36.5 из 100 → 37), а
-- level_score считается по модели Раша со своим потолком в level_score_max.
-- Поэтому функции не переименовываются, а начинают считать по другому полю.
--
-- Приведение к сотне обязательно: у английского потолок 75, у остальных 100.
-- Без него английская группа выглядела бы слабее любой другой просто из-за
-- более низкой шкалы. Решение владельца; та же арифметика в TS —
-- averageCertificateScore (src/lib/certificate-scale.ts).
--
-- Работы без посчитанного балла в среднее не входят: ноль вместо них занизил
-- бы группу, а «сравнивать не с чем» и «ноль баллов» — разные вещи.

-- ═══ Сводка по филиалам: балл + месячный ═══
--
-- Набор колонок меняется (avg_accuracy → avg_score, плюс avg_oylik), поэтому
-- CREATE OR REPLACE не годится — нужен DROP (см. CLAUDE.md).
--
-- Средний балл филиала по-прежнему считается как среднее из средних по
-- ГРУППАМ, а не среднее по всем работам разом: так большая группа не
-- перевешивает маленькую. Это исходное требование владельца из §5.
DROP FUNCTION IF EXISTS public.get_branch_overview();
CREATE FUNCTION public.get_branch_overview()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  class_count int,
  teacher_count int,
  student_count int,
  avg_score int,
  avg_oylik int
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
    (SELECT round(AVG(ca.avg_score))::int FROM class_avg ca WHERE ca.branch_id = v.id),
    (SELECT round(AVG(ca.avg_oylik))::int FROM class_avg ca WHERE ca.branch_id = v.id AND ca.avg_oylik IS NOT NULL)
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
  my_avg_score int,
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
  SELECT r.rnk::int, r.total::int, round(r.avg_score)::int, r.attempts
  FROM ranked r
  WHERE r.student_id = v_student_id;  -- наружу уходит одна строка: своя
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rating(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rating(text, text) TO authenticated;

-- ═══ Место ученика по предметам внутри группы ═══
DROP FUNCTION IF EXISTS public.get_my_class_subject_ranking(uuid);
CREATE FUNCTION public.get_my_class_subject_ranking(p_class_id uuid)
RETURNS TABLE (
  subject_id text,
  my_avg_score numeric,
  my_attempts int,
  my_rank int,
  total_students int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := auth.uid()::text;
BEGIN
  -- Проверка членства обязательна и сохранена из прежней версии: функция
  -- SECURITY DEFINER, и без неё чужую группу можно было бы просмотреть,
  -- подставив её id.
  IF NOT EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = p_class_id AND cm.student_id = v_student_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH class_students AS (
    SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id = p_class_id
  ),
  per_student_subject AS (
    SELECT
      cs.student_id AS student_id,
      mt.subject_id AS subject_id,
      AVG(mr.level_score / mr.level_score_max * 100) AS avg_score,
      COUNT(*) AS attempts
    FROM class_students cs
    JOIN public.mock_results mr ON mr.user_id = cs.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mt.subject_id IS NOT NULL
      AND mr.revealed_at IS NOT NULL
      AND mr.level_score IS NOT NULL
      AND mr.level_score_max > 0
    GROUP BY cs.student_id, mt.subject_id
  ),
  ranked AS (
    SELECT
      pss.student_id,
      pss.subject_id,
      pss.avg_score,
      pss.attempts,
      RANK() OVER (
        PARTITION BY pss.subject_id
        ORDER BY pss.avg_score DESC, pss.attempts DESC, pss.student_id ASC
      ) AS rnk,
      COUNT(*) OVER (PARTITION BY pss.subject_id) AS total
    FROM per_student_subject pss
  )
  SELECT r.subject_id, ROUND(r.avg_score, 1), r.attempts::int, r.rnk::int, r.total::int
  FROM ranked r
  WHERE r.student_id = v_student_id
  ORDER BY r.subject_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_class_subject_ranking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_class_subject_ranking(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
