-- Security fix: mock_answer_details_student (011_teacher_mock_analytics.sql)
-- granted a student SELECT on the entire row of their own mock_answer_details,
-- including correct_answer/answer_key_json. RLS only restricts rows, not
-- columns — so a student could call
-- .from("mock_answer_details").select("correct_answer") directly for an
-- attempt they haven't locked in yet, then resubmit with the leaked key.
-- No legitimate client code reads those two columns as a student (verified:
-- only class-mock-results-view.tsx, the teacher/admin view, reads
-- correct_answer, via the separate mock_answer_details_teacher/_admin
-- policies, which are untouched here) — the only student-facing read
-- (src/app/mock/[id]/page.tsx, checking pending-review count) never needed
-- correct_answer either. So the direct-table policy is dropped outright and
-- replaced with a narrow RPC that can never return those two columns.
DROP POLICY IF EXISTS mock_answer_details_student ON public.mock_answer_details;

CREATE OR REPLACE FUNCTION public.get_my_mock_answer_review(p_result_id uuid)
RETURNS TABLE (
  question_id uuid,
  question_text text,
  selected_answer text,
  is_correct boolean,
  points_earned numeric,
  max_points numeric,
  review_status text,
  review_feedback text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mad.question_id, mad.question_text, mad.selected_answer, mad.is_correct,
         mad.points_earned, mad.max_points, mad.review_status, mad.review_feedback
  FROM public.mock_answer_details mad
  JOIN public.mock_results mr ON mr.id = mad.result_id
  WHERE mad.result_id = p_result_id AND mr.user_id = auth.uid()::text;
$$;

REVOKE ALL ON FUNCTION public.get_my_mock_answer_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_mock_answer_review(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
