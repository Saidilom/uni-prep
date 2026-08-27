-- Migration 020: Optional separate answer-key PDF for AI test import
-- ============================================
-- Some real exams ship as two documents: the test itself and a separate
-- answer-key sheet. Previously the importer only accepted one PDF, so Gemini
-- had to guess or infer answers when the key wasn't printed inside the test
-- PDF. Adds a nullable answers_file_path column so /api/mock-tests/import can
-- track the second uploaded file per import (mirrors file_path, same
-- private test-imports bucket, no new RLS needed — mock_imports_owner /
-- mock_imports_admin from migration 017 already cover the whole row).

ALTER TABLE public.mock_imports
  ADD COLUMN IF NOT EXISTS answers_file_path text,
  ADD COLUMN IF NOT EXISTS answers_filename text;

NOTIFY pgrst, 'reload schema';
