-- Security fix: public.users_backup — an exact schema clone of public.users
-- (email, phone, name, surname, role and both old/new-cased timestamp
-- columns, suggesting it was a manual pre-migration snapshot at some point)
-- exists with RLS completely DISABLED and zero policies. Not created by any
-- of the 58 tracked migrations and not referenced anywhere in src/ — a
-- forgotten, unversioned table. Right now it's empty (verified via
-- `select count(*)` before writing this migration, per CLAUDE.md's rule on
-- destructive changes), so there is no live PII exposure today — but as
-- long as it exists, anyone with the anon key could read/write it directly
-- via the REST API with no restriction at all, and it would only take
-- someone re-running a "backup before I touch users" snapshot into it to
-- turn this into a real leak of every user's email/phone/name.
DROP TABLE IF EXISTS public.users_backup;

NOTIFY pgrst, 'reload schema';
