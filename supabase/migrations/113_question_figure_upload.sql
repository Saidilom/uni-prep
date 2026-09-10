-- 113. Рисунок задания можно загрузить руками.
--
-- ═══ ЧТО БЫЛО ═══
--
-- Рисунок задания появлялся только автовырезкой (миграция 107): модель
-- называла рамку, сервер вырезал её из PDF. Если рамки не было — а модель по
-- уговору возвращает null, когда не уверена (§233), — задание оставалось без
-- картинки и отдавало ученику ссылку на ВЕСЬ исходный PDF. На экзамене по
-- такой ссылке листались любые страницы теста.
--
-- Вдобавок сама автовырезка не работала на сервере ни разу: в next.config
-- стояли ключи от Next 15, а проект на Next 14, и mupdf попадал в бандл.
-- Прод-импорт 7-MOCK MATEMATIKA: «Рисунков вырезано: 0; сбой вырезки у 10».
--
-- ═══ ЧТО СТАЛО ═══
--
-- Рисунок можно загрузить файлом — и в студии до публикации, и у уже
-- опубликованного теста, не переигрывая импорт всех 55 вопросов. Показ целого
-- PDF ученику убран из интерфейса совсем.
--
-- Здесь три вещи: bucket начинает принимать обычные скриншоты, появляется
-- счётчик «у скольких заданий рисунка не хватает» для списка тестов и запись
-- рисунка в уже опубликованное задание.

-- ═══ 1. Bucket принимает не только PNG ═══
--
-- PNG отдаёт автовырезка, а человек приносит то, что у него под рукой: снимок
-- экрана в JPEG, изредка WebP. Прежний список из одного image/png отклонял
-- такой файл на уровне хранилища — с невнятной ошибкой в самом конце заливки.
-- Лимит 5 MB остаётся: рисунок задания это график или схема, а не фотография.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'question-figures';

-- ═══ 2. Сколько заданий ждут рисунок ═══
--
-- Публикация теста без рисунка по решению владельца НЕ запрещена, только
-- предупреждает. Значит предупреждение обязано быть видно и после публикации,
-- иначе оно ничего не стоит: именно так незаметно и уехал в прод мок с десятью
-- пустыми заданиями. Отсюда счётчик у кнопки «Рисунки» в списке тестов.
--
-- SECURITY INVOKER осознанно (не DEFINER): права уже описаны политиками
-- mock_questions — админ видит всё, учитель свои тесты, ученику эта таблица не
-- открыта вовсе. Своей проверки внутри не нужно, а service-role из роута
-- обходит RLS и получает счётчики по всем тестам сразу.
--
-- Считать выборкой вопросов на клиенте нельзя: content у 55 заданий на каждый
-- тест — лишний вес, а .select() без пагинации ещё и молча обрежется по
-- max_rows PostgREST.
DROP FUNCTION IF EXISTS public.mock_figure_counts(uuid[]);
CREATE FUNCTION public.mock_figure_counts(p_test_ids uuid[])
 RETURNS TABLE (mock_test_id uuid, needed bigint, missing bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT s.mock_test_id,
         count(*) FILTER (WHERE COALESCE((q.content->>'needsSourceImage')::boolean, false)) AS needed,
         count(*) FILTER (WHERE COALESCE((q.content->>'needsSourceImage')::boolean, false)
                            AND NULLIF(q.image_url, '') IS NULL) AS missing
    FROM public.mock_sections s
    JOIN public.mock_questions q ON q.section_id = s.id
   WHERE s.mock_test_id = ANY(p_test_ids)
   GROUP BY s.mock_test_id;
$function$;

GRANT EXECUTE ON FUNCTION public.mock_figure_counts(uuid[]) TO authenticated, service_role;

-- ═══ 3. Рисунок в уже опубликованное задание ═══
--
-- Двумя полями сразу: сама ссылка и флаг «тут нужен рисунок» в content. Флаг
-- нужен снимаемым, потому что модель иногда отмечает рисунок там, где его нет,
-- и иначе счётчик из §2 горел бы вечно, а снять его было бы нечем.
--
-- Одной функцией, а не двумя запросами с клиента: содержимое content иначе
-- пришлось бы читать, менять и записывать целиком, и параллельная правка
-- потеряла бы чужое поле.
--
-- SECURITY INVOKER — права снова у политик mock_questions: mock_questions_admin
-- (is_admin(), ALL) и mock_questions_teacher_own (автор теста; WITH CHECK на
-- class_only + price = 0 у учительских тестов выполняется всегда). Тому, кому
-- не положено, UPDATE не найдёт строки, и функция скажет об этом явно, а не
-- сделает вид, что сохранила.
DROP FUNCTION IF EXISTS public.set_question_figure(uuid, text, boolean);
CREATE FUNCTION public.set_question_figure(
  p_question_id uuid,
  p_image_url text,
  p_needs_figure boolean
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.mock_questions
     SET image_url = NULLIF(trim(COALESCE(p_image_url, '')), ''),
         content = COALESCE(content, '{}'::jsonb)
                   || jsonb_build_object('needsSourceImage', COALESCE(p_needs_figure, false))
   WHERE id = p_question_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Question not found or not editable';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_question_figure(uuid, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
