-- Одна попытка на ученика.
--
-- Повторная сдача не ограничивалась ничем: can_access_mock специально
-- пропускает того, у кого уже есть результат (чтобы он мог открыть свой
-- разбор), а submit_mock не проверял наличие прежней попытки — и создавал
-- ВТОРУЮ строку в mock_results. В интерфейсе это было даже предложено кнопкой
-- «Повторить». По решению владельца пересдача убирается.
--
-- Почему триггер, а не UNIQUE (user_id, mock_test_id): в базе уже есть
-- накопленные дубли (у одного аккаунта 2-3 попытки на трёх тестах), и
-- уникальный индекс не наложить, не удалив часть истории результатов. Триггер
-- срабатывает только на новых вставках и прошлые данные не трогает.
--
-- Дружелюбная проверка есть и на клиенте (страница теста отказывает до показа
-- вопросов, чтобы ученик не проходил тест впустую), но она не защищает от
-- прямого обращения к API — этим занимается триггер.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_mock_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mock_results
    WHERE mock_test_id = NEW.mock_test_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Вы уже проходили этот тест — повторная сдача недоступна';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_mock_attempt_trg ON public.mock_results;
CREATE TRIGGER prevent_duplicate_mock_attempt_trg
  BEFORE INSERT ON public.mock_results
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_mock_attempt();

NOTIFY pgrst, 'reload schema';
