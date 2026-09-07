-- Средний балл филиала — простым средним по работам, как везде.
--
-- Раньше он считался как среднее из средних по ГРУППАМ: каждая группа весила
-- одинаково независимо от размера (§5). Решение было осознанным, но выбивалось
-- из общей системы — группа, учитель и рейтинг считают простым средним по всем
-- работам (averageCertificateScore, src/lib/certificate-scale.ts). Отличие
-- приходилось объяснять подписью прямо на экране: «среднее из средних баллов
-- групп филиала, а не среднее по всем попыткам».
--
-- Владелец решил убрать подпись и привести расчёт к общему правилу: складываем
-- все работы филиала и делим на их число. Разница видна на группах разного
-- размера — группа из 10 со средним 50 и группа из 2 со средним 90 давали 70,
-- теперь дают 56.7.
--
-- Набор и типы возвращаемых колонок не меняются, поэтому CREATE OR REPLACE
-- проходит и DROP не нужен (см. CLAUDE.md). Тело — из миграции 086, правятся
-- только два подзапроса.
--
-- Каждая работа считается ОДИН раз: ученик может состоять в нескольких группах
-- одного филиала, и join через class_members задваивал бы её. Поэтому EXISTS, а
-- не JOIN — прежняя формула этой ловушки не имела только потому, что считала
-- поклассно.

CREATE OR REPLACE FUNCTION public.get_branch_overview()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  class_count int,
  teacher_count int,
  student_count int,
  avg_score numeric,
  avg_oylik numeric
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
  -- §12: месячный балл считается по ПОСЛЕДНЕМУ опубликованному комплекту.
  -- Решение владельца: так видно, как филиал сдал в этом месяце, а не
  -- усреднённую за всё время картину, в которой плохой месяц растворяется.
  latest_set AS (
    SELECT id FROM public.oylik_sets
    WHERE published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 1
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
    -- Приведение к сотне обязательно: у английского потолок 75, у остальных 100.
    -- Без него английская группа выглядела бы слабее только из-за шкалы.
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 100), 1)
       FROM public.mock_results mr
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        )),
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 100), 1)
       FROM public.mock_results mr
       JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND mt.oylik_set_id IN (SELECT id FROM latest_set)
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        ))
  FROM visible v
  ORDER BY v.name;
$$;

-- CREATE OR REPLACE права сохраняет, но восстанавливаем их явно: если функцию
-- когда-нибудь пересоздадут через DROP, потеря EXECUTE проявится не сразу и не
-- очевидно — пустым экраном вместо ошибки.
REVOKE ALL ON FUNCTION public.get_branch_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
