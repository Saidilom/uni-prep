-- Same bug family as placement_assignments (043): /api/payments/create did a
-- SELECT ... .maybeSingle() to check "is there already a pending payment for
-- (user_id, mock_test_id)" and only INSERTed a new one if not — a race
-- between two near-simultaneous "Оплатить" clicks (double-click, two open
-- tabs) can create two live checkout sessions for the same purchase, and if
-- both get paid, the student is charged twice. No uniqueness constraint on
-- payments ever protected this.
--
-- Fix: a partial unique index restricted to pending rows (a user can still
-- have any number of resolved payments for the same mock over time — retries
-- after a failed/cancelled attempt are legitimate), plus an atomic
-- get-or-create function using INSERT ... ON CONFLICT ... DO UPDATE ...
-- RETURNING (DO NOTHING would not return the pre-existing row's id, which
-- the route needs to build checkout URLs for it).
--
-- This function is invoked from src/app/api/payments/create/route.ts via
-- supabaseServer (the service-role client, already bypassing RLS) — it is
-- deliberately NOT granted to `authenticated`, since it trusts its
-- parameters directly with none of the route's own checks (mock exists,
-- test is actually type='paid', caller doesn't already have mock_access).
CREATE UNIQUE INDEX IF NOT EXISTS payments_user_mock_pending_unique
  ON public.payments (user_id, mock_test_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_or_create_pending_payment(
  p_user_id text,
  p_user_name text,
  p_user_phone text,
  p_mock_test_id uuid,
  p_mock_test_title text,
  p_amount int
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  INSERT INTO public.payments (
    id, user_id, user_name, user_phone, mock_test_id, mock_test_title,
    amount, currency, status, provider
  ) VALUES (
    gen_random_uuid(), p_user_id, p_user_name, p_user_phone, p_mock_test_id, p_mock_test_title,
    p_amount, 'UZS', 'pending', 'pending'
  )
  ON CONFLICT (user_id, mock_test_id) WHERE status = 'pending'
  DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_pending_payment(text, text, text, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_pending_payment(text, text, text, uuid, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';
