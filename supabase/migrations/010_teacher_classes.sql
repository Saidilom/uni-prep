-- Migration 010: Teacher + Classes (Группа 2 из PLAN-REGISTAN-V3.md)
-- ============================================
-- Fresh schema — the legacy public.classes table (001_init.sql) is not
-- reused: it has no RLS, uses a uuid[] students array instead of a join
-- table, and its teacherId column is uuid while users.id is actually text
-- (same drift as everywhere else in this schema). Confirmed via
-- `supabase db query --linked` on 2026-08-25 that the legacy table has 0
-- rows and `CREATE TABLE IF NOT EXISTS public.classes` below would
-- otherwise silently no-op against it (name collision, wrong shape) — safe
-- to drop and replace outright since there is no data to lose. This is
-- exactly the replacement already documented as intended in
-- PLAN-REGISTAN-V3.md task 9/46.
--
-- All user-referencing FK columns are declared `text`, matching the real
-- (drifted) type of users.id — verified via `supabase db query --linked`
-- against every other user_id column in this schema (mock_access,
-- mock_results, payments, placement_assignments/results all real text).

DROP TABLE IF EXISTS public.classes CASCADE;

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY,
  teacher_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_members (
  id uuid PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Third mock_tests.type alongside 'free'/'paid' (no CHECK constraint exists
-- on that column, so no ALTER needed) — a class_only mock is only reachable
-- by students in a class it's been assigned to via this table.
CREATE TABLE IF NOT EXISTS public.mock_class_assignments (
  id uuid PRIMARY KEY,
  mock_test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mock_test_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_members_class_id ON public.class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student_id ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_mock_class_assignments_class_id ON public.mock_class_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_mock_class_assignments_mock_test_id ON public.mock_class_assignments(mock_test_id);

-- SECURITY DEFINER helper, same pattern as public.is_admin() (migration
-- 004) — avoids RLS recursion and keeps policies short.
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'teacher');
$$;

-- Teachers own their classes; admins have full access.
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY classes_teacher_own ON public.classes
  FOR ALL USING (auth.uid()::text = teacher_id) WITH CHECK (auth.uid()::text = teacher_id);
CREATE POLICY classes_admin ON public.classes
  FOR ALL USING (public.is_admin());

-- Teachers manage members of their own classes; a student can see which
-- classes they belong to (needed client-side for class_only mock access
-- checks); admins have full access.
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_members_teacher_own ON public.class_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()::text)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()::text)
  );
CREATE POLICY class_members_student_read_own ON public.class_members
  FOR SELECT USING (auth.uid()::text = student_id);
CREATE POLICY class_members_admin ON public.class_members
  FOR ALL USING (public.is_admin());

-- Any authenticated user may read assignment rows (not sensitive — just
-- "mock X is assigned to class Y", needed for the class_only access check).
-- Only the owning teacher (or admin) may create/remove assignments.
ALTER TABLE public.mock_class_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mock_class_assignments_read_auth ON public.mock_class_assignments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY mock_class_assignments_teacher_own ON public.mock_class_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()::text)
  );
CREATE POLICY mock_class_assignments_teacher_delete_own ON public.mock_class_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()::text)
  );
CREATE POLICY mock_class_assignments_admin ON public.mock_class_assignments
  FOR ALL USING (public.is_admin());

-- A teacher needs to search/find students by Student ID before adding them
-- to a class — the existing users_select_own policy only lets a user read
-- their own row. This grants any teacher SELECT on rows with role='student'
-- (not a broader grant: teachers still cannot read other teachers/admins).
DROP POLICY IF EXISTS users_teacher_read_students ON public.users;
CREATE POLICY users_teacher_read_students ON public.users
  FOR SELECT USING (public.is_teacher() AND role = 'student');

NOTIFY pgrst, 'reload schema';
