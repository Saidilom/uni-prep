-- 115. Отчётные средние — с двумя знаками после запятой.
--
-- ═══ ЗАЧЕМ ═══
--
-- Решение владельца от 2026-09-11: балл показывается с двумя знаками
-- (SCORE_DECIMALS в src/lib/certificate-scale.ts). Это точность ПОКАЗА:
-- level_score в базе и так лежит неокруглённым, пересчитывать нечего.
--
-- Но средние по филиалу и рейтинг класса округляются не в коде, а здесь, в SQL.
-- Оставь их на одном знаке — и на экране рядом встанут «30,2» и «30,20»:
-- formatScore допечатает второй знак нулём, и он пообещает точность, которой у
-- числа нет. Поэтому знак меняется в обоих местах разом.
--
-- Тела функций взяты из ДЕЙСТВУЮЩИХ определений (pg_get_functiondef) и не
-- переписаны: изменено ровно три числа — второй аргумент round(). Так правка
-- видна целиком и не может незаметно поменять что-то ещё.
--
-- DROP FUNCTION не нужен: набор и типы возвращаемых колонок те же.

CREATE OR REPLACE FUNCTION public.get_branch_overview()
 RETURNS TABLE(branch_id uuid, branch_name text, class_count integer, teacher_count integer, student_count integer, avg_score numeric, avg_oylik numeric, admin_id text, admin_name text, admin_short_id text, admin_login text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Приведение к общей шкале обязательно: у английского потолок 75, у
    -- остальных 100. Без него английская группа выглядела бы слабее только
    -- из-за шкалы.
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 2)
       FROM public.mock_results mr
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        )),
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 2)
       FROM public.mock_results mr
       JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND mt.oylik_set_id IN (SELECT id FROM latest_set)
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        )),
    -- Админ филиала. LIMIT 1 не произвол: set_branch_admin снимает роль со
    -- всех прежних, поэтому админ у филиала один. Если их вдруг окажется два,
    -- это поломка данных, и показать одного лучше, чем упасть.
    (SELECT u.id FROM public.users u
      WHERE u.branch_id = v.id AND u.role = 'branch_admin' LIMIT 1),
    (SELECT trim(coalesce(u.name, '') || ' ' || coalesce(u.surname, ''))
       FROM public.users u
      WHERE u.branch_id = v.id AND u.role = 'branch_admin' LIMIT 1),
    -- Короткий ID: именно он показан в разделе «Пользователи» и именно его
    -- вставляют при назначении, поэтому рядом с филиалом он и нужен.
    (SELECT u.shortid FROM public.users u
      WHERE u.branch_id = v.id AND u.role = 'branch_admin' LIMIT 1),
    (SELECT u.email FROM public.users u
      WHERE u.branch_id = v.id AND u.role = 'branch_admin' LIMIT 1)
  FROM visible v
  ORDER BY v.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_class_subject_ranking(p_class_id uuid)
 RETURNS TABLE(subject_id text, my_avg_score numeric, my_attempts integer, my_rank integer, total_students integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AVG(mr.level_score / mr.level_score_max * 75) AS avg_score,
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
  SELECT r.subject_id, ROUND(r.avg_score, 2), r.attempts::int, r.rnk::int, r.total::int
  FROM ranked r
  WHERE r.student_id = v_student_id
  ORDER BY r.subject_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
