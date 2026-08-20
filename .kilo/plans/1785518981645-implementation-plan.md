# План реализации Registan: оставшиеся задачи

> Дата: 31 июля 2026  
> Источник: `plan tz` + аудит кодовой базы  
> Текущее состояние: миграция на Supabase частично выполнена, ядро Placement/Mock/Payment ещё не создано.

---

## 0. Итог аудита (что уже готово)

### Завершено (можно использовать как есть)
- Удалены `firebase`/`firebase-admin` из `package.json`
- Установлены `@supabase/supabase-js`, `@supabase/ssr`
- Созданы `src/lib/supabase/client.ts`, `server.ts`, `auth.ts`
- Переписаны на Supabase: `auth-provider.tsx`, `admin-utils.ts`, `data-fetching.ts`, `profile-utils.ts`, `stats-utils.ts`, `class-utils.ts`
- Страница `/join` (phone OTP + QR-source tracking) — готова
- TypeScript-типы для Placement/Mock/Payment добавлены в `firestore-schema.ts`
- `registan-utils.ts`: `fetchUserPlacementAssignments`, `fetchAvailableMockTests`, `fetchUserMockAccess`, `getMockTestById`, `userHasMockAccess`
- `APP_NAME = "Registan"` в `app-config.ts`

### Частично готово (нудо доведение)
- `firebase.ts` — заглушки, но файл не удалён (legacy `test/[id]/page.tsx` импортирует его)
- `firestore-schema.ts` — расширен типами, но не синхронизирован с Postgres-схемой
- `supabase/schema.sql` — есть только старые таблицы (`users`, `classes`, `badges`, `ratings`, `user_progress`)
- `phone-auth.ts` — `verifyPhoneCode` не реализован (Supabase OTP flow идёт через `onAuthStateChange`)
- `server.ts` — есть `service_role` клиент, но нет cookie-based SSR-клиента по `@supabase/ssr`
- `admin/layout.tsx` — клиентская проверка `role === 'admin'`, без middleware
- `onboarding/page.tsx` — всё ещё показывает выбор роли «Учитель»
- `login/page.tsx` — всё ещё "UniPrep" + только Google
- `sidebar.tsx` — всё ещё "UniPrep", показывает предметы/статистику/достижения

### Не начато
- Нет новых таблиц Placement/Mock/Payments в SQL
- Нет RLS-политик
- Нет индексов
- Нет триггера `on_auth_user_created`
- Нет RPC `submit_placement`/`submit_mock`
- Нет middleware.ts
- Нет страниц: `/admin/users`, `/admin/placement`, `/admin/placement/results`, `/admin/mock-tests`, `/admin/payments`, `/admin/qr`, `/placement/[id]`, `/mock`, `/mock/[id]`
- Нет API Routes: `/api/payments/create`, `/api/payments/webhook`, `/api/admin/qr`
- Нет QR-генерации
- Нет брендинга (логотип, favicon)
- Нет wait-screen после QR-регистрации

---

## Задачи

### Фаза A: База данных (Supabase) — приоритет 1

**A1. Расширить SQL-схему новыми таблицами**

Файл: `supabase/migrations/002_add_placement_mock_payment.sql`

Таблицы:
- `placement_tests`, `placement_questions`, `placement_assignments`, `placement_results`, `placement_answer_details`
- `mock_tests`, `mock_sections`, `mock_questions`, `mock_access`, `mock_results`
- `payments`

Условие: типы и названия полей совпадают с `firestore-schema.ts` (исправить несоответствия: `full_name` → `name`+`surname`, `is_registan_student` → `isRegistanStudent`, и т.д.).

**A2. Добавить FK и триггер**

- `public.users.id` → `auth.users(id)` с `ON DELETE CASCADE`
- Trigger `on_auth_user_created`: при INSERT в `auth.users` создаёт строку в `public.users` (id, shortId, email, phone, name, surname, role='student', isRegistanStudent=false, registeredVia, createdAt)

**A3. Индексы**

- `placement_assignments (user_id, status)`
- `placement_results (user_id, completed_at)`
- `payments (status, paid_at)`
- `users (phone)`, `users (is_registan_student)`

**A4. RLS-политики**

- Включить RLS на всех новых таблицах
- Политика `users_select_own`: пользователь видит свою строку
- Политика `admin_full_access`: `exists (select 1 from users where id = auth.uid() and role = 'admin')`
- Политика `placement_assignments_student`: student видит свои assignments
- Политика `mock_results_student`: student видит свои результаты
- Политика `payments_student`: student видит свои платежи
- Политика `template_read`: placement_tests/mock_tests/вопросы — select всем аутентифицированным
- Политика `payments_service_role`: запись/обновление payments — только через service_role (RLS не мешает service_role)

**A5. RPC-функции (безопасный подсчёт баллов)**

- `submit_placement(assignment_id uuid, answers jsonb) → jsonb`
  - Проверяет, что assignment принадлежит `auth.uid()`
  - Сверяет ответы с `correct_answer` на стороне БД
  - Пишет в `placement_results` + `placement_answer_details`
  - Обновляет `placement_assignments.status = 'completed'`
  - Возвращает `{ score, total, percentage, answers }`
  
- `submit_mock(mock_test_id uuid, answers jsonb) → jsonb`
  - Аналогично, но без assignment_id (проверяет доступ через `mock_access`)

**A6. Удалить/почистить firebase.ts**

- Удалить legacy-импорты из `test/[id]/page.tsx` (переписать на Supabase или вынести в отдельный модуль)
- Удалить `src/lib/firebase.ts` полностью

---

### Фаза B: Auth-инфраструктура — приоритет 2

**B1. Middleware (`src/middleware.ts`)**

- По `@supabase/ssr` обновлять сессию Supabase на каждый запрос
- Редирект с `/login`, `/onboarding`, `/join` для авторизованных пользователей
- Защита `/admin/**` через проверку роли (server-side)

**B2. Исправить `phone-auth.ts`**

- Удалить `verifyPhoneCode` (stub с ошибкой)
- Реализовать через `supabase.auth.getSession()` / `onAuthStateChange` в `auth-provider.tsx`
- Или добавить `/api/auth/verify-code` route handler с server-side verifiction

**B3. Обновить `.env.local`**

- Добавить: `NEXT_PUBLIC_APP_URL=https://registan.uz`
- Оставить: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Payment/SMS переменные — зарезервировать места

---

### Фаза C: Брендинг и скрытие старого функционала — приоритет 3

**C1. Переименовать UniPrep → Registan**

Файлы для обновления:
- `src/app/layout.tsx`: `title: "Registan"`, `description`, favicon
- `src/app/login/page.tsx`: текст, logo alt
- `src/app/onboarding/page.tsx`: убрать выбор роли «Учитель», оставить только «Ученик», добавить поле телефона
- `src/components/sidebar.tsx`: "UniPrep" → "Registan"
- `src/components/topbar.tsx`: "UniPrep" → "Registan"
- `src/components/navbar.tsx`: alt тексты
- `src/components/dashboard-announcement.tsx`: текст
- `src/lib/theme-toggle.tsx`: storage key `registan-theme`
- Везде `uni-prep-theme` → `registan-theme`

**C2. Логотип и favicon**

- Заменить `/auto-Photoroom.png`, `/gogg.png` на логотип Registan
- Обновить `metadata` в `layout.tsx`

**C3. Скрыть/убрать лишнее из навигации**

- `sidebar.tsx`: убрать блок «Предметы» (subjects), «Статистика» (переделать), «Достижения»
- `sidebar.tsx`: показывать только «Главная», «Мои тесты» (новый), «Профиль», «Настройки»
- `classes/page.tsx`, `classes/[id]/page.tsx` — скрыть из sidebar, оставить код за флагом

**C4. Страница «Ожидайте назначения»**

- `/waiting` или встроить в dashboard: если есть `placement_assignments` со статусом `assigned` → показывать кнопку перехода; если нет → «Ожидайте назначения»

**C5. Empty states**

- `/mock`: «Нет доступных Mock-тестов»
- `/placement`: «Тест ещё не назначен»
- `/admin/users`: «Пользователи ещё не зарегистрировались»

---

### Фаза D: Admin-панель — приоритет 4

**D1. Обновить `admin/layout.tsx`**

Новое меню:
```
/admin                — Обзор/статистика
/admin/users          — Пользователи
/admin/placement      — Placement (шаблоны + назначения)
/admin/placement/results — Результаты Placement
/admin/registan       — Ученики Registan (статус)
/admin/mock-tests     — Mock CRUD + результаты
/admin/payments       — Оплаты
/admin/qr             — QR для ресепшена
```

Скрыть в меню (но не удалять код):
- `/admin/subjects`, `/admin/textbooks`, `/admin/topics`

**D2. `/admin/users`**

- Таблица: ФИО, телефон, email, роль, статус Registan, дата регистрации
- Поиск по ФИО/телефону
- Действия: выдать/снять статус Registan, назначить Placement-тест, удалить

**D3. `/admin/placement`**

- Таблица шаблонов (CRUD): title, description, passing_score, time_limit_minutes, количество вопросов
- Редактор вопросов: text, options (a/b/c/d), correct_answer, points, order
- Таблица назначений: выбрать пользователя + тест → insert в `placement_assignments`

**D4. `/admin/placement/results`**

- Таблица: ФИО, телефон, тест, балл, %, дата
- Детальный просмотр по каждому вопросу (selected vs correct)

**D5. `/admin/mock-tests`**

- CRUD шаблонов: title, type (free/paid), price, duration_minutes
- Редактор секций и вопросов
- Таблица результатов прохождения

**D6. `/admin/payments`**

- Таблица: пользователь, телефон, Mock-тест, сумма, статус, дата
- Фильтры: по дате, статусу, пользователю
- Виджеты: общее количество, общая сумма

**D7. `/admin/qr`**

- Генерация QR PNG (пакет `qrcode`) для `https://registan.uz/join?source=reception`
- Отображение QR + кнопка «Скачать»
- Или сохранение в Supabase Storage bucket `qr-codes`

**D8. `/admin/registan`**

- Список пользователей с фильтром `is_registan_student = true`
- Переключатель статуса

---

### Фаза E: Placement Test flow — приоритет 5

**E1. `/placement/[assignmentId]` (страница прохождения)**

- Проверка доступа: `assignment.user_id = auth.uid()` и `status = 'assigned'`
- Таймер (если `time_limit_minutes` задан)
- Вопросы из `placement_questions` (через RPC или select без `correct_answer`)
- Отправка через `submit_placement` RPC
- Блокировка повторного входа после завершения

**E2. Экран результата для ученика**

- После `submit_placement`: краткая сводка (балл, %, поздравление)
- Доступен из `/placement/[assignmentId]` после завершения

**E3. In-app уведомления**

- Realtime-подписка на `placement_assignments` для `auth.uid()`
- При появлении нового `assigned` → показывать toast/badge

---

### Фаза F: Mock-тесты — приоритет 6

**F1. Исследование формата**

- Уточнить у заказчика: структура официального экзамена (секции, время, баллы)

**F2. `/mock` (каталог)**

- Список доступных Mock-тестов
- Статусы: «Доступен», «Заблокирован» (требует оплаты), «Пройден»
- Для Registan-учеников: все бесплатные доступны
- Для остальных: только оплаченные или бесплатные

**F3. `/mock/[testId]` (прохождение)**

- Проверка доступа через `mock_access`
- Таймер обратного отсчёта
- Структура по секциям
- Навигация по вопросам (без instant-feedback)
- Отправка через `submit_mock` RPC

**F4. Результаты Mock**

- Сохранение в `mock_results`
- История прохождений видна в `/admin/mock-tests`

---

### Фаза G: Оплата — приоритет 7

**G1. Выбрать провайдера**

- Уточнить у заказчика: Payme, Click, Uzum

**G2. `/api/payments/create`**

- Серверный Route Handler (только `service_role` клиент)
- Создаёт запись в `payments` со статусом `pending`
- Инициирует платёж у провайдера (redirect на оплату)

**G3. `/api/payments/webhook`**

- Принимает callback от провайдера
- Проверяет подпись/статус
- Обновляет `payments.status` → `success`
- Создаёт запись в `mock_access` (source: `payment`)
- Отправляет SMS/уведомление (опционально)

**G4. `/admin/payments`**

- Таблица + фильтры + виджеты

---

### Фаза H: Тестирование и деплой — приоритет 8

**H1. Валидация миграции**

- `supabase db push` на локальном/remigration
- Проверка RLS: попытка чтения `correct_answer` с фронта → 403
- Проверка RPC: вызов `submit_placement` без авторизации → ошибка

**H2. Сценарии**

1. QR → OTP → регистрация → пользователь в `/admin/users`
2. Админ назначает Placement → ученик видит → проходит → результат в `/admin/placement/results`
3. Mock (бесплатный) → Registan-ученик видит → проходит → результат
4. Mock (платный) → оплата → webhook → доступ открыт → запись в `/admin/payments`

**H3. Нагрузочное тестирование**

- k6/Artillery на RPC `submit_placement`/`submit_mock`
- Connection pooler порт 6543

**H4. Деплой**

- Env-переменные на Vercel
- Webhook URL у провайдера оплаты
- QR с production URL для ресепшена

---

## Критические риски

| Риск | Митигация |
|---|---|
| `verifyPhoneCode` не реализован — OTP flow не завершается | Использовать `supabase.auth.getSession()` + `onAuthStateChange` в `auth-provider.tsx` (уже есть). После `signInWithOtp` Supabase сам устанавливает сессию через deep link; в Next.js это можно обработать через callback route |
| Нет middleware — сессия не обновляется на сервере | Добавить `middleware.ts` по доке `@supabase/ssr` |
| `correct_answer` читаем с фронта | RPC `submit_placement`/`submit_mock` считают баллы на стороне БД; фронт получает только итог |
| Нет триггера — профиль не создаётся автоматически | Сейчас профиль создаётся вручную в `createUserProfile` (join page). Триггер добавить в Фазу A |
| `test/[id]/page.tsx` всё ещё импортирует `firebase.ts` | Переписать на Supabase или вынести legacy-код за рамки MVP |
| `onboarding/page.tsx` показывает учителя | Скрыть/убрать в Фазе C |

---

## Порядок выполнения (сжатый)

```
1. A1–A6  → SQL-схема + RLS + RPC + удаление firebase.ts
2. B1–B3  → middleware + phone-auth + env
3. C1–C5  → брендинг + скрытие старого
4. D1–D8  → новая админка
5. E1–E3  → Placement flow
6. F1–F4  → Mock-тесты
7. G1–G4  → Оплата
8. H1–H4  → Тестирование + деплой
```
