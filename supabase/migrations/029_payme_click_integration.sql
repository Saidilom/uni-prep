-- Migration 029: real Payme/Click payment gateway integration
-- Replaces the placeholder "test mode" checkout (mock-confirm) with real
-- provider webhooks. Both protocols need somewhere to keep provider-specific
-- bookkeeping (Payme's own transaction id + state machine timestamps,
-- Click's click_trans_id/merchant_prepare_id) that doesn't fit the existing
-- fixed columns — a jsonb bag, same pattern already used for
-- mock_questions.content, keeps this from needing a new migration per
-- provider quirk.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON public.payments (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
