-- 105. Разбор филиала по предметам: месячные тесты и общий балл.
--
-- Нужно карточке филиала у супер-админа: раньше по клику ничего не
-- открывалось, а средний балл по месячным тестам был одним числом на весь
-- филиал — по нему не видно, какой предмет его тянет вниз.
--
-- ═══ ЧТО СЧИТАЕТСЯ ═══
--
-- Та же арифметика, что в get_branch_overview (миграция 072), слово в слово:
--   * шкала: level_score / level_score_max * 75 — у английского потолок 75, у
--     остальных 100, и без приведения английская группа выглядела бы слабее
--     только из-за шкалы;
--   * только revealed_at IS NOT NULL — неопубликованные результаты не считаются;
--   * месячный балл — по ПОСЛЕДНЕМУ опубликованному комплекту «Ойлик тест»
--     (§12, решение владельца), а не за всё время.
--
-- Расходиться этим двум функциям нельзя: сумма по предметам обязана давать то
-- же, что показано в списке филиалов. Поэтому условия скопированы буквально, а
-- не переписаны «по смыслу».
--
-- ═══ ПОЧЕМУ ВОЗВРАЩАЕТСЯ СЫРОЙ subject_id ═══
--
-- Исторические 'russian' и 'uzbek' — это тот же «родной язык», что и 'native'
-- (NATIVE_LANGUAGE_SUBJECT_IDS в src/lib/mock-import-schema.ts). Сворачивать их
-- здесь значило бы завести второй список предметов, который однажды разойдётся
-- с первым. Поэтому строки отдаются как есть, а сворачивает интерфейс по
-- своему единственному списку.
--
-- Вместе со средним отдаётся ЧИСЛО ПОПЫТОК — и не только ради знаменателя:
-- по нему интерфейс складывает предметы взвешенно. Среднее из средних без
-- весов дало бы другое число.

DROP FUNCTION IF EXISTS public.get_branch_subject_breakdown(uuid);

CREATE FUNCTION public.get_branch_subject_breakdown(p_branch_id uuid)
RETURNS TABLE(
  subject_id text,
  oylik_avg numeric,
  oylik_attempts integer,
  overall_avg numeric,
  overall_attempts integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    -- Видимость ровно та же, что у get_branch_overview: супер-админ видит
    -- любой филиал, админ филиала — только свой. Ни строки мимо.
    SELECT 1
    WHERE public.is_admin()
       OR (public.is_branch_admin() AND p_branch_id = public.current_branch_id())
  ),
  latest_set AS (
    SELECT id FROM public.oylik_sets
    WHERE published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 1
  ),
  branch_results AS (
    SELECT mt.subject_id AS subj,
           mr.level_score / mr.level_score_max * 75 AS score75,
           (mt.oylik_set_id IN (SELECT id FROM latest_set)) AS is_oylik
      FROM public.mock_results mr
      JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
     WHERE EXISTS (SELECT 1 FROM allowed)
       AND mr.revealed_at IS NOT NULL
       AND mr.level_score IS NOT NULL
       AND mr.level_score_max > 0
       AND mt.subject_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.class_members cm
         JOIN public.classes c ON c.id = cm.class_id
         WHERE cm.student_id = mr.user_id AND c.branch_id = p_branch_id
       )
  )
  SELECT
    br.subj,
    AVG(br.score75) FILTER (WHERE br.is_oylik),
    COUNT(*) FILTER (WHERE br.is_oylik)::int,
    AVG(br.score75),
    COUNT(*)::int
  FROM branch_results br
  GROUP BY br.subj
  ORDER BY br.subj;
$function$;

COMMENT ON FUNCTION public.get_branch_subject_breakdown(uuid) IS
  'Средний балл филиала по каждому предмету: по последнему комплекту «Ойлик тест» и за всё время. Условия те же, что в get_branch_overview — расходиться им нельзя.';

REVOKE ALL ON FUNCTION public.get_branch_subject_breakdown(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_branch_subject_breakdown(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
