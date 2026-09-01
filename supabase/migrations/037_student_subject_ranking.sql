-- #23: per-subject ranking of a student within their own class. RLS on
-- class_members/mock_results deliberately limits a student to their own
-- rows (class_members_student_read_own, mock_results_student) — a plain
-- client query cannot see classmates' scores to build a ranking, by design
-- (same reasoning CLAUDE.md documents for Placement: comparison happens as
-- an aggregate, never as raw access to someone else's row). This RPC runs
-- as SECURITY DEFINER, computes the ranking across the whole class
-- server-side, and returns only the calling student's own place in it —
-- never another student's per-question or per-attempt data.
CREATE OR REPLACE FUNCTION public.get_my_class_subject_ranking(p_class_id uuid)
RETURNS TABLE(
  subject_id text,
  my_avg_accuracy numeric,
  my_attempts int,
  my_rank int,
  total_students int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := auth.uid()::text;
BEGIN
  -- Not a member of this class at all — nothing to rank.
  IF NOT EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = p_class_id AND cm.student_id = v_student_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH class_students AS (
    SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id = p_class_id
  ),
  per_student_subject AS (
    SELECT
      cs.student_id AS student_id,
      mt.subject_id AS subject_id,
      AVG(mr.accuracy) AS avg_accuracy,
      COUNT(*) AS attempts
    FROM class_students cs
    JOIN public.mock_results mr ON mr.user_id = cs.student_id
    JOIN public.mock_tests mt ON mt.id = mr.mock_test_id
    WHERE mt.subject_id IS NOT NULL
    GROUP BY cs.student_id, mt.subject_id
  ),
  ranked AS (
    SELECT
      pss.student_id,
      pss.subject_id,
      pss.avg_accuracy,
      pss.attempts,
      RANK() OVER (
        PARTITION BY pss.subject_id
        ORDER BY pss.avg_accuracy DESC, pss.attempts DESC, pss.student_id ASC
      ) AS rnk,
      COUNT(*) OVER (PARTITION BY pss.subject_id) AS total
    FROM per_student_subject pss
  )
  SELECT
    r.subject_id,
    ROUND(r.avg_accuracy, 1),
    r.attempts::int,
    r.rnk::int,
    r.total::int
  FROM ranked r
  WHERE r.student_id = v_student_id
  ORDER BY r.subject_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_class_subject_ranking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_class_subject_ranking(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
