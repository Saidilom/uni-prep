-- Миграция 119: вход через Telegram.
--
-- Добавляет telegram_id на public.users как второй способ входа рядом с
-- Google. Регистрация полностью самостоятельная (можно завести аккаунт
-- только через Telegram, без Google вообще) — решение владельца от
-- 2026-09-14, с осознанным принятием того, что один и тот же человек,
-- пришедший и через Google, и через Telegram, получит два разных аккаунта:
-- Telegram не отдаёт email, автоматически сверить личность не с чем.
--
-- ═══ ПОЧЕМУ REVOKE, А НЕ ПРАВКА protect_user_privileged_fields ═══
--
-- users_update_own (миграция 003) разрешает `auth.uid()::text = id` без
-- ограничения по колонкам — то есть сейчас залогиненный пользователь может
-- update({ telegram_id: чужой_id }) прямо из браузера. Из-за частичного
-- уникального индекса ниже это значит: можно «застолбить» за собой чужой
-- Telegram-аккаунт раньше его настоящего владельца.
--
-- protect_user_privileged_fields проверяет is_admin(), который сам делает
-- `id = auth.uid()::text` — а у service_role (которым единственно и должен
-- писать telegram_id при первом входе) auth.uid() равен NULL, claim'а `sub`
-- в его JWT нет. Добавь эту колонку в тот триггер — он заблокирует
-- единственный путь, которым telegram_id вообще должен записываться.
--
-- REVOKE на уровне колонки проверяется Postgres'ом ДО RLS и не зависит от
-- auth.uid() вовсе: блокирует запись для роли authenticated (через которую
-- ходит любой обычный клиентский запрос с сессией), но не трогает
-- service_role, которым идёт запись из /api/auth/telegram.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id_unique
  ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;

REVOKE UPDATE (telegram_id) ON public.users FROM authenticated;

-- handle_new_user() — та же функция из миграции 030, только с telegram_id в
-- списке колонок. Регистр остальных колонок НЕ трогать: shortId/
-- isRegistanStudent/registeredVia без кавычек, "createdAt"/"updatedAt" в
-- кавычках — этот самый регистр один раз уже полностью сломал Google-
-- регистрацию (см. комментарий в 030).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_short_id text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_short_id := 'STU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    BEGIN
      INSERT INTO public.users (
        id, shortId, email, phone, name, surname, role, isRegistanStudent, registeredVia, telegram_id, "createdAt", "updatedAt"
      ) VALUES (
        NEW.id::text,
        v_short_id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Ученик'),
        '',
        'student',
        false,
        COALESCE(NEW.raw_user_meta_data->>'provider', 'google'),
        NULLIF(NEW.raw_user_meta_data->>'telegram_id', '')::bigint,
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
