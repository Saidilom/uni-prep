-- Security fix: get_placement_questions/get_mock_questions (013_question_bank.sql)
-- are SECURITY DEFINER functions that return every question for any p_test_id/
-- p_section_id, with no check that the caller is actually assigned/allowed to
-- see that test — and unlike every other RPC in this project, they were never
-- REVOKEd from PUBLIC either. get_placement_questions is live (called from
-- /placement/[id]); a student could pass any placement_tests.id (readable via
-- placement_tests_read_auth) and read another cohort's questions ahead of time.
-- get_mock_questions (the non-_v2 one) has no callers left in src/ — get_mock_questions_v2
-- (046_mock_multi_file_import.sql) already does this correctly via
-- can_access_mock(); drop the vulnerable duplicate instead of patching dead code.

DROP FUNCTION IF EXISTS public.get_mock_questions(uuid);

DROP FUNCTION IF EXISTS public.get_placement_questions(uuid);
CREATE FUNCTION public.get_placement_questions(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int,
  image_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pq.id, pq.test_id, pq.text, pq.options, pq.points, pq."order", pq.image_url
  FROM public.placement_questions pq
  WHERE pq.test_id = p_test_id
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.placement_assignments pa
        WHERE pa.test_id = p_test_id AND pa.user_id = auth.uid()::text
      )
    )
  ORDER BY pq."order";
$$;

REVOKE ALL ON FUNCTION public.get_placement_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_placement_questions(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
