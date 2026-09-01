-- A teacher (free/class_only mocks) has no scheduled starts_at/ends_at at
-- all — they want to manually close a mock once everyone who was going to
-- take it has, rather than pre-committing to a datetime. closed_at is a
-- simple manual override that works the same way for any mock (paid or
-- free, scheduled or not): once set, no NEW attempt can start, but a
-- student who already has a result can still view it — exactly the same
-- "already has a result -> always allowed" carve-out the schedule window
-- already uses. The owning teacher (or admin) can set/clear it via a plain
-- update() from the client — mock_tests_teacher_own/mock_tests_admin RLS
-- (both FOR ALL) already grant that, no new RPC needed.
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

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
            EXISTS (
              SELECT 1 FROM public.mock_results mr
              WHERE mr.mock_test_id = mt.id AND mr.user_id = auth.uid()::text
            )
            OR (
              mt.closed_at IS NULL
              AND (
                mt.price = 0
                OR mt.starts_at IS NULL
                OR mt.ends_at IS NULL
                OR (
                  now() >= mt.starts_at
                  AND now() <= mt.ends_at + interval '5 minutes'
                )
              )
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
