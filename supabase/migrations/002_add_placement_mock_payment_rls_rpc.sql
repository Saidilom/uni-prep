-- ============================================
-- Migration: Placement, Mock, Payment + RLS + RPC
-- ============================================

-- -------------------------------------------
-- 1. Placement tables
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_tests (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text,
  passing_score int NOT NULL DEFAULT 0,
  time_limit_minutes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.placement_questions (
  id uuid PRIMARY KEY,
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  text text NOT NULL,
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  points int NOT NULL DEFAULT 1,
  "order" int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.placement_assignments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  test_title text NOT NULL,
  status text NOT NULL DEFAULT 'assigned',
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.placement_results (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES placement_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  test_title text NOT NULL,
  user_name text NOT NULL,
  user_surname text,
  user_phone text,
  score int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  accuracy int NOT NULL DEFAULT 0,
  time_spent_seconds int NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.placement_answer_details (
  id uuid PRIMARY KEY,
  result_id uuid NOT NULL REFERENCES placement_results(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  question_text text NOT NULL,
  selected_answer text NOT NULL DEFAULT '',
  is_correct boolean NOT NULL DEFAULT false,
  points_earned int NOT NULL DEFAULT 0
);

-- -------------------------------------------
-- 2. Mock tables
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS public.mock_tests (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'free',
  price int NOT NULL DEFAULT 0,
  duration_minutes int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.mock_sections (
  id uuid PRIMARY KEY,
  mock_test_id uuid NOT NULL REFERENCES mock_tests(id) ON DELETE CASCADE,
  title text NOT NULL,
  "order" int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.mock_questions (
  id uuid PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES mock_sections(id) ON DELETE CASCADE,
  text text NOT NULL,
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  points int NOT NULL DEFAULT 1,
  "order" int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.mock_access (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mock_test_id uuid NOT NULL REFERENCES mock_tests(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'registan',
  granted_at timestamptz NOT NULL DEFAULT now(),
  payment_id uuid
);

CREATE TABLE IF NOT EXISTS public.mock_results (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mock_test_id uuid NOT NULL REFERENCES mock_tests(id) ON DELETE CASCADE,
  mock_test_title text NOT NULL,
  score int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  accuracy int NOT NULL DEFAULT 0,
  section_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  time_spent_seconds int NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------
-- 3. Payments table
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_phone text NOT NULL,
  mock_test_id uuid NOT NULL REFERENCES mock_tests(id) ON DELETE CASCADE,
  mock_test_title text NOT NULL,
  amount int NOT NULL,
  currency text NOT NULL DEFAULT 'UZS',
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL,
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------
-- 3.5 Users table: enable RLS + guard privileged fields
-- -------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY users_admin_full_access ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Non-admins can update their own row, but cannot self-promote role or
-- grant themselves Registan-student status.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
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
    NEW.id,
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
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------
-- 5. Indexes
-- -------------------------------------------
CREATE INDEX IF NOT EXISTS idx_placement_assignments_user_id_status ON placement_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_placement_results_user_id_completed_at ON placement_results(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_payments_status_paid_at ON payments(status, paid_at);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_is_registan_student ON users(isRegistanStudent);

CREATE INDEX IF NOT EXISTS idx_placement_questions_test_id ON placement_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_placement_assignments_user_id ON placement_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_placement_results_user_id ON placement_results(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_sections_mock_test_id ON mock_sections(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_questions_section_id ON mock_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_mock_access_user_id ON mock_access(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_access_mock_test_id ON mock_access(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_results_user_id ON mock_results(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- -------------------------------------------
-- 6. Public question functions (hide correct_answer)
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

-- -------------------------------------------
-- 7. RLS policies
-- -------------------------------------------

-- placement_tests
ALTER TABLE placement_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY placement_tests_read_auth ON placement_tests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY placement_tests_admin ON placement_tests
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- placement_questions
ALTER TABLE placement_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY placement_questions_admin ON placement_questions
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- placement_assignments
ALTER TABLE placement_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY placement_assignments_student ON placement_assignments
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY placement_assignments_admin ON placement_assignments
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- placement_results
ALTER TABLE placement_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY placement_results_student ON placement_results
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY placement_results_admin ON placement_results
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- placement_answer_details
ALTER TABLE placement_answer_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY placement_answer_details_admin ON placement_answer_details
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- mock_tests
ALTER TABLE mock_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_tests_read_auth ON mock_tests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY mock_tests_admin ON mock_tests
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- mock_sections
ALTER TABLE mock_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_sections_read_auth ON mock_sections
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY mock_sections_admin ON mock_sections
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- mock_questions
ALTER TABLE mock_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_questions_admin ON mock_questions
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- mock_access
ALTER TABLE mock_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_access_student ON mock_access
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mock_access_admin ON mock_access
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- mock_results
ALTER TABLE mock_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_results_student ON mock_results
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mock_results_admin ON mock_results
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_student ON payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY payments_admin ON payments
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- -------------------------------------------
-- 8. RPC functions
-- -------------------------------------------

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

  IF v_assignment.user_id != auth.uid() THEN
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
    IF p_answers->>v_question.id = v_question.correct_answer THEN
      v_correct := v_correct + 1;
      v_score := v_score + COALESCE(v_question.points, 1);
    END IF;

    v_answers := v_answers || jsonb_build_object(
      'questionId', v_question.id,
      'questionText', v_question.text,
      'selectedAnswer', COALESCE(p_answers->>v_question.id, ''),
      'isCorrect', (p_answers->>v_question.id = v_question.correct_answer),
      'pointsEarned', CASE WHEN p_answers->>v_question.id = v_question.correct_answer THEN COALESCE(v_question.points, 1) ELSE 0 END
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
    WHERE user_id = auth.uid() AND mock_test_id = p_mock_test_id
  ) THEN
    RAISE EXCEPTION 'No access to this mock test';
  END IF;

  SELECT name, surname INTO v_user_name, v_user_surname FROM users WHERE id = auth.uid();

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
      IF p_answers->>v_question.id = v_question.correct_answer THEN
        v_correct := v_correct + 1;
        v_score := v_score + COALESCE(v_question.points, 1);
        v_section_score := v_section_score + COALESCE(v_question.points, 1);
      END IF;

      v_answers := v_answers || jsonb_build_object(
        'questionId', v_question.id,
        'sectionId', v_section.id,
        'selectedAnswer', COALESCE(p_answers->>v_question.id, ''),
        'isCorrect', (p_answers->>v_question.id = v_question.correct_answer),
        'pointsEarned', CASE WHEN p_answers->>v_question.id = v_question.correct_answer THEN COALESCE(v_question.points, 1) ELSE 0 END
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
    auth.uid(),
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
