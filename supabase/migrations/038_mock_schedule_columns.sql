-- #5: scheduled start + delayed results publication for paid mocks only.
-- Free/class_only mocks are completely unaffected (see can_access_mock and
-- submit_mock updates in the migrations that follow this one).
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS results_publish_at timestamptz;

NOTIFY pgrst, 'reload schema';
