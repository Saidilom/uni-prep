-- 109. При удалении филиала его админ становится УЧЕНИКОМ, а не учителем.
--
-- Решение владельца (09.09.2026): «а почему если удалить филиал админ
-- становится учителем, так не должно быть — просто учеником должен быть и
-- всё». Роль админа филиала не подразумевает преподавания, и выдавать его в
-- нагрузку при удалении незачем.
--
-- Меняется только это. Всё остальное в delete_branch прежнее: группы и люди
-- сохраняются с пустым branch_id (обе связи ON DELETE SET NULL), роль
-- снимается ДО удаления, потому что после него найти этих людей будет не по
-- чему.
--
-- ═══ ЧТО ЗДЕСЬ МОЖЕТ ПОЙТИ НЕ ТАК ═══
--
-- Если админ филиала ВЕДЁТ группы (classes.teacher_id), после понижения они
-- останутся за учеником. Такой человек на проде есть один — админ филиала
-- «юнусабад» с четырьмя группами; у остальных четырёх админов групп нет.
-- Группы при этом не пропадут и результаты сохранятся, но вести их он больше
-- не сможет: доступ учителя к своим группам стоит на is_teacher().
--
-- Автоматически делать для таких исключение НЕ стали: это ровно то, что
-- владелец и запретил. Вместо этого функция возвращает, сколько групп осталось
-- за понижёнными, — число видно в ответе, и его можно показать до удаления.

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
  v_admin_classes int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  SELECT count(*) INTO v_classes FROM public.classes WHERE branch_id = p_branch_id;
  SELECT count(*) INTO v_members FROM public.users WHERE branch_id = p_branch_id;

  -- Группы, которые ведут понижаемые админы: считаем ДО понижения, иначе
  -- потом их уже не отличить от чужих.
  SELECT count(*) INTO v_admin_classes
  FROM public.classes c
  WHERE c.teacher_id IN (
    SELECT u.id FROM public.users u
    WHERE u.branch_id = p_branch_id AND u.role = 'branch_admin'
  );

  -- Роль снимается ДО удаления: после него branch_id обнулится связью, и
  -- найти этих людей будет не по чему.
  UPDATE public.users
  SET role = 'student'
  WHERE branch_id = p_branch_id AND role = 'branch_admin';
  GET DIAGNOSTICS v_admins = ROW_COUNT;

  -- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md).
  DELETE FROM public.branches WHERE id = p_branch_id;

  RETURN jsonb_build_object(
    'classes_orphaned', v_classes,
    'members_released', v_members,
    'admins_demoted', v_admins,
    'admin_taught_classes', v_admin_classes
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_branch(uuid) IS
  'Удаляет филиал. Группы и люди сохраняются с пустым branch_id, админ филиала переводится в УЧЕНИКА (решение владельца 09.09.2026).';

-- Та же справка до удаления: сколько групп ведёт сам админ филиала. Без неё
-- предупредить о последствиях заранее нечем.
DROP FUNCTION IF EXISTS public.branch_delete_impact(uuid);

CREATE FUNCTION public.branch_delete_impact(p_branch_id uuid)
RETURNS TABLE(classes integer, members integer, admin_name text, admin_taught_classes integer)
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
      LIMIT 1),
    (SELECT count(*)::int FROM public.classes c
      WHERE c.teacher_id IN (
        SELECT u.id FROM public.users u
        WHERE u.branch_id = p_branch_id AND u.role = 'branch_admin'
      ))
  WHERE public.is_admin();
$function$;

REVOKE ALL ON FUNCTION public.branch_delete_impact(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.branch_delete_impact(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
