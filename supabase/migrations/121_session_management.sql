-- Миграция 121: свои активные сессии — список и отзыв.
--
-- auth.sessions/auth.refresh_tokens не в схемах, которые PostgREST отдаёт по
-- умолчанию (public/storage/graphql_public) — и открывать всю схему auth
-- ради трёх точечных чтений было бы избыточным риском на весь проект вперёд.
-- Вместо этого — SECURITY DEFINER функции в public, тот же паттерн, что
-- is_admin()/is_teacher()/current_branch_id() (миграции 004, 010, 072):
-- фильтр по auth.uid() живёт ВНУТРИ функции, а не в коде роута — так его
-- нельзя случайно потерять будущей правкой.

CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  not_after timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.created_at, s.updated_at, s.user_agent, s.ip::text, s.not_after
  FROM auth.sessions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.updated_at DESC NULLS LAST;
$$;

-- auth.sessions.user_id — настоящий uuid, сравнение с auth.uid() без
-- кастов (это НЕ тот же uuid/text случай, что у public.users.id).
CREATE OR REPLACE FUNCTION public.revoke_my_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions WHERE id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not your session';
  END IF;

  UPDATE auth.refresh_tokens SET revoked = true WHERE session_id = p_session_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_my_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_my_session(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
