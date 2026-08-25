-- Migration 009: fix uuid/text comparison bug across RLS policies
-- ============================================
-- Confirmed via `supabase db query --linked`: mock_access.user_id,
-- mock_results.user_id, payments.user_id, placement_assignments.user_id,
-- placement_results.user_id are all TEXT in the real database (same
-- users.id drift already documented in migrations 003/005 — migration 002's
-- CREATE TABLE statements say uuid, reality is text). Migration 002's RLS
-- policies compare these columns directly against auth.uid() (which
-- returns uuid) with NO cast, e.g. `auth.uid() = user_id`, and admin
-- policies use `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() ...)` —
-- same issue against users.id.
--
-- Verified empirically: `select gen_random_uuid() = 'x'::text` raises
-- Postgres error 42883 "operator does not exist: uuid = text". RLS policy
-- evaluation errors are NOT treated as "false" — they abort the query. So
-- every one of these 15 policies has been failing outright on evaluation
-- for real (non service-role) sessions: a logged-in student could not read
-- their own mock_access/mock_results/payments/placement_assignments/
-- placement_results rows, and none of the *_admin policies on these tables
-- worked either. Migration 004 already fixed this exact class of bug for
-- public.users via public.is_admin() (SECURITY DEFINER, casts internally).
-- This migration applies the same fix to everywhere else it was missed.

-- placement_tests
DROP POLICY IF EXISTS placement_tests_admin ON placement_tests;
CREATE POLICY placement_tests_admin ON placement_tests
  FOR ALL USING (public.is_admin());

-- placement_questions
DROP POLICY IF EXISTS placement_questions_admin ON placement_questions;
CREATE POLICY placement_questions_admin ON placement_questions
  FOR ALL USING (public.is_admin());

-- placement_assignments
DROP POLICY IF EXISTS placement_assignments_student ON placement_assignments;
CREATE POLICY placement_assignments_student ON placement_assignments
  FOR ALL USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS placement_assignments_admin ON placement_assignments;
CREATE POLICY placement_assignments_admin ON placement_assignments
  FOR ALL USING (public.is_admin());

-- placement_results
DROP POLICY IF EXISTS placement_results_student ON placement_results;
CREATE POLICY placement_results_student ON placement_results
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS placement_results_admin ON placement_results;
CREATE POLICY placement_results_admin ON placement_results
  FOR ALL USING (public.is_admin());

-- placement_answer_details
DROP POLICY IF EXISTS placement_answer_details_admin ON placement_answer_details;
CREATE POLICY placement_answer_details_admin ON placement_answer_details
  FOR ALL USING (public.is_admin());

-- mock_tests
DROP POLICY IF EXISTS mock_tests_admin ON mock_tests;
CREATE POLICY mock_tests_admin ON mock_tests
  FOR ALL USING (public.is_admin());

-- mock_sections
DROP POLICY IF EXISTS mock_sections_admin ON mock_sections;
CREATE POLICY mock_sections_admin ON mock_sections
  FOR ALL USING (public.is_admin());

-- mock_questions
DROP POLICY IF EXISTS mock_questions_admin ON mock_questions;
CREATE POLICY mock_questions_admin ON mock_questions
  FOR ALL USING (public.is_admin());

-- mock_access
DROP POLICY IF EXISTS mock_access_student ON mock_access;
CREATE POLICY mock_access_student ON mock_access
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS mock_access_admin ON mock_access;
CREATE POLICY mock_access_admin ON mock_access
  FOR ALL USING (public.is_admin());

-- mock_results
DROP POLICY IF EXISTS mock_results_student ON mock_results;
CREATE POLICY mock_results_student ON mock_results
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS mock_results_admin ON mock_results;
CREATE POLICY mock_results_admin ON mock_results
  FOR ALL USING (public.is_admin());

-- payments
DROP POLICY IF EXISTS payments_student ON payments;
CREATE POLICY payments_student ON payments
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS payments_admin ON payments;
CREATE POLICY payments_admin ON payments
  FOR SELECT USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
