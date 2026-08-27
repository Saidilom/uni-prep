-- Migration 019: Missing FK class_members.class_id -> classes.id
-- ============================================
-- class_members had a FK on student_id -> users.id (migration 001) but never
-- one on class_id -> classes.id, even though every row is consistent with it
-- (verified via `supabase db query --linked` before writing this migration —
-- zero orphaned class_id values). PostgREST resolves embed syntax like
-- `classes!inner(teacher_id)` purely from real FK constraints in its schema
-- cache, not from application-level joins — without this FK, any query
-- embedding classes through class_members fails with PGRST200 ("Could not
-- find a relationship..."), which the calling code was silently treating as
-- "no matching row" instead of a query error. This broke teacher ->
-- assign-mock-to-student (src/app/api/mock-tests/[id]/assign/route.ts),
-- surfacing as a misleading 403 "Ученик не состоит в ваших классах" for a
-- student who actually was in the teacher's class.

ALTER TABLE public.class_members
  ADD CONSTRAINT class_members_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
