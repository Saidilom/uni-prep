-- ============================================
-- Migration 004: fix infinite recursion in users_admin_full_access
-- ============================================
-- users_admin_full_access (added in 003) is a policy ON public.users whose
-- USING clause runs `SELECT ... FROM public.users`. Because RLS is enabled
-- on users, evaluating that subquery re-triggers every policy on users,
-- including this one again -> infinite recursion (Postgres error 42P17),
-- which broke ALL reads of users (including login, since getUserProfile()
-- queries this table). Standard fix: move the admin check into a
-- SECURITY DEFINER function. Such functions run as their owner (postgres,
-- which has BYPASSRLS), so the SELECT inside does not re-trigger RLS and
-- the recursion is broken.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin');
$$;

DROP POLICY IF EXISTS users_admin_full_access ON public.users;
CREATE POLICY users_admin_full_access ON public.users
  FOR ALL USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
