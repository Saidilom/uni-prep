-- Уточнение названий в linking_readiness.
--
-- Колонка still_needed с числом 100 читалась как «сколько баллов не хватает» —
-- ровно та путаница, из-за которой в проекте когда-то и завелась сотенная
-- шкала. Речь о ЛЮДЯХ: §R.2 требует 100–150 УЧЕНИКОВ на предмет. Шкала балла
-- была и осталась 75.
--
-- Порог вынесен отдельной колонкой, а не зашит числом внутри выражения:
-- так видно, откуда берётся «сколько ещё нужно», и не надо читать SQL.
--
-- DROP, а не CREATE OR REPLACE: замена не умеет ни переименовывать колонку
-- (still_needed → students_still_needed), ни вставлять новую в середину списка.
-- Зависимостей и отдельных грантов у представления нет, пересоздание безопасно.
DROP VIEW IF EXISTS public.linking_readiness;
CREATE VIEW public.linking_readiness
WITH (security_invoker = true) AS
SELECT ec.subject_id,
       count(*) FILTER (WHERE ec.verification_status = 'verified'
                          AND ec.level_matches_score
                          AND mr.id IS NOT NULL) AS usable_pairs,
       count(*) FILTER (WHERE ec.verification_status = 'verified') AS verified_certificates,
       count(*) AS certificates_total,
       count(*) FILTER (WHERE NOT ec.level_matches_score) AS level_mismatches,
       count(*) FILTER (WHERE ec.source = 'self') AS self_reported,
       -- §R.2: нижняя граница выборки — 100 УЧЕНИКОВ на предмет (не баллов).
       100 AS target_students,
       greatest(0, 100 - count(*) FILTER (WHERE ec.verification_status = 'verified'
                                            AND ec.level_matches_score
                                            AND mr.id IS NOT NULL)) AS students_still_needed
FROM public.external_certificates ec
LEFT JOIN LATERAL (
  SELECT r.id
  FROM public.mock_results r
  JOIN public.mock_tests mt ON mt.id = r.mock_test_id
  WHERE r.user_id = ec.user_id
    AND mt.subject_id = ec.subject_id
    AND r.level_score IS NOT NULL
  LIMIT 1
) mr ON true
GROUP BY ec.subject_id;

COMMENT ON VIEW public.linking_readiness IS
  'Сколько пар «наш балл ↔ реальный сертификат» набрано по предмету и сколько ещё нужно УЧЕНИКОВ до 100 (§R.2). Речь о людях, не о баллах: шкала балла — 75. Считает только подтверждённые и без расхождения уровня.';

NOTIFY pgrst, 'reload schema';
