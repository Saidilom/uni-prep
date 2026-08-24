-- Migration 006: enforce uniqueness on public.users.shortid (Student ID)
-- ============================================
-- Verified via `supabase db query --linked` on 2026-08-25: 3 existing rows,
-- no collisions (L9ZSS7 / WWGIDJ / YTT289) — safe to add the constraint now.
-- Application code (src/lib/auth-utils.ts createUserProfile) retries with a
-- freshly generated shortid on a unique_violation (23505) against this
-- constraint.

ALTER TABLE public.users ADD CONSTRAINT users_shortid_unique UNIQUE (shortid);
