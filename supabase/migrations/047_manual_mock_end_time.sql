-- Replaces the auto-derived "1h entry window + duration_minutes" cutoff
-- with a manually chosen end time — the admin picks both starts_at AND
-- ends_at at publish time, any gap apart (a few hours, or several days),
-- and the exam must be entered and finished within that exact window
-- regardless of the mock's own duration_minutes. A student who's still
-- working when ends_at arrives gets auto-submitted client-side with
-- whatever they've answered so far (src/app/mock/[id]/page.tsx clamps its
-- own countdown to whichever is sooner: the mock's normal duration, or the
-- time left until ends_at) — the small interval '5 minutes' grace below
-- exists only to cover that final submit's own network round-trip, not to
-- extend the window.
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

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
            OR mt.ends_at IS NULL
            OR (
              now() >= mt.starts_at
              AND now() <= mt.ends_at + interval '5 minutes'
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

-- publish_imported_mock: accept + validate + store ends_at. Whenever an
-- admin sets starts_at, ends_at is now required too (previously it was
-- optional/derived) — a schedule without a manual end no longer means
-- anything under the new can_access_mock rule above.
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
  v_ends_at timestamptz;
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
  v_ends_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'endsAt', '')::timestamptz ELSE NULL END;
  v_results_publish_at := CASE WHEN v_role = 'admin' THEN NULLIF(p_payload->>'resultsPublishAt', '')::timestamptz ELSE NULL END;

  IF v_starts_at IS NOT NULL AND v_ends_at IS NULL THEN
    RAISE EXCEPTION 'End time is required when a start time is set';
  END IF;
  IF v_ends_at IS NOT NULL AND v_starts_at IS NULL THEN
    RAISE EXCEPTION 'Start time is required when an end time is set';
  END IF;
  IF v_starts_at IS NOT NULL AND v_ends_at IS NOT NULL AND v_ends_at <= v_starts_at THEN
    RAISE EXCEPTION 'End time must be after the start time';
  END IF;
  IF v_starts_at IS NOT NULL AND v_results_publish_at IS NOT NULL AND v_results_publish_at < v_starts_at THEN
    RAISE EXCEPTION 'Results publish date must not be before the start date';
  END IF;

  v_source_pdf_paths := COALESCE(p_payload->'sourcePdfPaths', '[]'::jsonb);

  INSERT INTO public.mock_tests (
    id, title, description, type, price, duration_minutes, subject_id, language,
    created_by, status, source_pdf_path, import_metadata, published_at,
    starts_at, ends_at, results_publish_at, source_pdf_paths
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
    v_ends_at,
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

NOTIFY pgrst, 'reload schema';
