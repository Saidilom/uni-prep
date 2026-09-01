-- Gap found while building the student-facing "Классы" page (#18): public.classes
-- only had classes_teacher_own (teacher must own the row) and classes_admin —
-- no policy let a student read a class they are merely a member of, even
-- though class_members_student_read_own (010_teacher_classes.sql) already
-- lets them read their own membership row. Without this, fetchClassById()
-- silently returns null for a student and the page reads as "class not found".
CREATE POLICY classes_student_read_own ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.class_id = classes.id AND cm.student_id = auth.uid()::text
    )
  );

NOTIFY pgrst, 'reload schema';
