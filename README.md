# Registan

Платформа подготовки к вступительным экзаменам и Национальному сертификату (Узбекистан): диагностическое тестирование (Placement), Mock-экзамены, кабинет учителя с классами, и Super Admin панель.

## Стек

- **Next.js 14** (App Router), TypeScript, Tailwind CSS
- **Supabase** (Postgres + Auth + Storage) — единственный бэкенд, Firebase полностью выведен из эксплуатации
- **Zustand** — клиентское состояние (auth, sidebar, toasts)
- **Vitest** — юнит-тесты для чистой логики (без БД/сети)

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
```

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
