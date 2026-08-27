-- Migration 017: PDF-first universal Mock tests
-- Keeps legacy A-D rows working while adding authorship, drafts, AI import,
-- individual assignments and universal response shapes.

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS subject_id text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS source_pdf_path text,
  ADD COLUMN IF NOT EXISTS import_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.mock_tests DROP CONSTRAINT IF EXISTS mock_tests_status_check;
ALTER TABLE public.mock_tests ADD CONSTRAINT mock_tests_status_check
  CHECK (status IN ('draft', 'review', 'published', 'archived'));

UPDATE public.mock_tests
SET published_at = COALESCE(published_at, created_at)
WHERE status = 'published' AND published_at IS NULL;

ALTER TABLE public.mock_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'single_choice',
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_key jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_page int,
  ADD COLUMN IF NOT EXISTS group_key text,
  ADD COLUMN IF NOT EXISTS requires_manual_review boolean NOT NULL DEFAULT false;

UPDATE public.mock_questions
SET answer_key = jsonb_build_object('value', correct_answer)
WHERE answer_key = '{}'::jsonb AND correct_answer <> '';

CREATE TABLE IF NOT EXISTS public.mock_student_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  UNIQUE (mock_test_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.mock_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  detected_subject text,
  detected_language text,
  model text,
  result jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('processing', 'review', 'failed', 'published'))
);

ALTER TABLE public.mock_answer_details
  ADD COLUMN IF NOT EXISTS selected_response jsonb,
  ADD COLUMN IF NOT EXISTS answer_key_json jsonb,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'auto_graded';

CREATE INDEX IF NOT EXISTS idx_mock_tests_created_by ON public.mock_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_mock_tests_subject_status ON public.mock_tests(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_mock_student_assignments_student ON public.mock_student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_mock_student_assignments_test ON public.mock_student_assignments(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_imports_created_by ON public.mock_imports(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_questions_group_key ON public.mock_questions(section_id, group_key);

-- Private storage bucket for source exams. Objects are delivered only through
-- short-lived signed URLs after an application-level access check.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('test-imports', 'test-imports', false, 33554432, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.mock_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY mock_student_assignments_student_read ON public.mock_student_assignments
  FOR SELECT USING (student_id = auth.uid()::text);
CREATE POLICY mock_student_assignments_teacher_manage ON public.mock_student_assignments
  FOR ALL USING (
    assigned_by = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = mock_student_assignments.student_id
        AND c.teacher_id = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_student_assignments.mock_test_id
        AND mt.created_by = auth.uid()::text
        AND mt.type = 'class_only'
        AND mt.price = 0
    )
  ) WITH CHECK (
    assigned_by = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = mock_student_assignments.student_id
        AND c.teacher_id = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_student_assignments.mock_test_id
        AND mt.created_by = auth.uid()::text
        AND mt.type = 'class_only'
        AND mt.price = 0
    )
  );
CREATE POLICY mock_student_assignments_admin ON public.mock_student_assignments
  FOR ALL USING (public.is_admin());

CREATE POLICY mock_imports_owner ON public.mock_imports
  FOR ALL USING (created_by = auth.uid()::text)
  WITH CHECK (created_by = auth.uid()::text);
CREATE POLICY mock_imports_admin ON public.mock_imports
  FOR ALL USING (public.is_admin());

-- Teachers can manage only their own free, assignment-only tests.
CREATE POLICY mock_tests_teacher_own ON public.mock_tests
  FOR ALL USING (created_by = auth.uid()::text AND public.is_teacher())
  WITH CHECK (
    created_by = auth.uid()::text
    AND public.is_teacher()
    AND type = 'class_only'
    AND price = 0
  );

CREATE POLICY mock_sections_teacher_own ON public.mock_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_sections.mock_test_id
        AND mt.created_by = auth.uid()::text
        AND public.is_teacher()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_sections.mock_test_id
        AND mt.created_by = auth.uid()::text
        AND mt.type = 'class_only'
        AND mt.price = 0
        AND public.is_teacher()
    )
  );

CREATE POLICY mock_questions_teacher_own ON public.mock_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.mock_sections ms
      JOIN public.mock_tests mt ON mt.id = ms.mock_test_id
      WHERE ms.id = mock_questions.section_id
        AND mt.created_by = auth.uid()::text
        AND public.is_teacher()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mock_sections ms
      JOIN public.mock_tests mt ON mt.id = ms.mock_test_id
      WHERE ms.id = mock_questions.section_id
        AND mt.created_by = auth.uid()::text
        AND mt.type = 'class_only'
        AND mt.price = 0
        AND public.is_teacher()
    )
  );

-- Class assignments may only point to the teacher's own free tests.
DROP POLICY IF EXISTS mock_class_assignments_teacher_own ON public.mock_class_assignments;
CREATE POLICY mock_class_assignments_teacher_own ON public.mock_class_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()::text)
    AND EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_test_id
        AND mt.created_by = auth.uid()::text
        AND mt.type = 'class_only'
        AND mt.price = 0
        AND mt.status = 'published'
    )
  );

CREATE OR REPLACE FUNCTION public.can_access_mock(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mock_tests mt
    WHERE mt.id = p_mock_test_id
      AND (
        public.is_admin()
        OR mt.created_by = auth.uid()::text
        OR (
          mt.status = 'published'
          AND (
            EXISTS (
              SELECT 1 FROM public.mock_access ma
              WHERE ma.mock_test_id = mt.id AND ma.user_id = auth.uid()::text
            )
            OR (
              mt.type = 'free'
              AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()::text AND u.isRegistanStudent = true
              )
            )
            OR EXISTS (
              SELECT 1 FROM public.mock_student_assignments msa
              WHERE msa.mock_test_id = mt.id AND msa.student_id = auth.uid()::text
            )
            OR EXISTS (
              SELECT 1
              FROM public.mock_class_assignments mca
              JOIN public.class_members cm ON cm.class_id = mca.class_id
              WHERE mca.mock_test_id = mt.id AND cm.student_id = auth.uid()::text
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_mock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_mock(uuid) TO authenticated;

-- Do not expose drafts/archived test metadata or section structure through
-- the old broad authenticated-read policies.
DROP POLICY IF EXISTS mock_tests_read_auth ON public.mock_tests;
CREATE POLICY mock_tests_read_auth ON public.mock_tests
  FOR SELECT USING (status = 'published' OR public.can_access_mock(id));

DROP POLICY IF EXISTS mock_sections_read_auth ON public.mock_sections;
CREATE POLICY mock_sections_read_auth ON public.mock_sections
  FOR SELECT USING (public.can_access_mock(mock_test_id));

CREATE OR REPLACE FUNCTION public.get_mock_questions_v2(p_section_id uuid)
RETURNS TABLE (
  id uuid,
  section_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int,
  image_url text,
  question_type text,
  content jsonb,
  source_page int,
  group_key text,
  requires_manual_review boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT q.id, q.section_id, q.text, q.options, q.points, q."order", q.image_url,
         q.question_type, q.content, q.source_page, q.group_key, q.requires_manual_review
  FROM public.mock_questions q
  JOIN public.mock_sections s ON s.id = q.section_id
  WHERE q.section_id = p_section_id
    AND public.can_access_mock(s.mock_test_id)
  ORDER BY q."order";
$$;

REVOKE ALL ON FUNCTION public.get_mock_questions_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mock_questions_v2(uuid) TO authenticated;

-- Atomic creation from a reviewed AI draft. Client-side code cannot use this
-- function to turn teacher tests into paid products.
CREATE OR REPLACE FUNCTION public.publish_imported_mock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_test_id uuid := gen_random_uuid();
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_section_id uuid;
  v_options jsonb;
  v_type text;
  v_price int;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid()::text;
  IF v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_type := CASE WHEN v_role = 'admin' THEN 'paid' ELSE 'class_only' END;
  v_price := CASE WHEN v_role = 'admin' THEN GREATEST(0, COALESCE((p_payload->>'price')::int, 0)) ELSE 0 END;
  IF v_role = 'admin' AND v_price <= 0 THEN
    RAISE EXCEPTION 'Paid mock price must be greater than zero';
  END IF;

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at
  ) VALUES (
    v_test_id,
    NULLIF(trim(p_payload->>'title'), ''),
    COALESCE(p_payload->>'description', ''),
    v_type,
    v_price,
    GREATEST(1, COALESCE((p_payload->>'durationMinutes')::int, 60)),
    p_payload->>'subject',
    p_payload->>'language',
    auth.uid()::text,
    'published',
    p_payload->>'sourcePdfPath',
    COALESCE(p_payload->'importMetadata', '{}'::jsonb),
    now()
  );

  FOR v_section IN SELECT value FROM jsonb_array_elements(p_payload->'sections') LOOP
    v_section_id := gen_random_uuid();
    INSERT INTO public.mock_sections (id, mock_test_id, title, "order")
    VALUES (
      v_section_id,
      v_test_id,
      COALESCE(NULLIF(trim(v_section->>'title'), ''), 'Раздел'),
      COALESCE((v_section->>'order')::int, 0)
    );

    FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
      v_options := '{}'::jsonb;
      FOR v_option IN SELECT value FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) LOOP
        v_options := v_options || jsonb_build_object(lower(v_option->>'id'), v_option->>'text');
      END LOOP;

      INSERT INTO public.mock_questions (
        id, section_id, text, options, correct_answer, points, "order",
        question_type, content, answer_key, accepted_answers, source_page,
        group_key, requires_manual_review
      ) VALUES (
        gen_random_uuid(),
        v_section_id,
        COALESCE(v_question->>'prompt', ''),
        v_options,
        COALESCE(v_question->'correctOptionIds'->>0, v_question->'acceptedAnswers'->>0, ''),
        GREATEST(0, COALESCE((v_question->>'points')::int, 1)),
        COALESCE((v_question->>'order')::int, 0),
        COALESCE(v_question->>'type', 'single_choice'),
        jsonb_build_object(
          'number', COALESCE(v_question->>'number', ''),
          'sharedStimulus', v_question->'sharedStimulus',
          'needsSourceImage', COALESCE((v_question->>'needsSourceImage')::boolean, false),
          'confidence', COALESCE((v_question->>'confidence')::numeric, 0),
          'reviewNote', v_question->'reviewNote'
        ),
        jsonb_build_object(
          'values', COALESCE(v_question->'correctOptionIds', '[]'::jsonb),
          'accepted', COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)
        ),
        COALESCE(v_question->'acceptedAnswers', '[]'::jsonb),
        NULLIF(v_question->>'sourcePage', '')::int,
        NULLIF(v_question->>'groupKey', ''),
        COALESCE((v_question->>'requiresManualReview')::boolean, false)
      );
    END LOOP;
  END LOOP;

  IF p_payload->>'importId' IS NOT NULL THEN
    UPDATE public.mock_imports
    SET status = 'published', updated_at = now()
    WHERE id = (p_payload->>'importId')::uuid AND created_by = auth.uid()::text;
  END IF;

  RETURN v_test_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_imported_mock(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_imported_mock(jsonb) TO authenticated;

-- Replaces the legacy mock_access-only guard and understands JSON responses.
CREATE OR REPLACE FUNCTION public.submit_mock(
  p_mock_test_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mock_test record;
  v_section record;
  v_question record;
  v_result_id uuid;
  v_score int := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_answers jsonb := '[]'::jsonb;
  v_section_scores jsonb := '{}'::jsonb;
  v_section_score int;
  v_section_total int;
  v_selected jsonb;
  v_selected_text text;
  v_is_correct boolean;
  v_points int;
  v_manual boolean;
BEGIN
  SELECT * INTO v_mock_test FROM public.mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND OR NOT public.can_access_mock(p_mock_test_id) THEN
    RAISE EXCEPTION 'No access to this mock test';
  END IF;

  FOR v_section IN
    SELECT * FROM public.mock_sections WHERE mock_test_id = p_mock_test_id ORDER BY "order"
  LOOP
    v_section_score := 0;
    v_section_total := 0;

    FOR v_question IN
      SELECT * FROM public.mock_questions WHERE section_id = v_section.id ORDER BY "order"
    LOOP
      v_total := v_total + 1;
      v_section_total := v_section_total + 1;
      v_selected := COALESCE(p_answers->v_question.id::text, 'null'::jsonb);
      v_selected_text := COALESCE(v_selected #>> '{}', v_selected::text, '');
      v_manual := v_question.requires_manual_review OR v_question.question_type = 'essay';

      IF v_manual THEN
        v_is_correct := false;
      ELSIF v_question.question_type = 'multiple_choice' THEN
        v_is_correct := v_selected = COALESCE(v_question.answer_key->'values', '[]'::jsonb);
      ELSIF v_question.question_type IN ('short_text', 'number', 'numeric', 'math_expression') THEN
        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_question.accepted_answers, '[]'::jsonb)) AS accepted(value)
          WHERE lower(regexp_replace(trim(accepted.value), '\s+', '', 'g')) =
                lower(regexp_replace(trim(v_selected_text), '\s+', '', 'g'))
        ) INTO v_is_correct;
      ELSE
        v_is_correct := v_selected_text = COALESCE(
          v_question.answer_key->'values'->>0,
          v_question.answer_key->>'value',
          v_question.correct_answer
        );
      END IF;

      v_points := CASE WHEN v_is_correct THEN COALESCE(v_question.points, 1) ELSE 0 END;
      IF v_is_correct THEN
        v_correct := v_correct + 1;
        v_score := v_score + v_points;
        v_section_score := v_section_score + v_points;
      END IF;

      v_answers := v_answers || jsonb_build_object(
        'questionId', v_question.id,
        'sectionId', v_section.id,
        'selectedAnswer', v_selected,
        'isCorrect', v_is_correct,
        'pointsEarned', v_points,
        'reviewStatus', CASE WHEN v_manual THEN 'pending' ELSE 'auto_graded' END
      );
    END LOOP;

    v_section_scores := v_section_scores || jsonb_build_object(
      v_section.id,
      jsonb_build_object('title', v_section.title, 'score', v_section_score, 'total', v_section_total)
    );
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO public.mock_results (
    id, user_id, mock_test_id, mock_test_title, score, total_questions, correct_answers,
    accuracy, section_scores, time_spent_seconds, completed_at
  ) VALUES (
    gen_random_uuid(), auth.uid()::text, p_mock_test_id, v_mock_test.title, v_score,
    v_total, v_correct, v_percentage, v_section_scores, GREATEST(0, p_time_spent_seconds), now()
  ) RETURNING id INTO v_result_id;

  FOR v_question IN
    SELECT q.* FROM public.mock_questions q
    JOIN public.mock_sections s ON s.id = q.section_id
    WHERE s.mock_test_id = p_mock_test_id
  LOOP
    v_selected := COALESCE(p_answers->v_question.id::text, 'null'::jsonb);
    v_selected_text := COALESCE(v_selected #>> '{}', v_selected::text, '');
    v_manual := v_question.requires_manual_review OR v_question.question_type = 'essay';
    IF v_manual THEN
      v_is_correct := false;
    ELSIF v_question.question_type = 'multiple_choice' THEN
      v_is_correct := v_selected = COALESCE(v_question.answer_key->'values', '[]'::jsonb);
    ELSIF v_question.question_type IN ('short_text', 'number', 'numeric', 'math_expression') THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_question.accepted_answers, '[]'::jsonb)) AS accepted(value)
        WHERE lower(regexp_replace(trim(accepted.value), '\s+', '', 'g')) =
              lower(regexp_replace(trim(v_selected_text), '\s+', '', 'g'))
      ) INTO v_is_correct;
    ELSE
      v_is_correct := v_selected_text = COALESCE(v_question.answer_key->'values'->>0, v_question.answer_key->>'value', v_question.correct_answer);
    END IF;
    v_points := CASE WHEN v_is_correct THEN COALESCE(v_question.points, 1) ELSE 0 END;

    INSERT INTO public.mock_answer_details (
      id, result_id, question_id, question_text, selected_answer, correct_answer,
      is_correct, points_earned, selected_response, answer_key_json, review_status
    ) VALUES (
      gen_random_uuid(), v_result_id, v_question.id, v_question.text, v_selected_text,
      COALESCE(v_question.answer_key::text, ''), v_is_correct, v_points, v_selected,
      v_question.answer_key, CASE WHEN v_manual THEN 'pending' ELSE 'auto_graded' END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'resultId', v_result_id, 'score', v_score, 'total', v_total,
    'percentage', v_percentage, 'sectionScores', v_section_scores, 'answers', v_answers,
    'hasPendingReview', EXISTS (
      SELECT 1 FROM public.mock_answer_details mad
      WHERE mad.result_id = v_result_id AND mad.review_status = 'pending'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_log_mock_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NEW.created_by,
    'mock_published',
    'mock_test',
    NEW.id::text,
    jsonb_build_object('title', NEW.title, 'type', NEW.type, 'price', NEW.price, 'subject', NEW.subject_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_mock_published_trg ON public.mock_tests;
CREATE TRIGGER audit_log_mock_published_trg
  AFTER INSERT ON public.mock_tests
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.audit_log_mock_published();

CREATE OR REPLACE FUNCTION public.audit_log_mock_student_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NEW.assigned_by,
    'test_assigned',
    'mock_student_assignment',
    NEW.id::text,
    jsonb_build_object('mockTestId', NEW.mock_test_id, 'studentId', NEW.student_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_mock_student_assigned_trg ON public.mock_student_assignments;
CREATE TRIGGER audit_log_mock_student_assigned_trg
  AFTER INSERT ON public.mock_student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_mock_student_assigned();

REVOKE ALL ON FUNCTION public.submit_mock(uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mock(uuid, jsonb, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
