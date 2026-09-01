-- Security fix: nothing in this app throttles calls to the two
-- real-money-per-call Gemini endpoints (mock-tests/import,
-- mock-responses/ai-grade) — a compromised/malicious account (or a client
-- bug that retries) could run up the Gemini bill with zero backpressure.
-- No Redis/external infra exists in this project, so this is a simple
-- Postgres fixed-window counter — not distributed-attack-proof, but it
-- fully closes the "one account hammers the endpoint" scenario, which is
-- the actual threat here (both routes already require a real session).
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

-- Never touched directly by client code, only by check_rate_limit() below
-- (SECURITY DEFINER, bypasses RLS) — RLS enabled with zero policies so a
-- direct REST call against this table is denied outright either way.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count int;
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
