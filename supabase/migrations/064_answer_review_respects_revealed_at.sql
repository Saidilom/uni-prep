-- Bug fix: get_my_mock_answer_review (054_close_answer_key_leak.sql) was
-- added specifically to close a data leak, but never itself checked
-- revealed_at — the whole point of that column (052_mock_result_reveal.sql)
-- is that nothing score-shaped reaches a student's browser for a paid/
-- class-assigned mock before the teacher/admin finalizes the cohort. This
-- RPC's is_correct/points_earned/max_points breakdown is exactly
-- score-shaped. Not reachable through the shipped UI today (the client only
-- calls it in the branch where resultsPending is already false), but the
-- invariant wasn't enforced at the data layer, so any direct RPC call for a
-- still-hidden result would have bypassed the entire hold-until-finalize
-- mechanism.
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
  WHERE mad.result_id = p_result_id AND mr.user_id = auth.uid()::text AND mr.revealed_at IS NOT NULL;
$$;

NOTIFY pgrst, 'reload schema';
