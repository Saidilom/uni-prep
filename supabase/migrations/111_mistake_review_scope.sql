-- 111. Разбор ошибок: только бесплатные и назначенные учителем моки.
--
-- Решение владельца (09.09.2026): разбор ошибок доступен всем — ученику,
-- учителю, админу филиала и супер-админу, — но не по всякому тесту:
--
--   бесплатный мок              — да;
--   мок, назначенный учителем   — да;
--   платный, купленный самим    — нет;
--   тест из комплекта «Ойлик»   — нет.
--
-- ═══ ПОЧЕМУ ЗАПРЕТ НЕ В RLS ═══
--
-- Соблазн повесить условие на mock_answer_details и закрыть вопрос разом.
-- Нельзя: учителю эта таблица нужна и в месячных тестах — он там ПРОВЕРЯЕТ
-- ЭССЕ. Закрыв ей доступ, мы сломали бы выставление баллов за сочинения.
--
-- Поэтому граница проходит по назначению, а не по данным:
--   * ученику — здесь, в функции разбора: она отдаёт строки только по
--     разрешённым тестам, и обойти её из интерфейса нельзя;
--   * учителю и админам — в интерфейсе: по-вопросный разбор для «Ойлик» не
--     рисуется, а форма проверки эссе остаётся.
--
-- ═══ ПОРЯДОК ПРОВЕРОК ═══
--
-- «Ойлик» отсекается ПЕРВЫМ. Месячные тесты — это class_only, назначенные
-- классам: на проде из трёх class_only-тестов два принадлежат комплекту.
-- Проверь «назначен учителем» раньше — и они прошли бы как разрешённые,
-- ровно наперекор решению. То же правило и в тех же словах живёт в
-- src/lib/mistake-review-access.ts, там же тест на эту ловушку.

CREATE OR REPLACE FUNCTION public.mock_allows_mistake_review(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- ПЕРВЫМ делом «Ойлик»: он class_only и назначен классу, поэтому любое
    -- другое правило пропустило бы его вперёд.
    WHEN mt.oylik_set_id IS NOT NULL THEN false
    WHEN mt.type = 'free' THEN true
    WHEN EXISTS (SELECT 1 FROM public.mock_class_assignments a WHERE a.mock_test_id = mt.id) THEN true
    WHEN EXISTS (SELECT 1 FROM public.mock_student_assignments a WHERE a.mock_test_id = mt.id) THEN true
    -- Платный без назначения и тест без типа: разрешать «на всякий случай»
    -- нельзя, это открыло бы разбор там, где решением он не предусмотрен.
    ELSE false
  END
  FROM public.mock_tests mt
  WHERE mt.id = p_mock_test_id;
$function$;

COMMENT ON FUNCTION public.mock_allows_mistake_review(uuid) IS
  'Виден ли по этому моку разбор ошибок: бесплатный или назначенный учителем — да; «Ойлик» и платный самокупленный — нет. Зеркало src/lib/mistake-review-access.ts';

REVOKE ALL ON FUNCTION public.mock_allows_mistake_review(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mock_allows_mistake_review(uuid) TO authenticated;

-- ═══ Разбор для самого ученика ═══
--
-- Функция и раньше отдавала только свои результаты и только опубликованные.
-- Добавлено ровно одно условие — тип теста. Правильный ответ по-прежнему НЕ
-- отдаётся: у одного ученика результат могут опубликовать раньше, чем у
-- остальных, и ключ утёк бы к тем, кто ещё не сдавал. Ученик видит, ГДЕ
-- ошибся и что выбрал, а верный ответ разбирает с учителем.
CREATE OR REPLACE FUNCTION public.get_my_mock_answer_review(p_result_id uuid)
RETURNS TABLE(
  question_id uuid, question_text text, selected_answer text, is_correct boolean,
  points_earned numeric, max_points numeric, review_status text, review_feedback text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT mad.question_id, mad.question_text, mad.selected_answer, mad.is_correct,
         mad.points_earned, mad.max_points, mad.review_status, mad.review_feedback
  FROM public.mock_answer_details mad
  JOIN public.mock_results mr ON mr.id = mad.result_id
  WHERE mad.result_id = p_result_id
    AND mr.user_id = auth.uid()::text
    AND mr.revealed_at IS NOT NULL
    AND public.mock_allows_mistake_review(mr.mock_test_id);
$function$;

NOTIFY pgrst, 'reload schema';
