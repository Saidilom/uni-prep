-- Админ филиала видит результаты вступительных тестов своего филиала.
--
-- Связать результат с филиалом напрямую не за что: у placement_results нет
-- branch_id, у учеников users.branch_id не заполнен (set_user_role, миграция
-- 079, намеренно обнуляет филиал всем, кроме учителя и админа филиала), QR на
-- ресепшене один на всю платформу, а тест ученик назначает сам себе — в
-- placement_assignments.assigned_by стоит он же.
--
-- Поэтому по решению владельца «свои» определяются через ГРУППЫ: результат
-- виден, если его автор состоит хотя бы в одной группе этого филиала. Ровно тот
-- механизм, что уже работает у mock_results_branch_admin_read, — новых
-- сущностей не заводим.
--
-- Следствие принципа, о котором владелец знает: абитуриент, прошедший тест и
-- ещё не зачисленный в группу, админу филиала не виден.

CREATE POLICY placement_results_branch_admin_read ON public.placement_results
  FOR SELECT
  USING (
    public.is_branch_admin()
    -- Явная проверка на NULL — см. пояснение у mock_results ниже.
    AND public.current_branch_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = placement_results.user_id
        AND c.branch_id = public.current_branch_id()
    )
  );

-- ═══ Заодно: та же строгость для мок-результатов ═══
--
-- В mock_results_branch_admin_read стояло
--   NOT (c.branch_id IS DISTINCT FROM current_branch_id())
-- а это в Postgres даёт TRUE, когда ОБЕ стороны NULL. То есть админ филиала, у
-- которого филиал не проставлен, видел учеников всех групп, у которых филиал
-- тоже не задан, — а таких групп на проде сейчас пять.
--
-- Сегодня не стреляет: у всех трёх админов филиал есть. Но требование владельца
-- звучит прямо — «не должен видеть данные других филиалов», — и оставлять рядом
-- две политики с разной строгостью значит закладывать путаницу. Правка в одно
-- условие, поведение при заполненном филиале не меняется.
DROP POLICY IF EXISTS mock_results_branch_admin_read ON public.mock_results;
CREATE POLICY mock_results_branch_admin_read ON public.mock_results
  FOR SELECT
  USING (
    public.is_branch_admin()
    AND public.current_branch_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = mock_results.user_id
        AND c.branch_id = public.current_branch_id()
    )
  );

-- ═══ Проверка ═══
DO $$
DECLARE
  v_placement int;
  v_mock      int;
BEGIN
  SELECT count(*) INTO v_placement FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'placement_results'
     AND policyname = 'placement_results_branch_admin_read';
  SELECT count(*) INTO v_mock FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'mock_results'
     AND policyname = 'mock_results_branch_admin_read';

  IF v_placement <> 1 OR v_mock <> 1 THEN
    RAISE EXCEPTION
      'Политики на месте не оказались: placement %, mock % (ожидалось по одной)',
      v_placement, v_mock;
  END IF;
END;
$$;
