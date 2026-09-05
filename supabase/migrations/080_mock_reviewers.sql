-- Проверяющий письменных работ, назначаемый на конкретный мок.
--
-- Письменные работы в бесплатных моках проверять было некому, кроме супер-
-- админа. review_mock_response (024) пускает двоих: is_admin() — либо автора
-- теста, и то лишь если ученик назначен ЕМУ (лично или через его класс). У
-- бесплатного мока назначений нет вовсе, его берут из каталога напрямую, так
-- что второй ветке зацепиться не за что.
--
-- Решение владельца: назначать проверяющего на КОНКРЕТНЫЙ мок, а не заводить
-- ещё одну роль. Из этого следует главное удобство: назначить можно любого
-- существующего учителя, и семь предметов естественно расходятся по разным
-- людям — узбекский проверяет один, английский другой.
--
-- Публиковать результаты проверяющий не может, и для этого ничего делать не
-- пришлось: finalize_mock_group_results требует created_by = auth.uid() или
-- is_admin(), а проверяющий не подходит ни под одно.

CREATE TABLE IF NOT EXISTS public.mock_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  -- text, а не uuid: так объявлен users.id (см. uuid/text drift в CLAUDE.md).
  reviewer_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Назначение идёт через ON CONFLICT, а не «проверить и вставить»: повторное
  -- назначение того же человека должно быть безобидным, а не плодить строки.
  UNIQUE (mock_test_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_reviewers_reviewer ON public.mock_reviewers(reviewer_id);

-- Три SECURITY DEFINER-хелпера. Сырой межтабличный подзапрос прямо в политике
-- здесь недопустим: в проекте это дважды уводило RLS в рекурсию (миграции 004
-- и 042), и в 072 уже принято оборачивать такие проверки в функции.
CREATE OR REPLACE FUNCTION public.is_mock_reviewer(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mock_reviewers
    WHERE mock_test_id = p_mock_test_id AND reviewer_id = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mock_reviewer_of_result(p_result_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mock_results r
    JOIN public.mock_reviewers mr ON mr.mock_test_id = r.mock_test_id
    WHERE r.id = p_result_id AND mr.reviewer_id = auth.uid()::text
  );
$$;

-- Имена сдававших: без этого список участников приходит пустым и проверять
-- оказывается нечего — работы есть, а чьи они, не видно.
CREATE OR REPLACE FUNCTION public.is_mock_reviewer_of_student(p_user_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mock_results r
    JOIN public.mock_reviewers mr ON mr.mock_test_id = r.mock_test_id
    WHERE r.user_id = p_user_id AND mr.reviewer_id = auth.uid()::text
  );
$$;

ALTER TABLE public.mock_reviewers ENABLE ROW LEVEL SECURITY;

-- Назначает только супер-админ: кто проверяет работы — решение организации.
DROP POLICY IF EXISTS mock_reviewers_admin ON public.mock_reviewers;
CREATE POLICY mock_reviewers_admin ON public.mock_reviewers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mock_reviewers_own_read ON public.mock_reviewers;
CREATE POLICY mock_reviewers_own_read ON public.mock_reviewers
  FOR SELECT USING (reviewer_id = auth.uid()::text);

-- Узкие точечные гранты, по образцу users_staff_read_students (049) и
-- users_branch_admin_read (072). Ровно то, без чего экран проверки не работает.
DROP POLICY IF EXISTS mock_results_reviewer_read ON public.mock_results;
CREATE POLICY mock_results_reviewer_read ON public.mock_results
  FOR SELECT USING (public.is_mock_reviewer(mock_test_id));

DROP POLICY IF EXISTS mock_answer_details_reviewer_read ON public.mock_answer_details;
CREATE POLICY mock_answer_details_reviewer_read ON public.mock_answer_details
  FOR SELECT USING (public.is_mock_reviewer_of_result(result_id));

DROP POLICY IF EXISTS users_reviewer_read_takers ON public.users;
CREATE POLICY users_reviewer_read_takers ON public.users
  FOR SELECT USING (public.is_mock_reviewer_of_student(id));

-- ═══ Патч review_mock_response ═══
--
-- Тело перенесено из живой версии (024) без изменений, кроме одной строки:
-- к v_allowed добавлен назначенный проверяющий.
--
-- `DEFAULT ''` у p_feedback обязателен и повторяет живую сигнатуру. Без него
-- CREATE OR REPLACE падает с 42P13 «cannot remove parameter defaults from
-- existing function» — Postgres не разрешает снять дефолт заменой. Обойти
-- можно было бы через DROP, но тогда потерялись бы гранты EXECUTE, и роут
-- проверки перестал бы работать до следующей миграции.
CREATE OR REPLACE FUNCTION public.review_mock_response(
  p_detail_id uuid,
  p_points numeric,
  p_feedback text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detail record;
  v_result record;
  v_is_admin boolean := public.is_admin();
  v_allowed boolean := false;
  v_score numeric;
  v_max_score numeric;
  v_correct int;
  v_accuracy int;
BEGIN
  SELECT mad.*, r.mock_test_id, r.user_id
  INTO v_detail
  FROM public.mock_answer_details mad
  JOIN public.mock_results r ON r.id = mad.result_id
  WHERE mad.id = p_detail_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;

  IF v_is_admin THEN
    v_allowed := true;
  ELSIF public.is_mock_reviewer(v_detail.mock_test_id) THEN
    -- Назначенный проверяющий этого мока. Ему доступна только проверка:
    -- публикацию результатов finalize_mock_group_results ему всё равно
    -- откажет, там нужен автор теста или админ.
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = v_detail.mock_test_id AND mt.created_by = auth.uid()::text
        AND (
          EXISTS (
            SELECT 1 FROM public.mock_student_assignments msa
            WHERE msa.mock_test_id = mt.id AND msa.student_id = v_detail.user_id AND msa.assigned_by = auth.uid()::text
          )
          OR EXISTS (
            SELECT 1 FROM public.mock_class_assignments mca
            JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
            JOIN public.class_members cm ON cm.class_id = c.id AND cm.student_id = v_detail.user_id
            WHERE mca.mock_test_id = mt.id
          )
        )
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_detail.review_status NOT IN ('pending', 'ai_graded') THEN RAISE EXCEPTION 'Response is not pending review'; END IF;
  IF p_points < 0 OR p_points > v_detail.max_points THEN RAISE EXCEPTION 'Points out of range'; END IF;

  UPDATE public.mock_answer_details
  SET points_earned = p_points,
      is_correct = (p_points = max_points AND max_points > 0),
      review_status = 'reviewed',
      review_feedback = NULLIF(trim(p_feedback), ''),
      reviewed_by = auth.uid()::text,
      reviewed_at = now()
  WHERE id = p_detail_id;

  SELECT COALESCE(sum(points_earned), 0), COALESCE(sum(max_points), 0), count(*) FILTER (WHERE is_correct)
  INTO v_score, v_max_score, v_correct
  FROM public.mock_answer_details WHERE result_id = v_detail.result_id;
  v_accuracy := CASE WHEN v_max_score > 0 THEN round(v_score / v_max_score * 100) ELSE 0 END;

  UPDATE public.mock_results
  SET score = v_score, correct_answers = v_correct, accuracy = v_accuracy
  WHERE id = v_detail.result_id
  RETURNING * INTO v_result;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'mock_response_reviewed',
    'mock_answer_detail',
    p_detail_id::text,
    jsonb_build_object('resultId', v_detail.result_id, 'points', p_points, 'maxPoints', v_detail.max_points)
  );

  RETURN jsonb_build_object('score', v_score, 'maxScore', v_max_score, 'accuracy', v_accuracy);
END;
$$;

REVOKE ALL ON FUNCTION public.is_mock_reviewer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_mock_reviewer_of_result(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_mock_reviewer_of_student(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_mock_reviewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mock_reviewer_of_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mock_reviewer_of_student(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
