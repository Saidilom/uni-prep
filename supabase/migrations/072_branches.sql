-- §5 из design/FIX.md: филиалы.
--
-- Понятия филиала в проекте не было вообще — ни таблицы, ни колонки, ни роли.
-- Роль ровно одна административная, 'admin' (она же Super Admin; один аккаунт
-- прибит гвоздями в 025). Логика, которую задал владелец:
--
--   Super Admin  → видит все филиалы, создаёт их и назначает админов филиалов
--   Админ филиала → видит только свой филиал
--   Учитель      → наследует филиал того, кто его назначил
--   Группа       → наследует филиал своего учителя
--   Средний балл филиала = среднее из средних баллов его групп
--
-- Роль сделана по образцу 'staff' (049): собственный SECURITY DEFINER-хелпер
-- плюс ровно столько RLS, сколько нужно, — а НЕ расширение прав 'admin'.
-- Причина: is_admin() зашит в политики почти всех таблиц, и подмешивание туда
-- второй роли означало бы переписывать их все и рисковать текущими правами
-- супер-админа. Админ филиала работает в своём разделе /branch, как staff в
-- своём /staff.
--
-- CHECK-констрейнта на users.role нет (подтверждено в шапке 049), поэтому
-- новое значение 'branch_admin' не требует ALTER колонки.

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- text, а не uuid: все колонки, ссылающиеся на users.id, в этой схеме text —
-- см. раздел про uuid/text drift в DATABASE.md. Здесь ссылка идёт на branches,
-- поэтому uuid, но помечаю явно, чтобы следующий не скопировал наугад.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_branch_id ON public.users(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch_id ON public.classes(branch_id);

-- Оба хелпера — SECURITY DEFINER с кастом auth.uid()::text внутри. Все
-- политики ниже ходят через них, а не через сырые подзапросы к users: сырой
-- подзапрос в политике на users уводит RLS в рекурсию, это уже случалось в
-- проекте дважды (миграции 004 и 042).
CREATE OR REPLACE FUNCTION public.is_branch_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'branch_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid()::text;
$$;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Читать список филиалов может любой сотрудник: админу филиала нужно знать
-- название своего, учителю — видеть, к какому он приписан. Данных, которые
-- стоило бы скрывать, в строке нет — только название.
DROP POLICY IF EXISTS branches_staff_read ON public.branches;
CREATE POLICY branches_staff_read ON public.branches
  FOR SELECT USING (
    public.is_admin() OR public.is_branch_admin() OR public.is_teacher() OR public.is_staff()
  );

-- Создаёт и переименовывает только Super Admin: филиал — это структура
-- организации, а не то, что заводит себе каждый администратор.
DROP POLICY IF EXISTS branches_admin_write ON public.branches;
CREATE POLICY branches_admin_write ON public.branches
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Группа получает филиал из карточки создавшего её учителя, а не из того, что
-- прислал клиент: иначе учитель одного филиала мог бы записать свою группу в
-- чужой и подмешать её результаты в чужой средний балл.
CREATE OR REPLACE FUNCTION public.set_class_branch_from_teacher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT branch_id INTO NEW.branch_id FROM public.users WHERE id = NEW.teacher_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_class_branch_trg ON public.classes;
CREATE TRIGGER set_class_branch_trg
  BEFORE INSERT ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_branch_from_teacher();

-- Проставляем филиал уже существующим группам — по их учителю. У всех он
-- сейчас NULL, так что это no-op до первого назначения филиалов, но оставлено,
-- чтобы миграцию можно было прогнать повторно после расстановки филиалов.
UPDATE public.classes c
SET branch_id = u.branch_id
FROM public.users u
WHERE u.id = c.teacher_id AND c.branch_id IS NULL AND u.branch_id IS NOT NULL;

-- ═══ Назначение учителя админом филиала ═══
--
-- То же, что promote_student_to_teacher (049), но с наследованием филиала.
-- Super Admin может назвать филиал явно; админ филиала — только свой.
CREATE OR REPLACE FUNCTION public.promote_student_to_teacher_in_branch(
  p_student_id text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
  v_branch_id uuid;
BEGIN
  IF public.is_admin() THEN
    v_branch_id := p_branch_id;
  ELSIF public.is_branch_admin() THEN
    -- Свой филиал и только свой: p_branch_id от него не принимается вовсе.
    v_branch_id := public.current_branch_id();
    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'Branch admin has no branch assigned';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_current_role FROM public.users WHERE id = p_student_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_current_role <> 'student' THEN
    RAISE EXCEPTION 'User is not a student (current role: %)', v_current_role;
  END IF;

  UPDATE public.users SET role = 'teacher', branch_id = v_branch_id WHERE id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_student_to_teacher_in_branch(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_student_to_teacher_in_branch(text, uuid) TO authenticated;

-- Без этой ветки RPC выше «срабатывала» бы вхолостую: триггер
-- protect_user_privileged_fields молча возвращает NEW.role к OLD.role для
-- любого вызывающего, кроме role='admin', и не бросает при этом исключения.
-- Ровно на этом уже обожглись со staff — см. шапку 050.
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
  ELSIF public.is_staff() AND OLD.role = 'student' AND NEW.role = 'teacher' THEN
    NEW.isRegistanStudent := OLD.isRegistanStudent; -- staff's one sanctioned action
  ELSIF public.is_branch_admin() AND OLD.role = 'student' AND NEW.role = 'teacher' THEN
    -- Ровно одно действие и для админа филиала: сделать ученика учителем.
    -- Понижать, назначать админов и трогать isRegistanStudent он не может.
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  ELSE
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══ Что видит админ филиала ═══
--
-- По образцу users_staff_read_students / users_teacher_read_students (049/010):
-- узкие точечные гранты, ничего шире. Ученики и учителя — только своего филиала.
DROP POLICY IF EXISTS users_branch_admin_read ON public.users;
CREATE POLICY users_branch_admin_read ON public.users
  FOR SELECT USING (
    public.is_branch_admin()
    AND role IN ('student', 'teacher')
    AND branch_id IS NOT DISTINCT FROM public.current_branch_id()
  );

DROP POLICY IF EXISTS classes_branch_admin_read ON public.classes;
CREATE POLICY classes_branch_admin_read ON public.classes
  FOR SELECT USING (
    public.is_branch_admin()
    AND branch_id IS NOT DISTINCT FROM public.current_branch_id()
  );

DROP POLICY IF EXISTS class_members_branch_admin_read ON public.class_members;
CREATE POLICY class_members_branch_admin_read ON public.class_members
  FOR SELECT USING (
    public.is_branch_admin()
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_members.class_id
        AND c.branch_id IS NOT DISTINCT FROM public.current_branch_id()
    )
  );

DROP POLICY IF EXISTS mock_results_branch_admin_read ON public.mock_results;
CREATE POLICY mock_results_branch_admin_read ON public.mock_results
  FOR SELECT USING (
    public.is_branch_admin()
    AND EXISTS (
      SELECT 1
      FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = mock_results.user_id
        AND c.branch_id IS NOT DISTINCT FROM public.current_branch_id()
    )
  );

-- ═══ Сводка по филиалам ═══
--
-- Средний балл филиала считается ровно так, как описал владелец: среднее из
-- средних баллов его ГРУПП, а не среднее по всем попыткам разом. Это разные
-- числа — большая группа в первом варианте не перевешивает маленькую.
--
-- Считается в SQL, а не в браузере: клиентская выборка mock_results без
-- пагинации молча обрезается по max_rows PostgREST, и средний по всей
-- платформе считался бы по случайному куску строк, без единой ошибки.
--
-- В процентах (accuracy), а не в баллах: филиал складывает разные тесты с
-- разной суммой баллов, и только доля от максимума между ними сопоставима —
-- см. «Правило отображения баллов» в design/FIX.md.
DROP FUNCTION IF EXISTS public.get_branch_overview();
CREATE FUNCTION public.get_branch_overview()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  class_count int,
  teacher_count int,
  student_count int,
  avg_accuracy int
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
  class_avg AS (
    SELECT c.id AS class_id, c.branch_id, AVG(mr.accuracy) AS avg_accuracy
    FROM public.classes c
    JOIN public.class_members cm ON cm.class_id = c.id
    JOIN public.mock_results mr ON mr.user_id = cm.student_id AND mr.revealed_at IS NOT NULL
    WHERE c.branch_id IS NOT NULL
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
    (SELECT round(AVG(ca.avg_accuracy))::int FROM class_avg ca WHERE ca.branch_id = v.id)
  FROM visible v
  ORDER BY v.name;
$$;

REVOKE ALL ON FUNCTION public.get_branch_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
