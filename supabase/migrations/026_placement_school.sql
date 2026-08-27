-- Migration 026: "Школа" — Placement becomes a single self-service test
-- reached via the reception QR code instead of a per-student admin
-- assignment. Adds is_active so exactly one placement_test is "the"
-- current test students land on and self-assign into.
--
-- No new RLS is needed for the self-assignment insert itself:
-- placement_assignments_student is `FOR ALL USING (auth.uid()::text =
-- user_id)` with no separate WITH CHECK, so the USING clause already
-- doubles as the INSERT check — verified live against the real database
-- (a session impersonating a real user id successfully inserted its own
-- placement_assignments row). placement_tests_read_auth already lets any
-- authenticated user SELECT placement_tests, so a student can read which
-- one is active.

ALTER TABLE public.placement_tests ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS placement_tests_single_active
  ON public.placement_tests (is_active)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.set_active_placement_test(p_test_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.placement_tests SET is_active = false WHERE is_active;
  UPDATE public.placement_tests SET is_active = true WHERE id = p_test_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_placement_test(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_placement_test(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
