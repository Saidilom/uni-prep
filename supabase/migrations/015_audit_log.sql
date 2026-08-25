-- Migration 015: Audit log (Группа 8 из PLAN-REGISTAN-V3.md, задача 40)
-- ============================================
-- Задача 39 (global stats dashboard) уже реализована в рамках Группы 16 —
-- см. fetchAdminStats() в src/lib/admin-utils.ts и src/app/admin/page.tsx,
-- там уже есть студенты/учителя/классы/mock-тесты/попытки/выручка. Новый
-- код для 39 не нужен.
--
-- audit_log заполняется ИСКЛЮЧИТЕЛЬНО Postgres-триггерами, не кодом
-- приложения — это гарантирует, что событие попадёт в лог при любом пути
-- изменения данных, а не только там, где кто-то не забыл явно вызвать
-- логирование из клиента. Покрыты все 4 категории из ТЗ: login (у
-- auth.users.last_sign_in_at обновляется при каждом входе, для любого
-- провайдера), изменение роли (public.users.role), назначение тестов
-- (placement_assignments + mock_class_assignments), платежи (payments,
-- при переходе в status = 'success').

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_admin ON public.audit_log
  FOR SELECT USING (public.is_admin());
-- Намеренно нет INSERT/UPDATE/DELETE политики ни для одной роли, включая
-- admin — строки пишут только SECURITY DEFINER функции ниже (они
-- выполняются от имени владельца и обходят RLS), лог нельзя подделать из
-- приложения даже с админской сессией.

-- 1. Login
CREATE OR REPLACE FUNCTION public.audit_log_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (NEW.id::text, 'login', 'user', NEW.id::text, jsonb_build_object('email', NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_login_trg ON auth.users;
CREATE TRIGGER audit_log_login_trg
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.audit_log_login();

-- 2. Role changes
CREATE OR REPLACE FUNCTION public.audit_log_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'role_change',
    'user',
    NEW.id,
    jsonb_build_object('from', OLD.role, 'to', NEW.role, 'targetName', NEW.name, 'targetSurname', NEW.surname)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_role_change_trg ON public.users;
CREATE TRIGGER audit_log_role_change_trg
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.audit_log_role_change();

-- 3a. Placement test assignment (admin -> student)
CREATE OR REPLACE FUNCTION public.audit_log_placement_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NEW.assigned_by,
    'test_assigned',
    'placement_assignment',
    NEW.id::text,
    jsonb_build_object('testTitle', NEW.test_title, 'studentId', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_placement_assigned_trg ON public.placement_assignments;
CREATE TRIGGER audit_log_placement_assigned_trg
  AFTER INSERT ON public.placement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_placement_assigned();

-- 3b. Mock test assignment to a class (teacher -> class)
CREATE OR REPLACE FUNCTION public.audit_log_mock_class_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mock_title text;
  v_class_name text;
BEGIN
  SELECT title INTO v_mock_title FROM public.mock_tests WHERE id = NEW.mock_test_id;
  SELECT name INTO v_class_name FROM public.classes WHERE id = NEW.class_id;
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid()::text,
    'test_assigned',
    'mock_class_assignment',
    NEW.id::text,
    jsonb_build_object('mockTitle', v_mock_title, 'className', v_class_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_mock_class_assigned_trg ON public.mock_class_assignments;
CREATE TRIGGER audit_log_mock_class_assigned_trg
  AFTER INSERT ON public.mock_class_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_mock_class_assigned();

-- 4. Payments reaching status = 'success'
CREATE OR REPLACE FUNCTION public.audit_log_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NEW.user_id,
    'payment',
    'payment',
    NEW.id::text,
    jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency, 'provider', NEW.provider, 'mockTestTitle', NEW.mock_test_title)
  );
  RETURN NEW;
END;
$$;

-- Postgres doesn't allow a WHEN clause referencing OLD on a trigger that
-- also fires on INSERT (OLD doesn't exist yet for that event) — split into
-- two triggers instead of one combined INSERT OR UPDATE trigger.
DROP TRIGGER IF EXISTS audit_log_payment_trg ON public.payments;
DROP TRIGGER IF EXISTS audit_log_payment_insert_trg ON public.payments;
CREATE TRIGGER audit_log_payment_insert_trg
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'success')
  EXECUTE FUNCTION public.audit_log_payment();

DROP TRIGGER IF EXISTS audit_log_payment_update_trg ON public.payments;
CREATE TRIGGER audit_log_payment_update_trg
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.audit_log_payment();

NOTIFY pgrst, 'reload schema';
