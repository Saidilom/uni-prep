-- Bug found while testing promote_student_to_teacher (049_staff_role.sql):
-- protect_user_privileged_fields_trg (BEFORE UPDATE ON users, from
-- 002/003_...) silently reverts any change to role/isRegistanStudent unless
-- the calling user (auth.uid()) is already role='admin' — it doesn't know
-- about the new 'staff' role at all. Since auth.uid() is a session-level
-- setting (reads request.jwt.claim.sub), it resolves to the ORIGINAL
-- caller even inside promote_student_to_teacher's SECURITY DEFINER body —
-- so the trigger saw a non-admin caller, silently reset NEW.role back to
-- OLD.role, and the RPC appeared to succeed (no exception) while doing
-- nothing at all. Confirmed by direct testing: role stayed 'student' after
-- a successful-looking promote_student_to_teacher call.
--
-- Fix: widen the trigger's exception list with the exact same narrowness as
-- the RPC itself already enforces — a staff caller may only flip
-- student -> teacher, nothing else, and isRegistanStudent stays protected
-- even in that case. Every other protection (only role='admin' callers may
-- otherwise change role/isRegistanStudent; the permanent super admin id
-- always stays 'admin') is unchanged.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    NEW.role := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin') THEN
    NULL; -- full admin: no restriction
  ELSIF public.is_staff() AND OLD.role = 'student' AND NEW.role = 'teacher' THEN
    NEW.isRegistanStudent := OLD.isRegistanStudent; -- staff's one sanctioned action
  ELSE
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
