-- Одна шкала на все предметы: 0–75.
--
-- Решение владельца от 2026-09-08: «макс 75 во всех предметах». Прежде
-- общеобразовательные выдавались из 100, иностранные языки — из 75.
--
-- ПОЧЕМУ ЭТО НЕ КОСМЕТИКА. Уровень A+..C считается от T-шкалы (пороги
-- 70/65/60/55/50/46 заданы именно на ней), а балл показывался растянутым до
-- ста. Числа расходились, и на проде это выглядело так:
--
--   77.2 из 100 → B          (T = 57.9)
--   63.0 из 100 → C          (T = 47.3)
--   60.3 из 100 → «Ниже C»   (T = 45.2)
--
-- То есть шестьдесят баллов из ста означало «сертификата нет». На 75-балльной
-- шкале балл и порог — одно и то же число: 47.3 → C, потому что C с 46.
--
-- Заодно уходит §237 (NO CROSS-SCALE MIXING): пока шкал было две, средние по
-- группе и филиалу приходилось считать в процентах от максимума, и «средний
-- балл» был процентом. Теперь усредняется сам балл — правка функций ниже.
--
-- ЦЕНА. Меняются все 90 уже выставленных баллов: каждый умножается на 0.75
-- (математика в среднем 42.5 → 31.9, узбекский 26.2 → 19.6). Буквы НЕ
-- меняются — они и раньше считались от T. Доля от максимума тоже не меняется.
-- Пересчёт создаёт ревизии, а не переписывает молча (§239).

-- ═══ 1. Пересчёт ═══
--
-- Считаем из уже сохранённого балла, а не из θ: level_score = T * max / 75,
-- значит T = level_score * 75 / max, и новый балл равен этому T. Модель заново
-- не прогоняется — тот же приём, что в 085, 089 и 091.
CREATE TEMP TABLE scale75_recalc AS
SELECT mr.id,
       mt.subject_id,
       mr.level_score  AS stored_score,
       mr.level_score_max AS stored_max,
       mr.grade_level  AS stored_level,
       mr.rasch_score,
       round((mr.level_score * 75.0 / mr.level_score_max)::numeric, 1) AS score_new
FROM public.mock_results mr
JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
WHERE mr.level_score IS NOT NULL
  AND mr.level_score_max > 0;

-- ═══ 2. Самопроверка ДО записи ═══
DO $$
DECLARE
  v_total  int;
  v_out    int;
  v_letter int;
BEGIN
  SELECT count(*) INTO v_total FROM scale75_recalc;
  SELECT count(*) INTO v_out FROM scale75_recalc
   WHERE score_new < 0 OR score_new > 75;
  -- Буква обязана остаться той же: она считалась от T, а новый балл и есть T.
  -- Полосы — полуоткрытые интервалы по ТОЧНОМУ баллу (см. mock-grade-level.ts).
  SELECT count(*) INTO v_letter FROM scale75_recalc
   WHERE stored_level IS DISTINCT FROM CASE
     WHEN score_new >= 70 THEN 'A+'
     WHEN score_new >= 65 THEN 'A'
     WHEN score_new >= 60 THEN 'B+'
     WHEN score_new >= 55 THEN 'B'
     WHEN score_new >= 50 THEN 'C+'
     WHEN score_new >= 46 THEN 'C'
     ELSE 'below_c'
   END;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Нет ни одного балла для пересчёта — проверь данные';
  END IF;

  IF v_out > 0 THEN
    RAISE EXCEPTION '% баллов вышли за границы 0..75 — пересчёт неверен, запись отменена', v_out;
  END IF;

  IF v_letter > 0 THEN
    RAISE EXCEPTION
      'У % из % работ буква не совпала с новым баллом. Смена шкалы не должна менять уровень — значит балл или буква считались не тем путём. Запись отменена',
      v_letter, v_total;
  END IF;

  RAISE NOTICE 'Самопроверка пройдена на % баллах, буквы совпали', v_total;
END;
$$;

-- ═══ 3. Ревизии: снимок ДО правки (§239) ═══
INSERT INTO public.mock_result_revisions
  (result_id, reason, level_score, level_score_max, grade_level, rasch_score, scale_version)
SELECT r.id, 'certificate_scale_75_all_subjects', r.stored_score, r.stored_max, r.stored_level, r.rasch_score, 'v2-zero/max-100'
FROM scale75_recalc r
WHERE r.score_new IS DISTINCT FROM r.stored_score
   OR r.stored_max IS DISTINCT FROM 75;

-- ═══ 4. Запись ═══
--
-- WHERE обязателен из-за pg_safeupdate (см. CLAUDE.md). grade_level не
-- трогаем: самопроверка выше доказала, что он уже соответствует новому баллу.
UPDATE public.mock_results mr
SET level_score = r.score_new,
    level_score_max = 75
FROM scale75_recalc r
WHERE mr.id = r.id
  AND (mr.level_score IS DISTINCT FROM r.score_new OR mr.level_score_max IS DISTINCT FROM 75);

DROP TABLE scale75_recalc;

-- Работы без балла: максимум всё равно проставляем, чтобы в базе не осталось
-- строк с прежней сотней, которые потом попадут в среднее по старой шкале.
UPDATE public.mock_results
SET level_score_max = 75
WHERE level_score_max IS DISTINCT FROM 75
  AND level_score_max IS NOT NULL;

-- ═══ 5. Агрегаты: средний балл, а не средний процент ═══
--
-- Во всех трёх функциях стояло AVG(level_score / level_score_max * 100) —
-- приведение к сотне, нужное пока шкал было две. Теперь шкала одна, и то же
-- выражение выдавало бы процент рядом с баллами из 75: балл 60 попадал в
-- среднее как 80. Меняется только множитель, тела функций взяты из базы
-- как есть, чтобы не потерять прежние правки (081, 086, 089).
CREATE OR REPLACE FUNCTION public.get_branch_overview()
 RETURNS TABLE(branch_id uuid, branch_name text, class_count integer, teacher_count integer, student_count integer, avg_score numeric, avg_oylik numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 1)
       FROM public.mock_results mr
      WHERE mr.revealed_at IS NOT NULL
        AND mr.level_score IS NOT NULL
        AND mr.level_score_max > 0
        AND EXISTS (
          SELECT 1 FROM public.class_members cm
          JOIN public.classes c ON c.id = cm.class_id
          WHERE cm.student_id = mr.user_id AND c.branch_id = v.id
        )),
    (SELECT round(AVG(mr.level_score / mr.level_score_max * 75), 1)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_class_subject_ranking(p_class_id uuid)
 RETURNS TABLE(subject_id text, my_avg_score numeric, my_attempts integer, my_rank integer, total_students integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id text := auth.uid()::text;
BEGIN
  -- Проверка членства обязательна и сохранена из прежней версии: функция
  -- SECURITY DEFINER, и без неё чужую группу можно было бы просмотреть,
  -- подставив её id.
  IF NOT EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = p_class_id AND cm.student_id = v_student_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH class_students AS (
    SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id = p_class_id
  ),
  per_student_subject AS (
    SELECT
      cs.student_id AS student_id,
      mt.subject_id AS subject_id,
      AVG(mr.level_score / mr.level_score_max * 75) AS avg_score,
      COUNT(*) AS attempts
    FROM class_students cs
    JOIN public.mock_results mr ON mr.user_id = cs.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mt.subject_id IS NOT NULL
      AND mr.revealed_at IS NOT NULL
      AND mr.level_score IS NOT NULL
      AND mr.level_score_max > 0
    GROUP BY cs.student_id, mt.subject_id
  ),
  ranked AS (
    SELECT
      pss.student_id,
      pss.subject_id,
      pss.avg_score,
      pss.attempts,
      RANK() OVER (
        PARTITION BY pss.subject_id
        ORDER BY pss.avg_score DESC, pss.attempts DESC, pss.student_id ASC
      ) AS rnk,
      COUNT(*) OVER (PARTITION BY pss.subject_id) AS total
    FROM per_student_subject pss
  )
  SELECT r.subject_id, ROUND(r.avg_score, 1), r.attempts::int, r.rnk::int, r.total::int
  FROM ranked r
  WHERE r.student_id = v_student_id
  ORDER BY r.subject_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_rating(p_kind text, p_scope text)
 RETURNS TABLE(my_rank integer, total_students integer, my_avg_score numeric, my_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id text := auth.uid()::text;
  v_branch_id uuid;
BEGIN
  IF p_kind NOT IN ('overall', 'oylik') THEN
    RAISE EXCEPTION 'Unknown rating kind: %', p_kind;
  END IF;
  IF p_scope NOT IN ('class', 'branch', 'platform') THEN
    RAISE EXCEPTION 'Unknown rating scope: %', p_scope;
  END IF;

  SELECT c.branch_id INTO v_branch_id
  FROM public.class_members cm
  JOIN public.classes c ON c.id = cm.class_id
  WHERE cm.student_id = v_student_id AND c.branch_id IS NOT NULL
  LIMIT 1;

  IF p_scope = 'branch' AND v_branch_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH peers AS (
    SELECT DISTINCT cm.student_id
    FROM public.class_members cm
    JOIN public.classes c ON c.id = cm.class_id
    WHERE p_scope <> 'platform'
      AND (
        (p_scope = 'class' AND cm.class_id IN (
          SELECT class_id FROM public.class_members WHERE student_id = v_student_id
        ))
        OR (p_scope = 'branch' AND c.branch_id = v_branch_id)
      )
    UNION
    SELECT DISTINCT mr.user_id
    FROM public.mock_results mr
    WHERE p_scope = 'platform' AND mr.revealed_at IS NOT NULL
  ),
  scored AS (
    SELECT
      p.student_id,
      AVG(mr.level_score / mr.level_score_max * 75) AS avg_score,
      count(*)::int AS attempts
    FROM peers p
    JOIN public.mock_results mr ON mr.user_id = p.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mr.revealed_at IS NOT NULL
      AND mr.level_score IS NOT NULL
      AND mr.level_score_max > 0
      AND (p_kind = 'overall' OR mt.oylik_set_id IS NOT NULL)
    GROUP BY p.student_id
  ),
  ranked AS (
    SELECT
      s.student_id,
      s.avg_score,
      s.attempts,
      RANK() OVER (ORDER BY s.avg_score DESC, s.attempts DESC, s.student_id ASC) AS rnk,
      count(*) OVER () AS total
    FROM scored s
  )
  SELECT r.rnk::int, r.total::int, round(r.avg_score, 1), r.attempts
  FROM ranked r
  WHERE r.student_id = v_student_id;  -- наружу уходит одна строка: своя
END;
$function$;

NOTIFY pgrst, 'reload schema';
