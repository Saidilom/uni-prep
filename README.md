# Registan

Платформа подготовки к вступительным экзаменам и Национальному сертификату (Узбекистан): диагностическое тестирование (Placement), Mock-экзамены, кабинет учителя с классами, и Super Admin панель.

## Стек

- **Next.js 14** (App Router), TypeScript, Tailwind CSS
- **Supabase** (Postgres + Auth + Storage) — единственный бэкенд, Firebase полностью выведен из эксплуатации
- **Zustand** — клиентское состояние (auth, sidebar, toasts)
- **Vitest** — юнит-тесты для чистой логики (без БД/сети)
- **Google Gemini API + Zod validation** — PDF → проверяемый черновик Mock-теста

Подробнее об архитектуре — см. [ARCHITECTURE.md](./ARCHITECTURE.md). Схема БД и таблицы — см. [DATABASE.md](./DATABASE.md). Инструкции для Claude/AI-агентов, работающих в этом репозитории — см. [CLAUDE.md](./CLAUDE.md).

## Запуск локально

```bash
npm install
npm run dev       # http://localhost:3000
```

### Переменные окружения (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only, для /api/upload и /api/rasch/recalculate
GEMINI_API_KEY=...                   # server-only, никогда не добавлять NEXT_PUBLIC_
GEMINI_MODEL=gemini-3.6-flash        # необязательно, это текущий default импорта
GEMINI_IMPORT_MAX_TOKENS=50000       # необязательно
```

PDF загружается напрямую в приватный Supabase Storage через одноразовый signed upload URL, после чего сервер передаёт его в Gemini Files API. Миграция `017_pdf_first_mock_tests.sql` создаёт bucket и универсальную схему тестов; `018_mock_manual_review.sql` добавляет ручную проверку writing/расширенных ответов.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Дев-сервер Next.js |
| `npm run build` | Продакшн-сборка |
| `npm run lint` | ESLint |
| `npm test` | Vitest (юнит-тесты чистой логики: scoring, permissions, payment rules) |
| `npm run supabase:init` | `supabase db push` — применить миграции |
| `npm run supabase:status` | Статус подключения к Supabase |

Миграции лежат в `supabase/migrations/`, применяются по возрастанию номера через `supabase db push --linked`. Каждая миграция — самодостаточный файл с комментарием, объясняющим, зачем она нужна и что было обнаружено при её написании (особенно важно для расхождений между объявленным в SQL типом и реальным типом колонки в проде — см. [DATABASE.md](./DATABASE.md)).
