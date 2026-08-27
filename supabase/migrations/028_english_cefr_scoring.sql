-- Migration 028: English CEFR scoring
-- Official methodology (tests-pdf/англ/Multilevel-bm.pdf, Bilimni baholash
-- agentligi, 2023-03-16): Listening/Reading are Rasch-calibrated then
-- standardized (Z = (theta-mean)/stdev, T = Z*10+50, capped 0-75 since C2
-- isn't tested). Writing combines Task1 (raw 0-10 -> weight 12) + Task2
-- (raw 0-20 -> weight 24) into a 0-36 raw sum, converted via a published
-- lookup table to 0-75. The final CEFR band comes from averaging whichever
-- sections are actually present. None of this existed before — submit_mock
-- computes one generic correct/total percentage for every subject alike.
--
-- This requires knowing which mock_sections are Listening vs Reading vs
-- Writing — Gemini already classifies this at import time
-- (ImportedSectionSchema.kind) but publish_imported_mock silently dropped
-- it; mock_sections had no column to hold it at all. Fixed here by adding
-- the column and re-adding just the `kind` insert to the CURRENT
-- publish_imported_mock body (taken verbatim from pg_get_functiondef —
-- everything else below is unchanged from what's live today).

ALTER TABLE public.mock_sections
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general';

ALTER TABLE public.mock_sections DROP CONSTRAINT IF EXISTS mock_sections_kind_check;
ALTER TABLE public.mock_sections ADD CONSTRAINT mock_sections_kind_check
  CHECK (kind IN ('general', 'reading', 'listening', 'writing'));

ALTER TABLE public.mock_results
  ADD COLUMN IF NOT EXISTS cefr_score numeric,
  ADD COLUMN IF NOT EXISTS cefr_band text;

CREATE OR REPLACE FUNCTION public.publish_imported_mock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at
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
    p_payload->>'sourcePdfPath',
    COALESCE(p_payload->'importMetadata', '{}'::jsonb),
    now()
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
        group_key, requires_manual_review
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
$function$;

REVOKE ALL ON FUNCTION public.publish_imported_mock(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_imported_mock(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
