-- Роль 'staff' убрана.
--
-- Она заводилась (миграция 049) как узкий админ с единственным правом: делать
-- учеников учителями, через собственный раздел /staff. По решению владельца
-- «два админа не нужны» (§9) это действие перешло к админу филиала —
-- promote_student_to_teacher_in_branch и раздел /branch/teachers, — и роль
-- осталась дублирующей: её панель повторяла /branch/teachers и
-- /admin/placement/results, а носителей у неё не было ни одного.
--
-- Порядок здесь важен: сначала снимаются политики и правятся функции, которые
-- ссылаются на is_staff(), и только потом дропается сама is_staff() — иначе
-- Postgres откажется её удалять из-за зависимостей.

-- ═══ 1. Никого не оставить с несуществующей ролью ═══
--
-- Сейчас в 'staff' ноль человек, так что это страховка, а не миграция данных.
-- Но если кого-то успели назначить между проверкой и выкатом, после снятия
-- роли он завис бы в пустоте: /staff больше нет, а дашборд без явной ветки
-- показал бы ему ученический вид. Переводим в 'student' — это исходная роль,
-- из которой staff и назначался.
UPDATE public.users
SET role = 'student'
WHERE role = 'staff';

-- ═══ 2. Политики, написанные под staff ═══
--
-- Эти три действительно staff-only — `is_staff() AND ...` и голый `is_staff()`:
-- снимаются целиком.
DROP POLICY IF EXISTS users_staff_read_students ON public.users;
DROP POLICY IF EXISTS users_staff_read_teachers ON public.users;
DROP POLICY IF EXISTS placement_results_staff ON public.placement_results;

-- А вот branches_staff_read, вопреки имени, staff-only НЕ была:
--   (is_admin() OR is_branch_admin() OR is_teacher() OR is_staff())
-- Это единственная SELECT-политика на branches, то есть общий доступ к чтению
-- филиалов для админа, админа филиала и учителя. Снести её вместе с ролью
-- значило бы отобрать филиалы у всех троих. Поэтому пересоздаём без is_staff()
-- и с честным именем; branches_admin_write (ALL) не трогаем.
DROP POLICY IF EXISTS branches_staff_read ON public.branches;
CREATE POLICY branches_read ON public.branches
  FOR SELECT
  USING (public.is_admin() OR public.is_branch_admin() OR public.is_teacher());

-- ═══ 3. Триггер привилегированных полей ═══
--
-- Ветка staff убрана, ветка админа филиала оставлена как есть. Про сам триггер:
-- любая смена роли не-админом молча откатывается здесь же (см. CLAUDE.md),
-- поэтому карвы-ауты правятся только тут.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    NEW.role := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin') THEN
    NULL; -- full admin: no restriction
  ELSIF public.is_branch_admin() AND OLD.role = 'student' AND NEW.role = 'teacher' THEN
    -- Ровно одно действие для админа филиала: сделать ученика учителем.
    -- Понижать, назначать админов и трогать isRegistanStudent он не может.
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  ELSE
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══ 4. Назначение роли супер-админом ═══
--
-- 'staff' убран из списка допустимых: попытка выставить его теперь падает с
-- понятным «Unknown role», а не создаёт пользователя с ролью, которой в
-- приложении больше нет. Остальное тело — из миграции 079 без изменений.
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

  IF p_role NOT IN ('student', 'teacher', 'branch_admin', 'admin') THEN
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

-- ═══ 5. Сами функции роли ═══
DROP FUNCTION IF EXISTS public.is_staff();

-- promote_student_to_teacher (049) звался только из /staff и вместе с ним
-- остался без вызывающих: супер-админ меняет роль через set_user_role, админ
-- филиала — через promote_student_to_teacher_in_branch. Мёртвая
-- SECURITY DEFINER-функция, умеющая менять роли, — лишняя поверхность.
DROP FUNCTION IF EXISTS public.promote_student_to_teacher(text);

-- ═══ 6. Проверка, что ничего не осталось ═══
DO $$
DECLARE
  v_users    int;
  v_policies int;
  v_funcs    int;
BEGIN
  SELECT count(*) INTO v_users FROM public.users WHERE role = 'staff';
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE coalesce(qual::text, '') LIKE '%staff%' OR coalesce(with_check::text, '') LIKE '%staff%';
  SELECT count(*) INTO v_funcs FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND pg_get_functiondef(p.oid) LIKE '%staff%';

  IF v_users > 0 OR v_policies > 0 OR v_funcs > 0 THEN
    RAISE EXCEPTION
      'Роль staff убрана не полностью: пользователей %, политик %, функций %',
      v_users, v_policies, v_funcs;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
