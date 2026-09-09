-- 108. Удаление филиала и данные его админа в списке.
--
-- ═══ 1. УДАЛЕНИЕ ═══
--
-- Обе ссылки на branches объявлены ON DELETE SET NULL, поэтому сами по себе
-- группы и люди при удалении не пропадают — у них просто обнуляется филиал.
-- Но одного DELETE мало: у админа удалённого филиала осталась бы роль
-- branch_admin с пустым branch_id. Это в точности та поломка, про которую в
-- коде уже написано «на проде уже есть админ филиала без филиала»: человек
-- заходит в свой раздел и видит пустые страницы, потому что вся RLS там
-- завязана на current_branch_id().
--
-- Поэтому функция сначала снимает роль, и только потом удаляет.
--
-- Роль снимается в teacher, а не в student — тем же способом, что и при смене
-- админа в set_branch_admin. Человек уже вёл филиал, отбирать у него заодно и
-- преподавание было бы отдельным решением, которого никто не принимал.
--
-- Функция ВОЗВРАЩАЕТ, что именно осиротело: сколько групп и людей потеряли
-- филиал. Молча удалять две группы, о которых спросивший не знал, нельзя —
-- интерфейс показывает эти числа в подтверждении.
--
-- ═══ 2. АДМИН В СПИСКЕ ═══
--
-- get_branch_overview дополняется тремя полями: имя админа, его короткий ID и
-- почта. Короткий ID здесь не украшение — именно он показан в разделе
-- «Пользователи» и именно его вставляют при назначении, так что рядом с
-- филиалом он и нужен, чтобы сверить.

-- ═══ Сколько всего осиротеет — отдельно, чтобы спросить ДО удаления ═══
CREATE OR REPLACE FUNCTION public.branch_delete_impact(p_branch_id uuid)
RETURNS TABLE(classes integer, members integer, admin_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.classes c WHERE c.branch_id = p_branch_id),
    (SELECT count(*)::int FROM public.users u WHERE u.branch_id = p_branch_id),
    (SELECT trim(coalesce(u.name, '') || ' ' || coalesce(u.surname, ''))
       FROM public.users u
      WHERE u.branch_id = p_branch_id AND u.role = 'branch_admin'
      LIMIT 1)
  WHERE public.is_admin();
$function$;

REVOKE ALL ON FUNCTION public.branch_delete_impact(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.branch_delete_impact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_branch(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_classes int;
  v_members int;
  v_admins int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  SELECT count(*) INTO v_classes FROM public.classes WHERE branch_id = p_branch_id;
  SELECT count(*) INTO v_members FROM public.users WHERE branch_id = p_branch_id;

  -- Снимаем роль ДО удаления: после него branch_id уже обнулится связью, и
  -- найти этих людей будет не по чему.
  UPDATE public.users
  SET role = 'teacher'
  WHERE branch_id = p_branch_id AND role = 'branch_admin';
  GET DIAGNOSTICS v_admins = ROW_COUNT;

  -- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md).
  DELETE FROM public.branches WHERE id = p_branch_id;

  RETURN jsonb_build_object(
    'classes_orphaned', v_classes,
    'members_released', v_members,
    'admins_demoted', v_admins
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_branch(uuid) IS
  'Удаляет филиал. Группы и люди сохраняются с пустым branch_id, админ филиала переводится в teacher — иначе остался бы branch_admin без филиала.';

REVOKE ALL ON FUNCTION public.delete_branch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_branch(uuid) TO authenticated;

-- ═══ Админ филиала в сводке ═══
--
-- RETURNS TABLE меняется, поэтому DROP перед CREATE: CREATE OR REPLACE не
-- умеет менять список возвращаемых колонок (см. CLAUDE.md).
DROP FUNCTION IF EXISTS public.get_branch_overview();

CREATE FUNCTION public.get_branch_overview()
RETURNS TABLE(
  branch_id uuid, branch_name text, class_count integer, teacher_count integer,
  student_count integer, avg_score numeric, avg_oylik numeric,
  admin_id text, admin_name text, admin_short_id text, admin_login text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 1)
       FROM public.mock_results mr
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        )),
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 1)
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

NOTIFY pgrst, 'reload schema';
