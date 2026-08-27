-- Migration 030: fix handle_new_user() — every Google sign-up was failing
-- Confirmed live via Supabase auth logs: every single OAuth callback was
-- returning "500: Database error saving new user" with
-- 'column "createdat" of relation "users" does not exist (SQLSTATE 42703)'.
--
-- public.users has an inconsistent mix of column casing: shortid,
-- isregistanstudent, registeredvia are genuinely lowercase (created
-- unquoted), but "createdAt" and "updatedAt" are genuinely quoted
-- mixed-case columns (verified via information_schema.columns). This
-- trigger's INSERT listed createdAt/updatedAt unquoted, so Postgres folded
-- them to lowercase createdat/updatedat, which don't exist — meaning NO
-- Google sign-up has ever been able to complete since this trigger's
-- column list last diverged from the real schema. This explains every
-- "registration goes through then bounces to /login" report this session —
-- the browser was fine, the auth.users row's own insert transaction was
-- failing before a session was ever issued.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_short_id text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_short_id := 'STU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    BEGIN
      INSERT INTO public.users (
        id, shortId, email, phone, name, surname, role, isRegistanStudent, registeredVia, "createdAt", "updatedAt"
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
$function$;

NOTIFY pgrst, 'reload schema';
