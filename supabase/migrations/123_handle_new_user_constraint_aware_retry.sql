-- Миграция 123: handle_new_user() перестаёт слепо ретраить unique_violation.
--
-- Ретрай-цикл на 5 попыток существовал для одного конкретного случая —
-- коллизии shortId (users_shortid_unique, миграция 006): значение случайное,
-- шанс совпадения маленький, но ненулевой, и перегенерация решает проблему.
-- Но exception-хендлер ловил ЛЮБОЙ unique_violation одинаково, включая
-- конфликт по telegram_id (idx_users_telegram_id_unique, миграция 119) — а
-- перегенерация shortId никак не решает конфликт telegram_id: все 5 попыток
-- гарантированно проваливались бы одинаково, и вызывающий код
-- (/api/auth/telegram) получал бы невнятную 500-ку через 5 бесполезных
-- ретраев вместо мгновенной понятной ошибки.
--
-- Настоящий сценарий, где это стреляет: админ удаляет Telegram-пользователя
-- (/api/admin/users/[id]/route.ts) — auth.users удаляется успешно, а
-- следующий шаг (удаление public.users) обрывается по сети/таймауту —
-- остаётся осиротевшая строка с занятым telegram_id. Человек пытается войти
-- через тот же Telegram-аккаунт снова: auth.admin.createUser создаёт новую
-- auth.users-запись, триггер падает на telegram_id, 5 бесполезных ретраев по
-- shortId, невнятная 500-ка вместо понятной причины.
--
-- GET STACKED DIAGNOSTICS достаёт имя реально нарушенного constraint'а (для
-- нарушения уникального ИНДЕКСА, как idx_users_telegram_id_unique, Postgres
-- возвращает имя самого индекса) — ретраим только при совпадении с
-- users_shortid_unique, для всего остального кидаем сразу, без пустых
-- попыток и с понятным текстом причины.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_short_id text;
  v_attempt int := 0;
  v_constraint text;
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
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'users_shortid_unique' AND v_attempt < 5 THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'handle_new_user: unique_violation on % — вероятно telegram_id/email уже занят другим аккаунтом', v_constraint;
    END;
  END LOOP;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
