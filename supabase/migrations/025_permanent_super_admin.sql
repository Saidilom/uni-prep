-- Migration 025: permanent Super Admin lock
-- hunter.herbion@gmail.com (id ed845170-28aa-4d33-b0a1-40a9e8d8af01) is the
-- platform's permanent Super Admin. protect_user_privileged_fields already
-- stops a non-admin from self-promoting, but any OTHER admin could still
-- demote this account via /admin/users (users_admin_full_access grants
-- admins full UPDATE on any row). This makes this one row's role immutable
-- for everyone, admins included, and blocks deleting the row outright.

CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    NEW.role := 'admin';
  ELSIF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    NEW.role := OLD.role;
    NEW.isRegistanStudent := OLD.isRegistanStudent;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_super_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'ed845170-28aa-4d33-b0a1-40a9e8d8af01' THEN
    RAISE EXCEPTION 'Cannot delete the permanent Super Admin account';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin_delete_trg ON public.users;
CREATE TRIGGER protect_super_admin_delete_trg
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_delete();

NOTIFY pgrst, 'reload schema';
