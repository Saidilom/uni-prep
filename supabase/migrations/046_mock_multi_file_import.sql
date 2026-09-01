-- Mock-test import now accepts up to 4 separate exam-part PDFs (e.g. a
-- Reading/Writing/Listening/etc. English mock built from separate papers)
-- instead of exactly one test PDF. mock_tests.source_pdf_path (singular)
-- can no longer say which of several PDFs a question's "show original page"
-- viewer should open — source_pdf_paths tracks the full ordered list, and
-- each question's new source_file_index says which entry in that list it
-- came from. source_pdf_path itself is kept and still populated (= the
-- first file) so any code still reading the old singular column keeps
-- working unchanged.
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS source_pdf_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.mock_questions
  ADD COLUMN IF NOT EXISTS source_file_index integer NOT NULL DEFAULT 0;

-- Backfill: every mock published before this migration only ever had one
-- source PDF, so source_pdf_paths is just that single path wrapped in an
-- array (source_file_index is already correct at its DEFAULT 0 for all of
-- them).
UPDATE public.mock_tests
SET source_pdf_paths = jsonb_build_array(source_pdf_path)
WHERE source_pdf_path IS NOT NULL AND source_pdf_paths = '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.publish_imported_mock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_test_id uuid := gen_random_uuid();
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_section_id uuid;
  v_options jsonb;
  v_type text;
  v_price int;
  v_starts_at timestamptz;
  v_results_publish_at timestamptz;
  v_source_pdf_paths jsonb;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid()::text;
  IF v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_type := CASE WHEN v_role = 'admin' THEN 'paid' ELSE 'class_only' END;
  v_price := CASE WHEN v_role = 'admin' THEN GREATEST(0, COALESCE((p_payload->>'price')::int, 0)) ELSE 0 END;
  IF v_role = 'admin' AND v_price <= 0 THEN
    RAISE EXCEPTION 'Paid mock price must be greater than zero';
  END IF;

  v_starts_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'startsAt', '')::timestamptz ELSE NULL END;
  v_results_publish_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'resultsPublishAt', '')::timestamptz ELSE NULL END;
  IF v_starts_at IS NOT NULL AND v_results_publish_at IS NOT NULL AND v_results_publish_at < v_starts_at THEN
    RAISE EXCEPTION 'Results publish date must not be before the start date';
  END IF;

  v_source_pdf_paths := COALESCE(p_payload->'sourcePdfPaths', '[]'::jsonb);

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at,
    starts_at, results_publish_at, source_pdf_paths
  ) VALUES (
    v_test_id,
    NULLIF(trim(p_payload->>'title'), ''),
    COALESCE(p_payload->>'description', ''),
    v_type,
    v_price,
    GREATEST(1, COALESCE((p_payload->>'durationMinutes')::int, 60)),
    p_payload->>'subject',
    p_payload->>'language',
    auth.uid()::text,
    'published',
    COALESCE(p_payload->>'sourcePdfPath', v_source_pdf_paths->>0),
    COALESCE(p_payload->'importMetadata', '{}'::jsonb),
    now(),
    v_starts_at,
    v_results_publish_at,
    v_source_pdf_paths
  );

  FOR v_section IN SELECT value FROM jsonb_array_elements(p_payload->'sections') LOOP
    v_section_id := gen_random_uuid();
    INSERT INTO public.mock_sections (id, mock_test_id, title, "order", kind)
    VALUES (
      v_section_id,
      v_test_id,
      COALESCE(NULLIF(trim(v_section->>'title'), ''), 'Раздел'),
      COALESCE((v_section->>'order')::int, 0),
      CASE WHEN v_section->>'kind' IN ('general', 'reading', 'listening', 'writing') THEN v_section->>'kind' ELSE 'general' END
    );

    FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
      v_options := '{}'::jsonb;
      FOR v_option IN SELECT value FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) LOOP
        v_options := v_options || jsonb_build_object(lower(v_option->>'id'), v_option->>'text');
      END LOOP;

      INSERT INTO public.mock_questions (
        id, section_id, text, options, correct_answer, points, "order",
        question_type, content, answer_key, accepted_answers, source_page,
        source_file_index, group_key, requires_manual_review
      ) VALUES (
        gen_random_uuid(),
        v_section_id,
        COALESCE(v_question->>'prompt', ''),
        v_options,
        COALESCE(lower(v_question->'correctOptionIds'->>0), v_question->'acceptedAnswers'->>0, ''),
        GREATEST(0, COALESCE((v_question->>'points')::numeric, 1)),
        COALESCE((v_question->>'order')::int, 0),
        COALESCE(v_question->>'type', 'single_choice'),
        jsonb_build_object(
          'number', COALESCE(v_question->>'number', ''),
          'sharedStimulus', v_question->'sharedStimulus',
          'needsSourceImage', COALESCE((v_question->>'needsSourceImage')::boolean, false),
          'confidence', COALESCE((v_question->>'confidence')::numeric, 0),
          'reviewNote', v_question->'reviewNote',
          'rubricNote', v_question->'rubricNote'
        ),
        jsonb_build_object(
          'values', COALESCE(
            (SELECT jsonb_agg(lower(value)) FROM jsonb_array_elements_text(COALESCE(v_question->'correctOptionIds', '[]'::jsonb)) AS value),
            '[]'::jsonb
          ),
          'accepted', COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)
        ),
        COALESCE(v_question->'acceptedAnswers', '[]'::jsonb),
        NULLIF(v_question->>'sourcePage', '')::int,
        COALESCE((v_question->>'sourceFileIndex')::int, 0),
        NULLIF(v_question->>'groupKey', ''),
        COALESCE((v_question->>'requiresManualReview')::boolean, false)
      );
    END LOOP;
  END LOOP;

  IF p_payload->>'importId' IS NOT NULL THEN
    UPDATE public.mock_imports
    SET status = 'published', updated_at = now()
    WHERE id = (p_payload->>'importId')::uuid AND created_by = auth.uid()::text;
  END IF;

  RETURN v_test_id;
END;
$$;

-- get_mock_questions_v2 gains source_file_index — RETURNS TABLE, so this
-- needs a DROP first (CREATE OR REPLACE cannot change the returned columns).
-- Also fixes a pre-existing bug found while touching this signature: points
-- was declared `integer` here even though mock_questions.points is
-- `numeric` (023_fractional_points.sql explicitly supports fractional
-- per-question weights like 2.2) — the implicit numeric->integer cast on
-- every row silently truncated any fractional point value read through this
-- RPC (i.e. what a student sees while taking the exam), even though
-- submit_mock scores correctly off the same numeric column directly.
DROP FUNCTION IF EXISTS public.get_mock_questions_v2(uuid);
CREATE FUNCTION public.get_mock_questions_v2(p_section_id uuid)
RETURNS TABLE(
  id uuid, section_id uuid, text text, options jsonb, points numeric, "order" integer,
  image_url text, question_type text, content jsonb, source_page integer,
  source_file_index integer, group_key text, requires_manual_review boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.section_id, q.text, q.options, q.points, q."order", q.image_url,
         q.question_type, q.content, q.source_page, q.source_file_index, q.group_key, q.requires_manual_review
  FROM public.mock_questions q
  JOIN public.mock_sections s ON s.id = q.section_id
  WHERE q.section_id = p_section_id
    AND public.can_access_mock(s.mock_test_id)
  ORDER BY q."order";
$$;

NOTIFY pgrst, 'reload schema';
