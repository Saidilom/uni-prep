-- 106. Админ филиала видит группу целиком: результаты каждого мока.
--
-- До сих пор он видел только список групп со средним баллом. Зайти внутрь
-- группы и посмотреть, кто как сдал конкретный мок, он не мог — не хватало
-- доступа к двум таблицам.
--
-- Что у него уже было (миграция 072): classes, class_members, users,
-- mock_results — по своему филиалу. Плюс mock_class_assignments и mock_tests
-- читаются любым авторизованным.
--
-- Чего не хватало:
--   mock_student_assignments — индивидуальные назначения мока ученику;
--   mock_answer_details      — разбор по вопросам, из него же считается
--                              статистика ошибок по заданиям.
--
-- ═══ ПОЧЕМУ ЧЕРЕЗ ФУНКЦИЮ, А НЕ ПОДЗАПРОСОМ ═══
--
-- Проверка «этот ученик из моего филиала» ходит в class_members и classes, а
-- на обеих таблицах свои политики, в том числе для админа филиала. Сырой
-- подзапрос в политике заставил бы RLS проверять RLS и мог войти в рекурсию.
-- SECURITY DEFINER-функция обходит это тем же способом, что is_admin() и
-- is_teacher() (миграции 004, 010): каст и чтение делаются правами владельца.
--
-- Заодно предикат перестаёт быть скопированным дважды: обе политики ниже
-- зовут одну функцию, и правило «кто мой ученик» живёт в одном месте.
--
-- ═══ ГРАНИЦА ДОСТУПА ═══
--
-- Только чтение и только по своим ученикам. Ни правок, ни чужих филиалов:
-- current_branch_id() возвращает филиал самого вызывающего, подменить его
-- параметром нельзя.

CREATE OR REPLACE FUNCTION public.is_student_in_my_branch(p_student_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_branch_admin()
     AND public.current_branch_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.class_members cm
       JOIN public.classes c ON c.id = cm.class_id
       WHERE cm.student_id = p_student_id
         AND c.branch_id = public.current_branch_id()
     );
$function$;

COMMENT ON FUNCTION public.is_student_in_my_branch(text) IS
  'Ученик состоит в группе филиала вызывающего админа филиала. SECURITY DEFINER, чтобы политики не проверяли RLS через RLS.';

REVOKE ALL ON FUNCTION public.is_student_in_my_branch(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_student_in_my_branch(text) TO authenticated;

-- ═══ Индивидуальные назначения ═══
DROP POLICY IF EXISTS mock_student_assignments_branch_admin_read ON public.mock_student_assignments;
CREATE POLICY mock_student_assignments_branch_admin_read ON public.mock_student_assignments
  FOR SELECT USING (public.is_student_in_my_branch(student_id));

-- ═══ Разбор по вопросам ═══
--
-- Ключ здесь не лежит: mock_answer_details хранит выбранный ответ и признак
-- верности, то есть ровно то, что ученик уже видел в своём разборе. Учителю
-- своей группы это доступно давно (mock_answer_details_teacher), админ филиала
-- получает то же самое по своим ученикам.
DROP POLICY IF EXISTS mock_answer_details_branch_admin_read ON public.mock_answer_details;
CREATE POLICY mock_answer_details_branch_admin_read ON public.mock_answer_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mock_results r
      WHERE r.id = mock_answer_details.result_id
        AND public.is_student_in_my_branch(r.user_id)
    )
  );

NOTIFY pgrst, 'reload schema';
