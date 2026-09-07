-- Админ филиала сам добавляет учителя в свой филиал по ID.
--
-- Было: поиск в разделе «Учителя филиала» искал ТОЛЬКО учеников
-- (search_students_for_promotion, `WHERE u.role = 'student'`). Админ вводил ID
-- существующего учителя, ничего не находилось, и экран говорил «Учеников не
-- найдено» — сообщение про не тот тип пользователя. Чтобы учитель появился в
-- филиале, супер-админу приходилось идти в «Пользователи» и проставлять филиал
-- руками каждому.
--
-- Стало: поиск находит и учеников, и учителей, и сразу говорит, в каком филиале
-- учитель сейчас числится, — чтобы экран мог предложить нужное действие
-- (сделать учителем / добавить в филиал / перевести) вместо одинаковой кнопки.

-- ═══ 1. Поиск кандидатов ═══
--
-- Функция переименована: прежнее имя обещало «учеников для повышения», а
-- теперь она ищет и учителей — оставлять старое значило бы врать в названии.
-- Набор колонок меняется, поэтому DROP перед CREATE (см. CLAUDE.md).
--
-- SECURITY DEFINER здесь обязателен и осознан: users_branch_admin_read
-- показывает админу филиала только СВОИХ, а найти нужно и учителя из чужого
-- филиала — иначе перевод невозможен. Наружу отдаём только имя, ID и название
-- филиала, ничего лишнего.
DROP FUNCTION IF EXISTS public.search_students_for_promotion(text);

CREATE FUNCTION public.search_branch_teacher_candidates(p_query text)
RETURNS TABLE (
  id text,
  name text,
  surname text,
  shortid text,
  role text,
  branch_name text,
  in_my_branch boolean
)
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
  SELECT
    u.id,
    u.name,
    u.surname,
    u.shortid,
    u.role,
    b.name,
    (u.branch_id IS NOT NULL AND u.branch_id = public.current_branch_id())
  FROM public.users u
  LEFT JOIN public.branches b ON b.id = u.branch_id
  WHERE u.role IN ('student', 'teacher')
    AND (
      u.name ILIKE '%' || v_query || '%'
      OR u.surname ILIKE '%' || v_query || '%'
      OR u.shortid ILIKE '%' || v_query || '%'
    )
  -- Учителя выше учеников: искали чаще всего именно их.
  ORDER BY (u.role = 'teacher') DESC, u.name
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.search_branch_teacher_candidates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_branch_teacher_candidates(text) TO authenticated;

-- ═══ 2. Привязка существующего учителя к филиалу ═══
--
-- Отдельная функция, а не ветка в promote_student_to_teacher_in_branch: там
-- действие другое (повышение ученика) и подтверждение на экране другое. Роль
-- здесь не меняется вовсе — только филиал.
--
-- Перевод учителя из чужого филиала разрешён (решение владельца). Уже созданные
-- им группы при этом остаются в старом филиале: set_class_branch_trg стоит
-- только на INSERT, поэтому задним числом ничего не переезжает и прошлые
-- результаты не меняют филиал. Новые группы пойдут уже в новый.
CREATE OR REPLACE FUNCTION public.assign_teacher_to_branch(
  p_teacher_id text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_branch uuid;
BEGIN
  IF public.is_admin() THEN
    v_branch := p_branch_id;
  ELSIF public.is_branch_admin() THEN
    -- Свой филиал и только свой: p_branch_id от него не принимается вовсе.
    v_branch := public.current_branch_id();
    IF v_branch IS NULL THEN
      RAISE EXCEPTION 'Branch admin has no branch assigned';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_teacher_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  -- Отдельная ошибка про роль: экран показывает «это не учитель», а не общее
  -- «не найдено» — ровно та путаница, с которой всё началось.
  IF v_role <> 'teacher' THEN
    RAISE EXCEPTION 'User is not a teacher (current role: %)', v_role;
  END IF;

  UPDATE public.users SET branch_id = v_branch WHERE id = p_teacher_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_teacher_to_branch(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_teacher_to_branch(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
