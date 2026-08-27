-- Migration 027: fix regression from migration 025
-- 025 recreated protect_user_privileged_fields() by copying the body from
-- migration 002 (id = auth.uid(), no cast) instead of the already-fixed
-- version from migration 003 (auth.uid()::text = id) — reintroducing the
-- exact uuid/text RLS bug documented in CLAUDE.md and migration 009.
-- Confirmed live: any admin role update (e.g. teacher -> student in
-- /admin/users) started throwing 42883 "operator does not exist: text =
-- uuid" because auth.uid() (uuid) was compared directly to users.id (text).

CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    NEW.role := 'admin';
  ELSIF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin') THEN
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
