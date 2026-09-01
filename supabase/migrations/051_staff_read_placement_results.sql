-- Staff (049_staff_role.sql) also needs to see "Школа" (Placement) entrance
-- test results — not just promote students to teachers. Read-only, matches
-- the existing admin-only visibility (placement_results_admin) but scoped
-- to is_staff() instead of full admin power.
CREATE POLICY placement_results_staff ON public.placement_results
  FOR SELECT USING (public.is_staff());

NOTIFY pgrst, 'reload schema';
