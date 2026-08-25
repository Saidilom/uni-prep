-- Migration 007: fix handle_new_user() to retry on shortid collision
-- ============================================
-- Migration 006 added a UNIQUE constraint on public.users.shortid. This
-- trigger (fires on every auth.users insert, i.e. every Google sign-in)
-- generated shortid with no collision handling — `ON CONFLICT (id) DO
-- NOTHING` only covers the `id` conflict target, so a shortid collision
-- would raise an unhandled unique_violation inside an AFTER INSERT trigger
-- on auth.users, aborting the whole transaction and breaking that user's
-- sign-up. Low probability today (3 rows), but a landmine now that the
-- constraint exists. Also aligns the generated format with the app-level
-- generator (src/lib/auth-utils.ts generateShortId): STU-XXXXXX.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_short_id text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_short_id := 'STU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    BEGIN
      INSERT INTO public.users (
        id, shortId, email, phone, name, surname, role, isRegistanStudent, registeredVia, createdAt, updatedAt
      ) VALUES (
        NEW.id::text,
        v_short_id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Ученик'),
        '',
        'student',
        false,
        COALESCE(NEW.raw_user_meta_data->>'provider', 'google'),
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;
