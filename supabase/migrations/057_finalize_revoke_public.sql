-- Consistency/hardening fix: finalize_mock_group_results (053) was granted
-- EXECUTE to authenticated but never had the preceding REVOKE ALL FROM PUBLIC
-- that every other RPC in this project has. Not exploitable today — the
-- function does its own auth.uid()-based ownership check internally, and an
-- unauthenticated caller's auth.uid() resolves to NULL, which fails that
-- check — but tightened here for defense-in-depth and consistency.
REVOKE ALL ON FUNCTION public.finalize_mock_group_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_mock_group_results(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
