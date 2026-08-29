# Чек-лист переделки страниц

Отмечай `[x]`, когда страница приведена к `DESIGN_SYSTEM.md` (цвета-токены, шкала radius, три уровня кнопок). Статус ниже — честный снимок на момент создания этого файла, не обновляется автоматически.

## Публичные страницы

- [x] `/login` — `src/app/login/page.tsx`
- [x] `/join` — `src/app/join/page.tsx`
- [x] `/onboarding` — `src/app/onboarding/page.tsx`
- [x] `src/components/auth-shell.tsx` — общая обёртка `/login`+`/join`, теперь использует `<HeroBanner>`

## Ученик

- [x] `/` (Главная, ученик) — `src/app/(dashboard)/page.tsx`
- [x] `/` (Главная, учитель) — `src/components/teacher-home.tsx`
- [x] `/mock` (каталог Mock-тестов) — `src/app/(dashboard)/mock/page.tsx`
- [x] `/mock/[id]` (прохождение теста) — `src/app/mock/[id]/page.tsx`
- [x] `/mock/pay/[paymentId]` — `src/app/mock/pay/[paymentId]/page.tsx`
- [x] `/results` (ученическая ветка) — `src/app/(dashboard)/results/page.tsx`
- [x] `/placement` (Школа) — `src/app/(dashboard)/placement/page.tsx`
- [x] `/placement/[id]` (прохождение Placement) — `src/app/(dashboard)/placement/[id]/page.tsx`
- [x] `/achievements` — `src/app/(dashboard)/achievements/page.tsx`
- [x] `/profile` — `src/app/(dashboard)/profile/page.tsx`

## Учитель

- [x] `/classes` — `src/app/(dashboard)/classes/page.tsx` → `src/components/teacher-dashboard.tsx`
- [ ] `/classes/[id]` — только текст поправлен — `src/app/(dashboard)/classes/[id]/page.tsx`
- [ ] `/classes/[id]/results/[mockTestId]` — только текст поправлен — `src/app/(dashboard)/classes/[id]/results/[mockTestId]/page.tsx`
- [x] `/teacher/mock-tests` — `src/app/(dashboard)/teacher/mock-tests/page.tsx` + `src/components/mock-test-studio.tsx`
- [ ] `/student/[id]` — `src/app/(dashboard)/student/[id]/page.tsx`
- [x] `/results` (учительская ветка `TeacherResultsExplorer`) — `src/components/teacher-results-explorer.tsx`

## Админ

- [ ] `/admin` — `src/app/admin/page.tsx`
- [ ] `/admin/users` — `src/app/admin/users/page.tsx`
- [ ] `/admin/teachers` — только склонение поправлено (`pluralizeRu`) — `src/app/admin/teachers/page.tsx`
- [ ] `/admin/classes` — только текст поправлен — `src/app/admin/classes/page.tsx`
- [ ] `/admin/placement` — `src/app/admin/placement/page.tsx`
- [ ] `/admin/placement/results` — `src/app/admin/placement/results/page.tsx`
- [x] `/admin/mock-tests` — `src/app/admin/mock-tests/page.tsx` + `src/components/mock-test-studio.tsx` (общий компонент с `/teacher/mock-tests`, переделан там же)
- [ ] `/admin/payments` — `src/app/admin/payments/page.tsx`
- [ ] `/admin/qr` — `src/app/admin/qr/page.tsx`

## Общие компоненты (уже на дизайн-системе, не нужно переделывать)

- [x] `src/components/topbar.tsx` — шапка (аватар, дропдаун, быстрый поиск по разделам с ⌘K)
- [x] `src/components/sidebar.tsx` — боковое меню (залито `--brand-olive`, единственное исключение из правила «сайдбар = bg-background»)
- [x] `src/app/(dashboard)/layout.tsx` — спиннер загрузки на токенах
