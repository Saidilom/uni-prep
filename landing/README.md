# Registan — Landing

Публичный маркетинговый лендинг платформы Registan. Полностью независимый мини-проект: свой `package.json`, свой `node_modules`, свой dev-сервер. Не является роутом основного приложения (`../src/app`) и не импортирует из него код — только повторяет ту же дизайн-систему (цвета, шрифт, радиус, кнопки), задокументированную в `../design/DESIGN_SYSTEM.md`.

## Запуск

```bash
npm install
npm run dev
```

Откроется на `http://localhost:3001` (не `3000`, чтобы не конфликтовать с основным приложением, если оно тоже запущено).

## Сборка

```bash
npm run build
```

Собирается как статический экспорт (`output: "export"` в `next.config.ts`) — папка `out/`, без Node-сервера. Не использует Supabase/переменные окружения основного приложения.

## Куда ведут кнопки

Кнопки «Войти»/«Зарегистрироваться» ведут на реальное приложение через `NEXT_PUBLIC_APP_URL` (по умолчанию — `https://uni-prep-ten.vercel.app`, см. `src/lib/config.ts`). Чтобы указать другой адрес (например, при локальной разработке рядом с основным приложением на `:3000`):

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run dev
```

## Стек

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + React Three Fiber/drei (3D-сцена в hero, лениво подключается только на клиенте и отключается при `prefers-reduced-motion`).
