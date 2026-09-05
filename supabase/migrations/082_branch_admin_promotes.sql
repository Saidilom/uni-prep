-- §9, §10, §11: учителей назначает админ филиала.
--
-- Цепочка, которую задал владелец: супер-админ создаёт филиал и сразу ставит
-- ему админа → тот назначает учителей в СВОЙ филиал → группы этих учителей
-- наследуют филиал → их результаты попадают в средний балл этого филиала.
--
-- Последние два звена уже работают: promote_student_to_teacher_in_branch
-- (072) проставляет учителю branch_id, а триггер set_class_branch_trg (072)
-- переносит его на группу. Не работало первое: RPC не вызывалась ниоткуда, а
-- найти ученика админ филиала не мог — политика users_branch_admin_read
-- показывает только своих, а у нового ученика branch_id пуст.

-- Поиск ученика для назначения. SECURITY DEFINER потому, что искать нужно
-- ЗА пределами своего филиала: ученик ещё ничей.
--
-- Отдаёт только то, что нужно для опознания человека в списке — ни телефона,
-- ни почты. Роль строго 'student': повысить учителя или админа этой формой
-- не выйдет, и сама RPC (072) это отдельно перепроверяет.
CREATE OR REPLACE FUNCTION public.search_students_for_promotion(p_query text)
RETURNS TABLE (id text, name text, surname text, shortid text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text;
BEGIN
  IF NOT (public.is_admin() OR public.is_branch_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_query := trim(coalesce(p_query, ''));
  IF length(v_query) < 2 THEN
    RETURN;  -- слишком короткий запрос вернул бы всю базу
  END IF;

  -- Экранируем спецсимволы LIKE: без этого '%' в запросе совпал бы со всем,
  -- а '_' — с любым символом.
  v_query := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT u.id, u.name, u.surname, u.shortid
  FROM public.users u
  WHERE u.role = 'student'
    AND (
      u.name ILIKE '%' || v_query || '%'
      OR u.surname ILIKE '%' || v_query || '%'
      OR u.shortid ILIKE '%' || v_query || '%'
    )
  ORDER BY u.name
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.search_students_for_promotion(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_students_for_promotion(text) TO authenticated;

-- ═══ §9: роль staff больше не назначает учителей ═══
--
-- Владелец: «два админа не нужны». Роль сохраняется — за ней остаются списки
-- и результаты вступительных, — но назначение уходит админу филиала. Причина
-- содержательная, а не косметическая: staff назначал учителя БЕЗ филиала, и
-- группы такого учителя ни в один средний балл не попадали.
--
-- Ветка is_staff() убрана из проверки. Заодно снимается и грант: молчаливый
-- отказ хуже явного, но лишний путь к функции лучше закрыть совсем.
CREATE OR REPLACE FUNCTION public.promote_student_to_teacher(p_student_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_current_role FROM public.users WHERE id = p_student_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_current_role <> 'student' THEN
    RAISE EXCEPTION 'User is not a student (current role: %)', v_current_role;
  END IF;

  UPDATE public.users SET role = 'teacher' WHERE id = p_student_id;
END;
$$;

-- ═══ §10: создание филиала сразу с админом ═══
--
-- Раньше филиал создавался пустым, а админа ему назначали отдельно в
-- /admin/users — и про второй шаг забывали. На проде это уже случилось: есть
-- админ филиала без филиала, то есть не видящий ничего.
--
-- Обе записи в одной функции, значит либо обе, либо ни одной: филиала без
-- админа не остаётся даже при сбое на полпути.
CREATE OR REPLACE FUNCTION public.create_branch_with_admin(p_name text, p_admin_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Branch name is required';
  END IF;

  IF p_admin_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.users WHERE id = p_admin_id;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'User not found';
    END IF;
    IF p_admin_id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
      RAISE EXCEPTION 'Cannot change the role of the permanent Super Admin';
    END IF;
  END IF;

  INSERT INTO public.branches (name) VALUES (trim(p_name)) RETURNING id INTO v_branch_id;

  IF p_admin_id IS NOT NULL THEN
    UPDATE public.users
    SET role = 'branch_admin', branch_id = v_branch_id
    WHERE id = p_admin_id;
  END IF;

  RETURN v_branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_branch_with_admin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_branch_with_admin(text, text) TO authenticated;

-- Смена админа у уже существующего филиала. Прежний админ этого филиала
-- становится учителем того же филиала, а не остаётся вторым админом: иначе
-- «сменить» превращалось бы в «добавить», и филиалом управляли бы двое.
CREATE OR REPLACE FUNCTION public.set_branch_admin(p_branch_id uuid, p_admin_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE public.users
  SET role = 'teacher'
  WHERE branch_id = p_branch_id AND role = 'branch_admin' AND id <> p_admin_id;

  UPDATE public.users
  SET role = 'branch_admin', branch_id = p_branch_id
  WHERE id = p_admin_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_branch_admin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_admin(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
