# DATABASE.md

Supabase Postgres. Миграции — `supabase/migrations/001_init.sql` … `015_audit_log.sql`, применяются по порядку (`supabase db push --linked`). Каждый файл — с комментарием "почему", читай их, а не только эту таблицу-сводку.

## ⚠️ uuid/text drift

`public.users.id` — **`text`**, хотя в части ранних миграций встречается как `uuid`. Из-за этого любая RLS-политика или RPC, сравнивающая `auth.uid()` (uuid) напрямую с колонкой, ссылающейся на `users.id`, падает с ошибкой `42883` (RLS-ошибка обрывает запрос, не эквивалент `false`) — это был реальный баг на проде (миграция 009 чинила ~15 политик задним числом). Рабочий паттерн: `auth.uid()::text = user_id`, либо `public.is_admin()`/`public.is_teacher()` (SECURITY DEFINER, каст внутри). **Перед новой миграцией всегда проверяй реальный тип через `supabase db query --linked`, не верь объявлению в старом SQL-файле.**

Таблицы, где это подтверждено (все `user_id`/`*_by` колонки — `text`): `users`, `placement_assignments`, `placement_results`, `mock_access`, `mock_results`, `payments`, `classes.teacher_id`, `class_members.student_id`. Таблицы, где id самих сущностей (не ссылки на users) — настоящий `uuid`: `placement_tests`, `placement_questions`, `mock_tests`, `mock_questions`, `question_bank` и т.д. — дрейф специфичен именно для колонок, ссылающихся на пользователя.

## Пользователи и роли

- **`users`** (001, 003, 005, 006, 007) — `id` (text, = `auth.users.id`), `shortid` (Student ID, формат `STU-XXXXXX`, `UNIQUE`, генерируется с retry на конфликт), `role` (`student`/`teacher`/`admin`, только admin может менять — см. `protect_user_privileged_fields` trigger), `isregistanstudent`, `registeredvia`. Создаётся автоматически триггером `handle_new_user()` на `auth.users` при регистрации, всегда с `role = 'student'`.

## Placement (Диагностика)

- **`placement_tests`**, **`placement_questions`** (шаблоны + вопросы, `correct_answer` не отдаётся студенту напрямую — см. ARCHITECTURE.md), **`placement_assignments`** (кто кому назначил, статус `assigned`→`in_progress`→`completed`), **`placement_results`** (итоговый % и счётчики — **без** по-вопросного разбора, см. Решение §1 в `PLAN-REGISTAN-V3.md` и миграцию 012), **`placement_answer_details`** — таблица существует с самого начала (002), но по решению о приватности Placement больше не заполняется.

## Mock

- **`mock_tests`** (`type`: `free`/`paid`/`class_only`, без CHECK constraint), **`mock_sections`**, **`mock_questions`**, **`mock_access`** (кто получил доступ и как — `source`: `registan`/`payment`/`admin`), **`mock_results`** (итог + `rasch_score`, отдельная колонка от `accuracy`/`score`), **`mock_answer_details`** (по-вопросный разбор — в отличие от Placement, здесь **сохраняется**, нужен учителю/админу для анализа, RLS: студент видит только свои, учитель — только по своим классам через `mock_class_assignments`).
- **`mock_item_calibration`** (014) — калибровка Rasch item difficulty по тесту, admin-only.

## Банк вопросов

- **`question_bank`** (013) — `text`/`options`/`correct_answer`/`points` + теги `subject`/`topic`/`difficulty`/`image_url`. Admin-only RLS. `placement_questions`/`mock_questions` имеют `bank_id` (nullable FK, `ON DELETE SET NULL`) + свой собственный `image_url` — контент **копируется** при добавлении в тест, не живая ссылка (см. ARCHITECTURE.md).

## Teacher + Classes

- **`classes`** (`teacher_id`, `name`), **`class_members`** (студент ↔ класс, `UNIQUE(class_id, student_id)`), **`mock_class_assignments`** (какой Mock-тест назначен какому классу). RLS через `public.is_teacher()`.
- Легаси `public.classes` из `001_init.sql` (uuid-массив студентов вместо join-таблицы, без RLS) была пустой на проде — удалена и заменена этой схемой миграцией 010.

## Оплаты

- **`payments`** — `status`: `pending`→`success`/`failed`/`cancelled`, `provider` (сейчас всегда `'mock'` — Payme/Click/Uzum ещё не подключены, см. Группа 5 в `PLAN-REGISTAN-V3.md`). Decision-логика создания/подтверждения платежа вынесена в чистые функции `src/lib/payment-rules.ts` (протестированы в `payment-rules.test.ts`), сами route handlers (`/api/payments/create`, `/api/payments/mock-confirm`) — только I/O-обвязка вокруг них.

## Аудит

- **`audit_log`** (015) — `action`: `login`/`role_change`/`test_assigned`/`payment`. Заполняется только Postgres-триггерами на `auth.users`, `public.users`, `placement_assignments`, `mock_class_assignments`, `payments` — не кодом приложения. Нет INSERT-политики ни для одной роли — таблицу нельзя подделать из приложения. UI: `/admin/audit-log`.

## Легаси (не удалено, но студенческая часть — да)

- **`subjects`**, **`textbooks`**, **`topics`**, **`questions`** — не задокументированы ни в одной checked-in миграции (схема известна только из кода в `src/lib/data-fetching.ts`/`firestore-schema.ts` — сама по себе технический долг). Студенческий UI, который их читал (`/subject/[id]`, `/test/[id]`, `/statistics`, `/textbook/[id]`), удалён (Группа 10, задача 46). Админ-CRUD (`/admin/subjects`, `/admin/textbooks`, `/admin/topics`, `/admin/questions`) оставлен как есть — не путать с новым `question_bank`, это разные таблицы и разные фичи.
- **`badges`**, **`ratings`**, **`user_progress`** (001) — используются активно (`fetchUserBadges`, `fetchUserGlobalStats`/`fetchUserSubjectRatings` в `stats-utils.ts`), не легаси, несмотря на соседство в том же файле с легаси-таблицами выше.
