-- Миграция 122: откат миграции 120.
--
-- В проекте уже был свой rate limiter — миграция 058_rate_limiting.sql,
-- функция public.check_rate_limit(p_key text, p_max int, p_window_seconds
-- int) поверх таблицы public.rate_limits, используется в
-- /api/mock-tests/import и /api/mock-responses/ai-grade. Он не нашёлся при
-- поиске перед миграцией 120 (грепались только ключевые слова вроде
-- "rate-limit"/"upstash"/"redis" — "check_rate_limit" и "058" под них не
-- попали), и 120 по ошибке завела вторую, параллельную реализацию с другой
-- сигнатурой вместо переиспользования уже готовой.
--
-- Оставлять обе — плодить два источника правды на одну и ту же задачу.
-- Убираем добавленное 120-й: функцию с сигнатурой (text, text, int, int) и
-- таблицу rate_limit_events (пустая, только что создана, ничего не потерять).
-- Дальше весь новый код (Telegram-мост, сессии, уведомление о входе) ходит
-- через существующую check_rate_limit(p_key, p_max, p_window_seconds) —
-- ключ строится как "action:identifier", тем же паттерном, что уже
-- принят в существующих вызовах.

DROP FUNCTION IF EXISTS public.check_rate_limit(text, text, int, int);
DROP TABLE IF EXISTS public.rate_limit_events;

NOTIFY pgrst, 'reload schema';
