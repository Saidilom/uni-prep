-- Оценка сочинения ПО КРИТЕРИЯМ, а не одним числом.
--
-- ЧТО БЫЛО. Форма проверки принимала одно число 0…24 шагом 0,1, и двенадцать
-- критериев официального документа сворачивались в него ДО записи. В базе не
-- оставалось ничего, кроме суммы: ни за что снижено, ни насколько.
--
-- ЧТО СТАНОВИТСЯ. Проверяющий выставляет каждый из 12 критериев отдельно,
-- значения хранятся по критериям, а сырой балл есть их сумма.
--
-- ═══ ИСТОЧНИК И ОДНО ВАЖНОЕ РАСХОЖДЕНИЕ ═══
--
-- Документ лежит в репозитории: tests-pdf/узб/ona_tili_yozma_2025_yangi.pdf,
-- «...YOZMA ISH (ESSE)NI BAHOLASH MEZONI».
--
-- Ставилась задача «12 критериев по шкале 0/1/2». В документе критериев
-- действительно 12, но шкала внутри критерия ПЯТИУРОВНЕВАЯ:
--
--     2  |  1,5  |  1  |  0,5  |  0
--
-- Итог тот же — под таблицей стоит «JAMI: 24 BALL», 12 × 2 = 24, — но уровней
-- пять, а не три. Сделано по документу: форма с тремя уровнями не смогла бы
-- выразить официальный критерий, и половина оценок округлялась бы вслепую.
--
-- Двенадцать критериев сгруппированы в пять разделов, как в бумаге:
--   1–3   TOPSHIRIQ TALABLARINING BAJARILGANLIGI
--   4–6   MATN YAXLITLIGI
--   7–8   SAVODXONLIK
--   9–10  TIL BIRLIKLARI USLUBIYATI
--   11–12 LUG'AT BOYLIGI
--
-- Живая логика и нумерация — src/lib/essay-rubric.ts, покрыта тестами.

-- ═══ 1. Оценки по критериям ═══

CREATE TABLE IF NOT EXISTS public.mock_essay_criterion_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_detail_id uuid NOT NULL REFERENCES public.mock_answer_details(id) ON DELETE CASCADE,

  -- Номер критерия в документе, 1–12. Именно номер, а не индекс массива: по
  -- нему сверяют с бумагой.
  criterion_index integer NOT NULL,

  -- Оценка. Шкала документа, пять уровней.
  score numeric NOT NULL,

  scored_by text REFERENCES public.users(id) ON DELETE SET NULL,
  scored_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mock_essay_criterion_scores IS
  'Оценки сочинения по 12 критериям официального документа (tests-pdf/узб/ona_tili_yozma_2025_yangi.pdf). Шкала 2/1.5/1/0.5/0, сумма = сырой балл, максимум 24.';

CREATE UNIQUE INDEX IF NOT EXISTS mock_essay_criterion_scores_uq
  ON public.mock_essay_criterion_scores (answer_detail_id, criterion_index);

ALTER TABLE public.mock_essay_criterion_scores
  DROP CONSTRAINT IF EXISTS mock_essay_criterion_index_check;
ALTER TABLE public.mock_essay_criterion_scores
  ADD CONSTRAINT mock_essay_criterion_index_check
  CHECK (criterion_index BETWEEN 1 AND 12);

-- Шкала закреплена в базе, а не только в форме: сюда пишет RPC, и если завтра
-- кто-то добавит второй путь записи, произвольное 1,7 всё равно не пройдёт.
ALTER TABLE public.mock_essay_criterion_scores
  DROP CONSTRAINT IF EXISTS mock_essay_criterion_score_check;
ALTER TABLE public.mock_essay_criterion_scores
  ADD CONSTRAINT mock_essay_criterion_score_check
  CHECK (score IN (0, 0.5, 1, 1.5, 2));

ALTER TABLE public.mock_essay_criterion_scores ENABLE ROW LEVEL SECURITY;

-- Читают те же, кто видит сам ответ: ученик свою работу, проверяющий и админ.
-- Пишет только RPC (SECURITY DEFINER) — прямой записи нет ни у кого, иначе
-- сумма в mock_answer_details разошлась бы с критериями.
DROP POLICY IF EXISTS mock_essay_criterion_scores_read ON public.mock_essay_criterion_scores;
CREATE POLICY mock_essay_criterion_scores_read ON public.mock_essay_criterion_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mock_answer_details ad
      JOIN public.mock_results r ON r.id = ad.result_id
      WHERE ad.id = answer_detail_id
        AND (r.user_id = auth.uid()::text
             OR public.is_admin()
             OR public.is_mock_reviewer_of_result(ad.result_id))
    )
  );

-- ═══ 2. Вердикт вместо оценки ═══
--
-- Документ описывает случаи, когда работа НЕ проверяется по критериям:
-- «Esse quyidagi hollarda tekshirilmaydi va 2 ball bilan baholanadi» — не на
-- тему, короче 100 слов, списана; и «Esse yozilmagan bo'lsa, 0 ball beriladi».
--
-- Это решение ВМЕСТО оценивания, поэтому оно отдельное поле, а не двенадцать
-- нулей: иначе двойка «не на тему» была бы неотличима от двойки, набранной по
-- критериям, и в модель попала бы как обычное наблюдение. У такой работы строк
-- в mock_essay_criterion_scores нет вовсе — критерии не оценивались.
ALTER TABLE public.mock_answer_details
  ADD COLUMN IF NOT EXISTS essay_verdict text;

COMMENT ON COLUMN public.mock_answer_details.essay_verdict IS
  'SCORED (оценено по 12 критериям) | OFF_TOPIC | TOO_SHORT | PLAGIARISM (не проверяется, 2 балла) | NOT_WRITTEN (0). Из документа BAHOLASH MEZONI.';

ALTER TABLE public.mock_answer_details
  DROP CONSTRAINT IF EXISTS mock_answer_details_essay_verdict_check;
ALTER TABLE public.mock_answer_details
  ADD CONSTRAINT mock_answer_details_essay_verdict_check
  CHECK (essay_verdict IS NULL
         OR essay_verdict IN ('SCORED', 'OFF_TOPIC', 'TOO_SHORT', 'PLAGIARISM', 'NOT_WRITTEN'));

-- ═══ 3. Право на проверку — одно на два RPC ═══
--
-- Проверка «кому можно проверять» была вписана прямо в review_mock_response.
-- Второй RPC ниже требует ровно ту же проверку, и держать её двумя копиями
-- нельзя: ужесточат одну — вторая останется дырой. Поэтому логика вынесена
-- как есть, без изменения смысла: админ; назначенный проверяющий мока; автор
-- теста, но только для своих учеников.
CREATE OR REPLACE FUNCTION public.can_review_mock_response(p_detail_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detail record;
BEGIN
  SELECT mad.id, r.mock_test_id, r.user_id
  INTO v_detail
  FROM public.mock_answer_details mad
  JOIN public.mock_results r ON r.id = mad.result_id
  WHERE mad.id = p_detail_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.is_admin() THEN RETURN true; END IF;
  IF public.is_mock_reviewer(v_detail.mock_test_id) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.mock_tests mt
    WHERE mt.id = v_detail.mock_test_id AND mt.created_by = auth.uid()::text
      AND (
        EXISTS (
          SELECT 1 FROM public.mock_student_assignments msa
          WHERE msa.mock_test_id = mt.id AND msa.student_id = v_detail.user_id
            AND msa.assigned_by = auth.uid()::text
        )
        OR EXISTS (
          SELECT 1 FROM public.mock_class_assignments mca
          JOIN public.classes c ON c.id = mca.class_id AND c.teacher_id = auth.uid()::text
          JOIN public.class_members cm ON cm.class_id = c.id AND cm.student_id = v_detail.user_id
          WHERE mca.mock_test_id = mt.id
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_review_mock_response(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_mock_response(uuid) TO authenticated;

-- ═══ 4. Проверка сочинения по критериям ═══
--
-- p_scores — массив из 12 объектов {"index": 1..12, "score": 0|0.5|1|1.5|2}.
-- p_verdict — 'SCORED' либо один из отказных случаев документа.
--
-- Сырой балл НЕ приходит снаружи: он считается здесь как сумма критериев.
-- Принять его параметром значило бы разрешить сумме разойтись с тем, из чего
-- она сложена.
CREATE OR REPLACE FUNCTION public.review_mock_essay_criteria(
  p_detail_id uuid,
  p_scores jsonb,
  p_verdict text DEFAULT 'SCORED',
  p_feedback text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detail record;
  v_points numeric := 0;
  v_count int := 0;
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

  IF NOT public.can_review_mock_response(p_detail_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_detail.review_status NOT IN ('pending', 'ai_graded') THEN
    RAISE EXCEPTION 'Response is not pending review';
  END IF;
  IF p_verdict NOT IN ('SCORED', 'OFF_TOPIC', 'TOO_SHORT', 'PLAGIARISM', 'NOT_WRITTEN') THEN
    RAISE EXCEPTION 'Unknown verdict %', p_verdict;
  END IF;

  IF p_verdict = 'SCORED' THEN
    -- Набор обязан быть ПОЛНЫМ. Недостающий критерий — это не ноль за него, а
    -- оценка, которой не существует; досчитать её нулём значило бы занизить
    -- балл ученика молча.
    SELECT count(*), COALESCE(sum((elem->>'score')::numeric), 0)
    INTO v_count, v_points
    FROM jsonb_array_elements(p_scores) AS elem;

    IF v_count <> 12 THEN
      RAISE EXCEPTION 'Ожидается 12 критериев, пришло %', v_count;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_scores) AS elem
      WHERE (elem->>'index')::int NOT BETWEEN 1 AND 12
         OR (elem->>'score')::numeric NOT IN (0, 0.5, 1, 1.5, 2)
    ) THEN
      RAISE EXCEPTION 'Оценка вне шкалы 2 / 1.5 / 1 / 0.5 / 0 либо номер критерия вне 1..12';
    END IF;
    IF (SELECT count(DISTINCT (elem->>'index')::int) FROM jsonb_array_elements(p_scores) AS elem) <> 12 THEN
      RAISE EXCEPTION 'Номера критериев повторяются';
    END IF;
  ELSIF p_verdict = 'NOT_WRITTEN' THEN
    v_points := 0;
  ELSE
    -- OFF_TOPIC / TOO_SHORT / PLAGIARISM: «tekshirilmaydi va 2 ball bilan
    -- baholanadi» — работа не проверяется и получает 2 балла.
    v_points := 2;
  END IF;

  IF v_points > v_detail.max_points THEN
    RAISE EXCEPTION 'Сумма % больше максимума задания %', v_points, v_detail.max_points;
  END IF;

  -- Переписываем набор критериев целиком: у отказных вердиктов строк не
  -- остаётся вовсе — критерии не оценивались, и это НЕ двенадцать нулей.
  DELETE FROM public.mock_essay_criterion_scores WHERE answer_detail_id = p_detail_id;
  IF p_verdict = 'SCORED' THEN
    INSERT INTO public.mock_essay_criterion_scores (answer_detail_id, criterion_index, score, scored_by)
    SELECT p_detail_id, (elem->>'index')::int, (elem->>'score')::numeric, auth.uid()::text
    FROM jsonb_array_elements(p_scores) AS elem;
  END IF;

  UPDATE public.mock_answer_details
  SET points_earned = v_points,
      is_correct = (v_points = max_points AND max_points > 0),
      review_status = 'reviewed',
      essay_verdict = p_verdict,
      review_feedback = NULLIF(trim(p_feedback), ''),
      reviewed_by = auth.uid()::text,
      reviewed_at = now()
  WHERE id = p_detail_id;

  -- Пересчёт агрегатов работы — тот же, что в review_mock_response.
  SELECT COALESCE(sum(points_earned), 0), COALESCE(sum(max_points), 0), count(*) FILTER (WHERE is_correct)
  INTO v_score, v_max_score, v_correct
  FROM public.mock_answer_details WHERE result_id = v_detail.result_id;
  v_accuracy := CASE WHEN v_max_score > 0 THEN round(v_score / v_max_score * 100) ELSE 0 END;

  UPDATE public.mock_results
  SET score = v_score, correct_answers = v_correct, accuracy = v_accuracy
  WHERE id = v_detail.result_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'mock_essay_reviewed_by_criteria',
    'mock_answer_detail',
    p_detail_id::text,
    jsonb_build_object(
      'resultId', v_detail.result_id,
      'verdict', p_verdict,
      'points', v_points,
      'maxPoints', v_detail.max_points,
      'criteria', p_scores
    )
  );

  RETURN jsonb_build_object(
    'points', v_points, 'verdict', p_verdict,
    'score', v_score, 'maxScore', v_max_score, 'accuracy', v_accuracy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_mock_essay_criteria(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_mock_essay_criteria(uuid, jsonb, text, text) TO authenticated;

-- Уже проверенные 54 работы этой миграцией НЕ трогаются: у них выставлен
-- балл 0 и строк по критериям нет — и это честно, критерии по ним никто не
-- заполнял. Балл, уровень и θ миграция не меняет вовсе.

NOTIFY pgrst, 'reload schema';
