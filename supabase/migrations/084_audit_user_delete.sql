-- Удаление пользователя — критическое действие, и оно должно попадать в
-- аудит-лог. Триггером, а не вызовом из роута: так событие запишется при любом
-- пути удаления, включая ручной DELETE через SQL (см. CLAUDE.md).
--
-- Вместе с пользователем каскадом уходят его работы, ответы, членство в
-- группах, а у учителя — ещё и сами группы. Поэтому в details складываем
-- слепок: кого удалили и что при этом пропало. После удаления восстановить
-- это будет неоткуда, а вопрос «куда делась группа» рано или поздно возникнет.
--
-- AFTER DELETE, а не BEFORE: логируем состоявшееся удаление. Запрет на снос
-- постоянного супер-админа стоит отдельным BEFORE-триггером (миграция 025) и
-- сработает раньше, так что до этого триггера такая строка не дойдёт.
CREATE OR REPLACE FUNCTION public.audit_log_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,   -- NULL, если удаляли служебным ключом: колонка это допускает
    'user_deleted',
    'user',
    OLD.id,
    jsonb_build_object(
      'email', OLD.email,
      'name', OLD.name,
      'surname', OLD.surname,
      'role', OLD.role,
      'shortId', OLD.shortid,
      'branchId', OLD.branch_id
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_user_delete_trg ON public.users;
CREATE TRIGGER audit_log_user_delete_trg
  AFTER DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_user_delete();

NOTIFY pgrst, 'reload schema';
