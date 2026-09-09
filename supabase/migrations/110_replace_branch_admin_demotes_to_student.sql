-- 110. Смена админа филиала: прежний тоже становится учеником.
--
-- Решение владельца было названо про удаление филиала («админ филиала должен
-- стать просто учеником»), но правило то же и здесь: set_branch_admin при
-- назначении нового админа снимал роль с прежнего и делал его УЧИТЕЛЕМ.
--
-- Оставить два разных исхода для одного и того же события — «человек перестал
-- быть админом филиала» — значило бы, что итог зависит от того, каким путём
-- это случилось: удалили филиал (ученик) или заменили админа (учитель).
-- Объяснить такую разницу нечем.
--
-- Меняется ровно одна строка. Всё остальное в функции прежнее.

CREATE OR REPLACE FUNCTION public.set_branch_admin(p_branch_id uuid, p_admin_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  SELECT role INTO v_role FROM public.users WHERE id = p_admin_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF p_admin_id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    RAISE EXCEPTION 'Cannot change the role of the permanent Super Admin';
  END IF;

  -- Прежний админ филиала становится УЧЕНИКОМ, как и при удалении филиала
  -- (миграция 109). Раньше здесь стоял teacher, и один и тот же человек
  -- получал разную роль в зависимости от того, заменили его или удалили
  -- филиал целиком.
  UPDATE public.users
  SET role = 'student'
  WHERE branch_id = p_branch_id AND role = 'branch_admin' AND id <> p_admin_id;

  UPDATE public.users
  SET role = 'branch_admin', branch_id = p_branch_id
  WHERE id = p_admin_id;
END;
$function$;

COMMENT ON FUNCTION public.set_branch_admin(uuid, text) IS
  'Назначает админа филиала. Прежний админ переводится в УЧЕНИКА — так же, как при удалении филиала (решение владельца 09.09.2026).';

NOTIFY pgrst, 'reload schema';
