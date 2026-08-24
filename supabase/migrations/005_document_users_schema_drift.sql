-- Migration 005: document confirmed schema drift on public.users
-- ============================================
-- Findings from `supabase db query --linked` against the production project
-- (qnujkeuknrpqlddsahbt) on 2026-08-25, run while resolving the users.id
-- uuid/text contradiction flagged in migration 003's comment:
--
--   1. public.users.id is TEXT — confirmed, matches migration 003's claim.
--      Migration 001_init.sql has been corrected (comment + column type) to
--      say `text` instead of `uuid` so a fresh local/dev database matches
--      prod. No ALTER is needed here since prod was already text.
--
--   2. public.users currently has BOTH an unquoted lowercase pair
--      (createdat, updatedat — created by migration 001's original unquoted
--      DDL) AND a quoted mixed-case pair ("createdAt", "updatedAt") that the
--      application actually reads/writes (see src/lib/auth-utils.ts,
--      src/app/(dashboard)/admin/registan/page.tsx, which query/update
--      "createdAt"/"updatedAt" via PostgREST). No migration file in this
--      repo creates the quoted pair — they exist on prod only, likely added
--      manually via the SQL editor at some point. The lowercase pair is not
--      referenced anywhere in the codebase and appears dead.
--
-- Decision (2026-08-25): drop the dead lowercase columns now — confirmed
-- unused anywhere in the codebase, and prod only has 3 rows at this
-- pre-launch stage, so the blast radius is minimal.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users DROP COLUMN IF EXISTS createdat;
ALTER TABLE public.users DROP COLUMN IF EXISTS updatedat;
