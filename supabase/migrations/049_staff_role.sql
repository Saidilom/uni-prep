-- New role: "staff" — a limited admin the real (super) admin grants to
-- employees whose only job is turning students into teachers, since there
-- are too many teachers to manage by hand. Deliberately NOT the same as
-- role='admin' (which keeps its full existing power everywhere via
-- is_admin()) — staff gets its own narrow SECURITY DEFINER helper and just
-- enough RLS to search students and browse the teacher list, plus one RPC
-- to actually do the promotion. No CHECK constraint exists on users.role
-- (confirmed: only users_locale_check), so the new value needs no column
-- migration, just the policies/function below.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'staff');
$$;

-- Same pattern as the existing users_teacher_read_students (010_teacher_classes.sql):
-- narrow, role-scoped read grants, nothing broader.
CREATE POLICY users_staff_read_students ON public.users
  FOR SELECT USING (public.is_staff() AND role = 'student');
CREATE POLICY users_staff_read_teachers ON public.users
  FOR SELECT USING (public.is_staff() AND role = 'teacher');

-- The actual promotion goes through an RPC rather than a broad UPDATE RLS
-- policy — narrower, auditable (the existing audit_log_role_change_trg from
-- 015_audit_log.sql fires on this UPDATE exactly like any other role
-- change, no extra work needed there), and it refuses to "promote" anyone
-- who isn't currently a plain student (protects against fat-fingering an
-- existing teacher/admin/staff row).
CREATE OR REPLACE FUNCTION public.promote_student_to_teacher(p_student_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF NOT (public.is_staff() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_current_role FROM public.users WHERE id = p_student_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_current_role != 'student' THEN
    RAISE EXCEPTION 'User is not a student (current role: %)', v_current_role;
  END IF;

  UPDATE public.users SET role = 'teacher' WHERE id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_student_to_teacher(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_student_to_teacher(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
