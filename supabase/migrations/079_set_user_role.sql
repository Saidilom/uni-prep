-- Смена роли в супер-админке молча не срабатывала (жалоба: «админ филиала →
-- ученик» не меняется).
--
-- База при этом исправна: под личиной супер-админа с включённой RLS видны все
-- строки users, is_admin() истинна, политика users_admin_full_access —
-- FOR ALL USING (is_admin()), поколоночных ограничений на role нет, CHECK-
-- констрейнта нет, ветка триггера для админа разрешающая. Postgres такой
-- UPDATE принял бы.
--
-- Проблема в том, что у прямого UPDATE через PostgREST отказ ВЫГЛЯДИТ как
-- успех. Если RLS не пропустит строку, апдейт затронет ноль строк и вернёт
-- 204 без ошибки; если триггер вернёт NEW.role к OLD.role — тоже тишина. На
-- этот класс поломки в проекте наступали уже дважды (050 и 072). Клиент вдобавок
-- выбрасывал error, так что причина не доходила ни до пользователя, ни в логи.
--
-- Поэтому смена роли переводится на RPC, которая либо делает работу, либо
-- бросает внятное исключение — ровно тем приёмом, благодаря которому
-- promote_student_to_teacher (049/050) у роли staff работает надёжно.
--
-- Триггер protect_user_privileged_fields намеренно НЕ трогаем: он остаётся
-- защитой на случай прямого UPDATE мимо этой функции.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id text, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
  v_new_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_role NOT IN ('student', 'teacher', 'staff', 'branch_admin', 'admin') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;

  SELECT role INTO v_current_role FROM public.users WHERE id = p_user_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Постоянный супер-админ (025). Триггер и так вернёт ему 'admin', но молча —
  -- а молчаливая подмена и есть то, от чего мы здесь уходим: администратор
  -- должен увидеть отказ, а не решить, что интерфейс сломан.
  IF p_user_id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'Cannot change the role of the permanent Super Admin';
  END IF;

  -- Филиал осмыслен только у учителя и админа филиала. Раньше при понижении он
  -- оставался висеть: на проде есть student с непустым branch_id — след того,
  -- как этот же переход делали в обход, в два шага.
  UPDATE public.users
  SET role = p_role,
      branch_id = CASE WHEN p_role IN ('teacher', 'branch_admin') THEN branch_id ELSE NULL END
  WHERE id = p_user_id;

  -- Возвращаем фактическую роль после записи, а не p_role: если её всё же
  -- кто-то подменит (тот же триггер при неожиданном вызывающем), клиент это
  -- увидит и скажет вслух, вместо того чтобы отрисовать мнимый успех.
  SELECT role INTO v_new_role FROM public.users WHERE id = p_user_id;
  RETURN v_new_role;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(text, text) TO authenticated;

-- Разовая чистка уже накопленного: филиал у тех, кому он больше не положен.
-- WHERE обязателен — pg_safeupdate блокирует UPDATE без него.
UPDATE public.users
SET branch_id = NULL
WHERE role NOT IN ('teacher', 'branch_admin')
  AND branch_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
