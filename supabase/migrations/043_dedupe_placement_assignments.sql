-- Bug report: "карточки размножаются" on /placement — placement_assignments
-- had zero uniqueness constraint on (user_id, test_id), and the client's
-- self-assign check (ensureActiveAssignment in (dashboard)/placement/page.tsx)
-- did a plain SELECT ... .maybeSingle() before INSERT. Once ANY duplicate
-- existed for a (user, test) pair (trivially caused by React StrictMode's
-- dev-mode double effect invocation, or two tabs/fast reloads), .maybeSingle()
-- stopped returning that row at all (more than one row matches "single"),
-- so the existence check permanently read as "nothing assigned yet" and
-- inserted one more duplicate on every single subsequent page visit —
-- confirmed in production data: one (user, test) pair had grown to 24 rows.
--
-- Step 1: dedupe existing rows, keeping exactly one per (user_id, test_id).
-- A row with a completed placement_results attempt must never be the one
-- deleted (placement_results.assignment_id is ON DELETE CASCADE — deleting
-- the wrong row would silently destroy a real completed test result), so it
-- always wins; otherwise keep the earliest assigned_at as the canonical row.
DO $$
DECLARE
  v_bad_group record;
BEGIN
  SELECT pa.user_id, pa.test_id, count(*) AS result_count
  INTO v_bad_group
  FROM public.placement_assignments pa
  JOIN public.placement_results pr ON pr.assignment_id = pa.id
  GROUP BY pa.user_id, pa.test_id
  HAVING count(*) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Refusing to dedupe: (user_id=%, test_id=%) has % completed results — needs manual review, not an automatic merge', v_bad_group.user_id, v_bad_group.test_id, v_bad_group.result_count;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    pa.id,
    ROW_NUMBER() OVER (
      PARTITION BY pa.user_id, pa.test_id
      ORDER BY (pr.id IS NOT NULL) DESC, pa.assigned_at ASC
    ) AS rn
  FROM public.placement_assignments pa
  LEFT JOIN public.placement_results pr ON pr.assignment_id = pa.id
)
DELETE FROM public.placement_assignments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: make it impossible to recreate the bug — INSERT ... ON CONFLICT
-- DO NOTHING (used by the client fix) needs this to target.
ALTER TABLE public.placement_assignments
  ADD CONSTRAINT placement_assignments_user_test_unique UNIQUE (user_id, test_id);

NOTIFY pgrst, 'reload schema';
