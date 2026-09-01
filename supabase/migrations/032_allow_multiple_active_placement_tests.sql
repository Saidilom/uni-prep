-- Migration 032: activating one placement test ("Школа") used to silently
-- deactivate every other one (both a UNIQUE index on is_active and a
-- blanket UPDATE inside set_active_placement_test enforced "only one active
-- test ever"). Admins want to be able to leave several tests active at
-- once. The self-assignment flow (ensureActiveAssignment in
-- src/app/(dashboard)/placement/page.tsx) is adjusted client-side to pick
-- the most-recently-activated active test deterministically, so this no
-- longer needs a DB-level single-row guarantee.

DROP INDEX IF EXISTS public.placement_tests_single_active;

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
  UPDATE public.placement_tests SET is_active = true WHERE id = p_test_id;
END;
$$;

-- Activation no longer implicitly deactivates every other test, so admins
-- need an explicit way to turn one back off.
CREATE OR REPLACE FUNCTION public.deactivate_placement_test(p_test_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.placement_tests SET is_active = false WHERE id = p_test_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_placement_test(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_placement_test(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
