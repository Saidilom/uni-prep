-- Группа с предметом «Родной язык» не получала ни одного теста из комплекта
-- «Ойлик тест».
--
-- Причина — рассогласование двух списков предметов, которые сошлись в одном
-- JOIN'е. Предмет ТЕСТА выбирается из MOCK_SUBJECTS (там есть 'russian' и
-- 'uzbek', но нет 'native'), предмет ГРУППЫ — из CORE_SUBJECTS (там ровно
-- наоборот: есть 'native', нет 'russian'/'uzbek'). Раздача же искала точное
-- совпадение `c.subject_id = mt.subject_id`, поэтому для родного языка
-- совпадения не было никогда, и один предмет из семи выпадал целиком.
-- На проде уже лежали два теста с subject_id='uzbek', которые до таких групп
-- не дошли бы.
--
-- Решение владельца: русский и узбекский считаются родным языком. Это ровно
-- та логика, что уже работает во вкладках раздела бесплатных моков —
-- coreSubjectMatches() в src/lib/mock-import-schema.ts. Если будете менять
-- набор языков, правьте оба места, иначе интерфейс и раздача разойдутся.
--
-- Обратное сопоставление НЕ делается: группа с предметом 'uzbek' (такой в
-- CORE_SUBJECTS нет, но данные могли остаться от ручной правки) получает
-- только точное совпадение. Расширять сопоставление в обе стороны значило бы
-- отдать узбекской группе русский тест.
CREATE OR REPLACE FUNCTION public.publish_oylik_set(p_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_tests int := 0;
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

  UPDATE public.oylik_sets SET published_at = now() WHERE id = p_set_id;

  RETURN jsonb_build_object('testCount', v_tests, 'assignedCount', v_assigned);
END;
$$;

NOTIFY pgrst, 'reload schema';
