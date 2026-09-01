-- #5: a scheduled paid mock (mock_tests.starts_at set, price > 0) is only
-- enterable during [starts_at, starts_at + 1h entry window + full exam
-- duration] — the generous upper bound (rather than a bare "+1h") is
-- deliberate: a student who legitimately started near the end of the
-- 1-hour entry window still needs their full duration_minutes to finish,
-- and this same function gates every re-check while they're mid-exam
-- (RLS reads of mock_tests/mock_sections on refresh, plus submit_mock's own
-- access check below) — a narrower window would lock them out mid-attempt.
-- Once a mock_results row exists for (user, mock), access is unconditional
-- (viewing/reviewing an already-submitted attempt is never time-gated).
-- Unscheduled (starts_at IS NULL) and free (price = 0) mocks are unaffected.
CREATE OR REPLACE FUNCTION public.can_access_mock(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mock_tests mt
    WHERE mt.id = p_mock_test_id
      AND (
        public.is_admin()
        OR mt.created_by = auth.uid()::text
        OR (
          mt.status = 'published'
          AND (
            mt.price = 0
            OR mt.starts_at IS NULL
            OR (
              now() >= mt.starts_at
              AND now() <= mt.starts_at + interval '1 hour' + (COALESCE(mt.duration_minutes, 0) * interval '1 minute')
            )
            OR EXISTS (
              SELECT 1 FROM public.mock_results mr
              WHERE mr.mock_test_id = mt.id AND mr.user_id = auth.uid()::text
            )
          )
          AND (
            EXISTS (
              SELECT 1 FROM public.mock_access ma
              WHERE ma.mock_test_id = mt.id AND ma.user_id = auth.uid()::text
            )
            OR (
              mt.type = 'free'
              AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()::text AND u.isRegistanStudent = true
              )
            )
            OR EXISTS (
              SELECT 1 FROM public.mock_student_assignments msa
              WHERE msa.mock_test_id = mt.id AND msa.student_id = auth.uid()::text
            )
            OR EXISTS (
              SELECT 1
              FROM public.mock_class_assignments mca
              JOIN public.class_members cm ON cm.class_id = mca.class_id
              WHERE mca.mock_test_id = mt.id AND cm.student_id = auth.uid()::text
            )
          )
        )
      )
  );
$$;

NOTIFY pgrst, 'reload schema';
