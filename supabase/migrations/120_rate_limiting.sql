-- Миграция 120: свой Postgres-счётчик для rate limiting.
--
-- Готовой инфраструктуры (Redis/Upstash) в проекте нет, а на serverless
-- (Vercel) наивный in-memory счётчик ненадёжен — инстансы не делят память
-- между собой. Вместо нового платного стороннего сервиса — таблица в уже
-- существующей базе, в духе остальных решений этого проекта.
--
-- Самоочистка внутри самой функции, а не по расписанию: pg_cron в проекте
-- не установлен (проверено), чистить по крону нечем — check_rate_limit
-- удаляет свои же устаревшие строки первым делом при каждом вызове.

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON public.rate_limit_events(identifier, action, created_at);

-- Как audit_log: RLS включён, политик нет вообще — трогать таблицу может
-- только сама SECURITY DEFINER функция ниже.
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.rate_limit_events
  WHERE identifier = p_identifier
    AND action = p_action
    AND created_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO v_count
  FROM public.rate_limit_events
  WHERE identifier = p_identifier AND action = p_action;

  IF v_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_events (identifier, action) VALUES (p_identifier, p_action);
  RETURN true;
END;
$function$;

-- Только service_role — вызывается исключительно из роутов через
-- supabaseServer. Не выдавать authenticated/anon: иначе клиент мог бы сам
-- себе сбрасывать лимит, просто не вызывая функцию (или вызывая её с чужим
-- identifier).
REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
