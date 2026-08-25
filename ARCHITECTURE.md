# ARCHITECTURE.md

## Роуты (Next.js App Router)

Три группы верхнего уровня, каждая со своей раскладкой:

- **`src/app/(dashboard)/`** — обычный пользовательский интерфейс (студент/учитель). Раскладка `layout.tsx` рендерит `Sidebar` + `Topbar` вокруг контента, требует авторизацию (редирект на `/login`, если сессии нет). Ключевые роуты: `/` (главная), `/mock` (каталог Mock-тестов), `/placement` (список назначенных Placement-тестов) и `/placement/[id]` (прохождение), `/classes` + `/classes/[id]` (кабинет учителя), `/profile`, `/settings`, `/id` (карточка ученика с Student ID).
- **`src/app/admin/`** — Super Admin панель. **Не** вложена в `(dashboard)` — у неё свой `layout.tsx` с отдельным меню (см. `menuItems` в `admin/layout.tsx`), полноэкранная, без пользовательского Sidebar/Topbar. Исторически была под `(dashboard)/admin` — при переносе важно, что route group (`(dashboard)`) не влияет на URL, но влияет на вложенность layout'ов; двойной layout — источник давнего бага с "меню в меню".
- **`src/app/mock/[id]/`**, **`src/app/api/`** — вне обеих групп: прохождение Mock-теста (полноэкранное, без раскладки) и все server-side route handlers.

## Auth

Supabase Auth (Google OAuth) через `@supabase/ssr`'s `createBrowserClient` (`src/lib/supabase/client.ts`) — не голый `@supabase/supabase-js` `createClient`, потому что сессия должна жить в cookies, а не только в localStorage: `middleware.ts` и route handlers читают сессию на сервере через серверный клиент, голый клиент этого не даёт (симптом — рабочая сессия в браузере, но редирект на `/login` при каждой навигации).

`handle_new_user()` (Postgres-триггер на `auth.users`, миграция 002) создаёт строку в `public.users` с `role = 'student'` всегда — выбора роли при регистрации нет и не должно быть: роль `teacher`/`admin` назначается только Super Admin постфактум через `/admin/users` или `/admin/teachers`.

## RLS + RPC — как скрыт `correct_answer`

Студент никогда не может напрямую `SELECT` из `placement_questions`/`mock_questions` (RLS на этих таблицах — только admin). Вопросы для прохождения теста отдаются через `SECURITY DEFINER` RPC (`get_placement_questions`, `get_mock_questions`), у которых `RETURNS TABLE(...)` явно не включает `correct_answer`. Проверка и подсчёт результата — тоже RPC (`submit_placement`, `submit_mock`), которые читают вопросы напрямую (внутри функции RLS не действует) и сравнивают ответ ученика с `correct_answer` на сервере — правильный ответ никогда не уходит в браузер до завершения теста.

## Банк вопросов

`question_bank` — источник для авторства (тегируется subject/topic/difficulty, есть картинка). При добавлении в Placement/Mock тест через UI-пикер (`src/components/question-bank-picker.tsx`) содержимое вопроса **копируется** в `placement_questions`/`mock_questions` (с `bank_id` для отслеживания происхождения) — не живая ссылка. См. `CLAUDE.md` за обоснованием.

## Rasch-скоринг

`src/lib/rasch.ts` — чистая (без I/O) реализация JMLE для 1PL Rasch-модели. Вызывается только из `src/app/api/rasch/recalculate/route.ts` — отдельного сервиса, не из `submit_mock`, потому что калибровка сложности вопроса требует ответов всех, кто проходил тест, а не только текущей попытки. Триггерится fire-and-forget с клиента (`src/app/mock/[id]/page.tsx`) сразу после успешного `submit_mock`, не блокирует показ результата. `rasch_score` в `mock_results` — отдельная колонка, никогда не используется как замена `accuracy`/`percentage`.

## Teacher + Classes

`src/lib/class-utils.ts` — весь доступ к `classes`/`class_members`/`mock_class_assignments`. RLS: учитель видит только свои классы (`teacher_id = auth.uid()::text`), студент — только свои membership-строки. Поиск ученика при добавлении в класс — по Student ID (`shortid`, формат `STU-XXXXXX`), не по email/телефону.

## Аудит

`audit_log` заполняется Postgres-триггерами, не кодом приложения — см. `CLAUDE.md`. UI — `/admin/audit-log`.

## Известные архитектурные швы (не путать с "ещё не сделано")

- `src/lib/data-fetching.ts`, `src/app/admin/{subjects,textbooks,topics,questions}/` — админ-инструменты для легаси-иерархии Предмет→Учебник→Тема→Вопрос. Студенческая часть этой цепочки (`/subject/[id]`, `/test/[id]`, `/statistics`, `/textbook/[id]`, поиск по предметам в топбаре) удалена (Группа 10, задача 46) — эти админ-страницы больше ни на что не влияют на стороне ученика, оставлены как есть, не были частью задачи на удаление.
- `src/store/useStatsStore.ts`, `src/lib/stats-utils.ts` (`fetchUserGlobalStats`, `fetchUserBadges`, `fetchUserSubjectRatings`) — используются в живых страницах (`/achievements`, учительский `student/[id]`), не путать с удалённым `fetchSubjectProgress` (был завязан только на удалённую легаси-цепочку).
