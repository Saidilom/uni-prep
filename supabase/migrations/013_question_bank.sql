-- Migration 013: Question Bank (Группа 6 из PLAN-REGISTAN-V3.md, задачи 32-35)
-- ============================================
-- Adds a reusable question bank tagged by subject/topic/difficulty that
-- admin can search/filter/duplicate and pick from when building Placement
-- tests or Mock sections.
--
-- placement_questions/mock_questions keep their existing columns exactly
-- as-is (so submit_placement/submit_mock/get_placement_questions/
-- get_mock_questions scoring logic needs no changes) — attaching a bank
-- question to a test COPIES its content into a new placement_questions/
-- mock_questions row and stamps bank_id for provenance, it does not
-- live-link. This is deliberate: editing a bank question later must not
-- silently change the answer key of a test a student already
-- started/completed. image_url is added to both tables too so an attached
-- bank question's image reaches the student quiz UI (via
-- get_placement_questions/get_mock_questions, re-declared below).
--
-- Existing placement_questions/mock_questions rows are backfilled into the
-- bank via a per-row loop (not a bulk INSERT..SELECT) specifically so
-- their own ids never change — placement_answer_details.question_id and
-- mock_answer_details.question_id (real per-student grading history) point
-- at those ids and must stay valid.

CREATE TABLE IF NOT EXISTS public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  correct_answer text NOT NULL,
  points int NOT NULL DEFAULT 1,
  subject text,
  topic text,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_bank_subject ON public.question_bank(subject);
CREATE INDEX IF NOT EXISTS idx_question_bank_difficulty ON public.question_bank(difficulty);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_bank_admin ON public.question_bank
  FOR ALL USING (public.is_admin());

ALTER TABLE public.placement_questions ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.question_bank(id) ON DELETE SET NULL;
ALTER TABLE public.placement_questions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.mock_questions ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.question_bank(id) ON DELETE SET NULL;
ALTER TABLE public.mock_questions ADD COLUMN IF NOT EXISTS image_url text;

DO $$
DECLARE r record; v_bank_id uuid;
BEGIN
  FOR r IN SELECT * FROM public.placement_questions WHERE bank_id IS NULL LOOP
    INSERT INTO public.question_bank (text, options, correct_answer, points)
    VALUES (r.text, r.options, r.correct_answer, r.points)
    RETURNING id INTO v_bank_id;
    UPDATE public.placement_questions SET bank_id = v_bank_id WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT * FROM public.mock_questions WHERE bank_id IS NULL LOOP
    INSERT INTO public.question_bank (text, options, correct_answer, points)
    VALUES (r.text, r.options, r.correct_answer, r.points)
    RETURNING id INTO v_bank_id;
    UPDATE public.mock_questions SET bank_id = v_bank_id WHERE id = r.id;
  END LOOP;
END $$;

-- Re-declare with image_url added to the return shape (DROP required:
-- CREATE OR REPLACE cannot change a function's return columns).
DROP FUNCTION IF EXISTS public.get_placement_questions(uuid);
CREATE FUNCTION public.get_placement_questions(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int,
  image_url text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, test_id, text, options, points, "order", image_url
  FROM placement_questions
  WHERE test_id = p_test_id
  ORDER BY "order";
$$;

DROP FUNCTION IF EXISTS public.get_mock_questions(uuid);
CREATE FUNCTION public.get_mock_questions(p_section_id uuid)
RETURNS TABLE (
  id uuid,
  section_id uuid,
  text text,
  options jsonb,
  points int,
  "order" int,
  image_url text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, section_id, text, options, points, "order", image_url
  FROM mock_questions
  WHERE section_id = p_section_id
  ORDER BY "order";
$$;

NOTIFY pgrst, 'reload schema';
