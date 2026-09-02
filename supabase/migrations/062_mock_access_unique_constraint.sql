-- Bug fix: payments/click, payments/payme, and payments/mock-confirm all
-- read the payment's current status, decide "not yet granted", then insert
-- a fresh mock_access row with a random id — a check-then-insert race with
-- no unique constraint backing it. Both Click and Payme explicitly retry
-- webhook calls on timeout (Payme route's own comment: "Payme resends this
-- on network timeouts"), so two overlapping deliveries for the same
-- transaction can both pass the check before either commits and both
-- insert a row, contradicting the routes' own idempotency comments
-- ("do not grant mock_access a second time"). Verified no existing
-- duplicate (user_id, mock_test_id) pairs before adding this constraint.
ALTER TABLE public.mock_access ADD CONSTRAINT mock_access_user_test_unique UNIQUE (user_id, mock_test_id);

NOTIFY pgrst, 'reload schema';
