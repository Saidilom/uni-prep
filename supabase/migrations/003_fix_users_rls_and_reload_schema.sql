-- ============================================
-- Migration 003: users RLS/privilege guard + re-affirm RPCs
-- ============================================
-- Context: migration 002 was applied to this project BEFORE the Priority-0
-- edits in this repo (which incorrectly assumed public.users.id is uuid —
-- it is actually text, a leftover from the Firebase-era migration). Those
-- edits were only ever saved to the local file and never pushed. This
-- migration adds the one genuinely-missing piece (RLS on public.users) using
-- casts that match the REAL text-typed user_id/id columns, and re-declares
-- the RPCs (identical logic, correct casts) so Postgres broadcasts a
-- PostgREST schema-cache-reload notification — cheap insurance against the
-- schema-cache-out-of-sync 42883 errors seen intermittently on submit_placement.

-- -------------------------------------------
-- Users table: enable RLS + guard privileged fields
-- -------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid()::text = id);

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (auth.uid()::text = id) WITH CHECK (auth.uid()::text = id);

DROP POLICY IF EXISTS users_admin_full_access ON public.users;
CREATE POLICY users_admin_full_access ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()::text AND u.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin') THEN
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_privileged_fields_trg ON public.users;
CREATE TRIGGER protect_user_privileged_fields_trg
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileged_fields();

-- -------------------------------------------
-- Re-affirm RPCs (same logic, casts matching the real text user_id/id
-- columns) — re-declaring triggers PostgREST's schema-cache reload.
-- -------------------------------------------

CREATE OR REPLACE FUNCTION public.get_placement_questions(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, test_id, text, options, points, "order"
  FROM placement_questions
  WHERE test_id = p_test_id
  ORDER BY "order";
$$;

CREATE OR REPLACE FUNCTION public.get_mock_questions(p_section_id uuid)
RETURNS TABLE (
  id uuid,
  section_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, section_id, text, options, points, "order"
  FROM mock_questions
  WHERE section_id = p_section_id
  ORDER BY "order";
$$;

CREATE OR REPLACE FUNCTION public.submit_placement(
  p_assignment_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment record;
  v_question record;
  v_result_id uuid;
  v_score int := 0;
  v_total int := 0;
  v_correct int := 0;
  v_percentage int;
  v_answers jsonb := '[]'::jsonb;
  v_user_name text;
  v_user_surname text;
  v_user_phone text;
  v_test_title text;
BEGIN
  SELECT * INTO v_assignment FROM placement_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_assignment.user_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_assignment.status = 'completed' THEN
    RAISE EXCEPTION 'Assignment already completed';
  END IF;

  SELECT name, surname, phone INTO v_user_name, v_user_surname, v_user_phone
  FROM users WHERE id = v_assignment.user_id;

  SELECT title INTO v_test_title FROM placement_tests WHERE id = v_assignment.test_id;

  FOR v_question IN
    SELECT * FROM placement_questions WHERE test_id = v_assignment.test_id ORDER BY "order"
  LOOP
    v_total := v_total + 1;
    IF p_answers->>v_question.id::text = v_question.correct_answer THEN
      v_correct := v_correct + 1;
      v_score := v_score + COALESCE(v_question.points, 1);
    END IF;

    v_answers := v_answers || jsonb_build_object(
      'questionId', v_question.id,
      'questionText', v_question.text,
      'selectedAnswer', COALESCE(p_answers->>v_question.id::text, ''),
      'isCorrect', (p_answers->>v_question.id::text = v_question.correct_answer),
      'pointsEarned', CASE WHEN p_answers->>v_question.id::text = v_question.correct_answer THEN COALESCE(v_question.points, 1) ELSE 0 END
    );
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO placement_results (
    id, assignment_id, user_id, test_id, test_title, user_name, user_surname, user_phone,
    score, total_questions, correct_answers, accuracy, time_spent_seconds, answers, completed_at
  ) VALUES (
    gen_random_uuid(),
    p_assignment_id,
    v_assignment.user_id,
    v_assignment.test_id,
    v_test_title,
    v_user_name,
    v_user_surname,
    v_user_phone,
    v_score,
    v_total,
    v_correct,
    v_percentage,
    p_time_spent_seconds,
    v_answers,
    now()
  ) RETURNING id INTO v_result_id;

  UPDATE placement_assignments SET status = 'completed', completed_at = now() WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'resultId', v_result_id,
    'score', v_score,
    'total', v_total,
    'percentage', v_percentage,
    'answers', v_answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_mock(
  p_mock_test_id uuid,
  p_answers jsonb,
  p_time_spent_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_user_name text;
  v_user_surname text;
BEGIN
  SELECT * INTO v_mock_test FROM mock_tests WHERE id = p_mock_test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mock test not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mock_access
    WHERE user_id = auth.uid()::text AND mock_test_id = p_mock_test_id
  ) THEN
    RAISE EXCEPTION 'No access to this mock test';
  END IF;

  SELECT name, surname INTO v_user_name, v_user_surname FROM users WHERE id = auth.uid()::text;

  FOR v_section IN
    SELECT * FROM mock_sections WHERE mock_test_id = p_mock_test_id ORDER BY "order"
  LOOP
    v_section_score := 0;
    v_section_total := 0;

    FOR v_question IN
      SELECT * FROM mock_questions WHERE section_id = v_section.id ORDER BY "order"
    LOOP
      v_total := v_total + 1;
      v_section_total := v_section_total + 1;
      IF p_answers->>v_question.id::text = v_question.correct_answer THEN
        v_correct := v_correct + 1;
        v_score := v_score + COALESCE(v_question.points, 1);
        v_section_score := v_section_score + COALESCE(v_question.points, 1);
      END IF;

      v_answers := v_answers || jsonb_build_object(
        'questionId', v_question.id,
        'sectionId', v_section.id,
        'selectedAnswer', COALESCE(p_answers->>v_question.id::text, ''),
        'isCorrect', (p_answers->>v_question.id::text = v_question.correct_answer),
        'pointsEarned', CASE WHEN p_answers->>v_question.id::text = v_question.correct_answer THEN COALESCE(v_question.points, 1) ELSE 0 END
      );
    END LOOP;

    v_section_scores := v_section_scores || jsonb_build_object(
      v_section.id,
      jsonb_build_object(
        'title', v_section.title,
        'score', v_section_score,
        'total', v_section_total
      )
    );
  END LOOP;

  v_percentage := CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100) ELSE 0 END;

  INSERT INTO mock_results (
    id, user_id, mock_test_id, mock_test_title, score, total_questions, correct_answers,
    accuracy, section_scores, time_spent_seconds, completed_at
  ) VALUES (
    gen_random_uuid(),
    auth.uid()::text,
    p_mock_test_id,
    v_mock_test.title,
    v_score,
    v_total,
    v_correct,
    v_percentage,
    v_section_scores,
    p_time_spent_seconds,
    now()
  ) RETURNING id INTO v_result_id;

  RETURN jsonb_build_object(
    'resultId', v_result_id,
    'score', v_score,
    'total', v_total,
    'percentage', v_percentage,
    'sectionScores', v_section_scores,
    'answers', v_answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_short_id text;
BEGIN
  v_short_id := upper(substr(md5(random()::text), 1, 6));
  INSERT INTO public.users (
    id, shortId, email, phone, name, surname, role, isRegistanStudent, registeredVia, createdAt, updatedAt
  ) VALUES (
    NEW.id::text,
    v_short_id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Ученик'),
    '',
    'student',
    false,
    COALESCE(NEW.raw_user_meta_data->>'provider', 'google'),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Explicit belt-and-suspenders schema cache reload (Supabase's DDL event
-- trigger normally does this automatically, but the earlier 42883s suggest
-- it may not have propagated to every PostgREST instance).
NOTIFY pgrst, 'reload schema';
