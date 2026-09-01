-- 043_dedupe_placement_assignments.sql added UNIQUE (user_id, test_id) on
-- placement_assignments to stop it from silently accumulating duplicates.
-- That constraint has a side effect: assignPlacementToStudent's plain
-- INSERT is how a teacher lets a student retake an already-completed
-- placement test (fetchStudentActivePlacementTestIds only excludes
-- non-completed assignments from the picker on purpose — retaking a
-- completed one is an intentional, existing feature) — a second INSERT for
-- the same (user_id, test_id) now violates the unique constraint instead of
-- creating the retake row.
--
-- Fix: a retake resets the existing row in place (status back to
-- 'assigned', clears completed_at) instead of inserting a second one, and
-- drops the superseded numeric result — Placement never exposes a
-- per-question review to begin with (see CLAUDE.md "Паттерн: приватность
-- Placement"), so there is nothing else worth preserving from the prior
-- attempt once a teacher has explicitly chosen to reassign it.
--
-- This has to be a SECURITY DEFINER function rather than a client-side
-- update()/delete(): placement_assignments and placement_results only have
-- RLS policies letting a TEACHER *insert*/*select*, never update/delete —
-- by design, so a client call from the teacher's own session would just be
-- silently filtered to zero rows affected.
CREATE OR REPLACE FUNCTION public.reassign_placement_test(p_test_id uuid, p_student_id text, p_test_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := auth.uid()::text;
  v_existing_id uuid;
BEGIN
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = p_student_id AND c.teacher_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.placement_assignments
  WHERE user_id = p_student_id AND test_id = p_test_id;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.placement_results WHERE assignment_id = v_existing_id;
    UPDATE public.placement_assignments
    SET status = 'assigned', completed_at = NULL, test_title = p_test_title, assigned_by = v_actor, assigned_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.placement_assignments (id, user_id, test_id, test_title, status, assigned_by)
    VALUES (gen_random_uuid(), p_student_id, p_test_id, p_test_title, 'assigned', v_actor);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_placement_test(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_placement_test(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
