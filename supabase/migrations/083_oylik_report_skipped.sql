-- §15: публикация комплекта сообщает, кого пропустила.
--
-- Раздача по предмету работает с миграции 075 и в правках не нуждается: тест
-- уходит только группам, чей subject_id совпадает с предметом теста (плюс
-- русский и узбекский считаются родным языком).
--
-- Проблема не в механизме, а в молчании. Группа без заданного предмета
-- пропускается — и об этом никто не узнаёт: администратор видит «комплект
-- опубликован» и считает, что тест ушёл всем. На проде так пропускались бы
-- 5 групп из 7: предмет у них не заполнен.
--
-- Возвращаем ещё два числа: сколько групп осталось без теста из-за пустого
-- предмета и сколько — потому, что теста по их предмету в комплекте нет.
-- Это разные причины, и чинятся они по-разному: первая — заполнить предмет
-- группы, вторая — добавить тест в комплект.
CREATE OR REPLACE FUNCTION public.publish_oylik_set(p_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_tests int := 0;
  v_no_subject int := 0;
  v_no_match int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oylik_sets WHERE id = p_set_id) THEN
    RAISE EXCEPTION 'Oylik set not found';
  END IF;

  SELECT count(*) INTO v_tests FROM public.mock_tests WHERE oylik_set_id = p_set_id;
  IF v_tests = 0 THEN
    RAISE EXCEPTION 'Add at least one test to this set before publishing';
  END IF;

  -- ON CONFLICT, а не «проверить и вставить»: у mock_class_assignments есть
  -- UNIQUE (mock_test_id, class_id), и повторная публикация комплекта должна
  -- быть безобидной, а не падать на полпути.
  WITH inserted AS (
    INSERT INTO public.mock_class_assignments (id, mock_test_id, class_id)
    SELECT gen_random_uuid(), mt.id, c.id
    FROM public.mock_tests mt
    JOIN public.classes c
      ON c.subject_id IS NOT NULL
     AND mt.subject_id IS NOT NULL
     AND (
       c.subject_id = mt.subject_id
       OR (c.subject_id = 'native' AND mt.subject_id IN ('native', 'russian', 'uzbek'))
     )
    WHERE mt.oylik_set_id = p_set_id
    ON CONFLICT (mock_test_id, class_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_assigned FROM inserted;

  SELECT count(*)::int INTO v_no_subject
  FROM public.classes c WHERE c.subject_id IS NULL;

  SELECT count(*)::int INTO v_no_match
  FROM public.classes c
  WHERE c.subject_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.oylik_set_id = p_set_id
        AND mt.subject_id IS NOT NULL
        AND (
          c.subject_id = mt.subject_id
          OR (c.subject_id = 'native' AND mt.subject_id IN ('native', 'russian', 'uzbek'))
        )
    );

  UPDATE public.oylik_sets SET published_at = now() WHERE id = p_set_id;

  RETURN jsonb_build_object(
    'testCount', v_tests,
    'assignedCount', v_assigned,
    'skippedNoSubject', v_no_subject,
    'skippedNoMatch', v_no_match
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
