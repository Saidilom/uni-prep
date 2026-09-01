-- CRITICAL FIX: 035_student_read_own_teacher.sql and 036_student_read_own_class.sql
-- each embedded a raw correlated subquery directly in a policy's USING
-- clause, touching a table that itself has RLS — exactly the anti-pattern
-- CLAUDE.md warns about for is_admin()/is_teacher(). The two policies formed
-- a genuine cycle across three tables:
--   SELECT public.users (policy 035) -> subquery reads class_members
--     -> class_members_teacher_own policy -> subquery reads classes
--       -> classes_student_read_own policy (036) -> subquery reads class_members again
--         -> infinite recursion (Postgres error 42P17), turning into a 500
--            on ANY select of public.users for ANY authenticated user,
--            including a user fetching their own profile row on login.
-- Fix: move both cross-table checks into SECURITY DEFINER functions, owned
-- by postgres (same as is_admin()/is_teacher()), which bypass RLS on the
-- tables they read internally and therefore cannot re-enter this cycle.
CREATE OR REPLACE FUNCTION public.is_class_member(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = p_class_id AND cm.student_id = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_current_student(p_teacher_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members cm
    JOIN public.classes c ON c.id = cm.class_id
    WHERE cm.student_id = auth.uid()::text AND c.teacher_id = p_teacher_id
  );
$$;

DROP POLICY IF EXISTS classes_student_read_own ON public.classes;
CREATE POLICY classes_student_read_own ON public.classes
  FOR SELECT USING (public.is_class_member(id));

DROP POLICY IF EXISTS users_student_read_own_teacher ON public.users;
CREATE POLICY users_student_read_own_teacher ON public.users
  FOR SELECT USING (role = 'teacher' AND public.is_teacher_of_current_student(id));

NOTIFY pgrst, 'reload schema';
