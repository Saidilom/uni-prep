-- A student-facing "Классы" page (#18) needs to show which teacher owns
-- each of the student's classes. The existing RLS on public.users only lets
-- a user read their own row, admins read everything, and a teacher read
-- their own students (010_teacher_classes.sql) — there was no path in the
-- other direction. This adds the narrow symmetric case: a student may read
-- a teacher's row only if that teacher owns a class the student belongs to.
CREATE POLICY users_student_read_own_teacher ON public.users
  FOR SELECT USING (
    role = 'teacher' AND EXISTS (
      SELECT 1 FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = auth.uid()::text AND c.teacher_id = users.id
    )
  );

NOTIFY pgrst, 'reload schema';
