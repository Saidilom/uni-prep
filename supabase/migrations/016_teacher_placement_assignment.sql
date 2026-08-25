-- Migration 016: Teacher can assign Placement tests to their own students
-- ============================================
-- Placement assignment was admin-only until now — placement_assignments
-- only had placement_assignments_student (own rows) and
-- placement_assignments_admin (migration 009) — a teacher had no way to
-- assign a Placement test to a student in their own class without going
-- through Super Admin. Adds two scoped teacher policies (INSERT to create
-- an assignment, SELECT to see existing ones and avoid double-assigning in
-- the UI), restricted to students who are members of one of the teacher's
-- own classes — same class_members/classes join pattern already used for
-- mock_results_teacher (migration 011), not a blanket grant. Deliberately
-- no UPDATE/DELETE policy — unassigning isn't part of this feature, so we
-- don't grant more than what's needed.

CREATE POLICY placement_assignments_teacher_insert ON public.placement_assignments
  FOR INSERT WITH CHECK (
    public.is_teacher()
    AND EXISTS (
      SELECT 1
      FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id AND c.teacher_id = auth.uid()::text
      WHERE cm.student_id = placement_assignments.user_id
    )
  );

CREATE POLICY placement_assignments_teacher_select ON public.placement_assignments
  FOR SELECT USING (
    public.is_teacher()
    AND EXISTS (
      SELECT 1
      FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id AND c.teacher_id = auth.uid()::text
      WHERE cm.student_id = placement_assignments.user_id
    )
  );

NOTIFY pgrst, 'reload schema';
