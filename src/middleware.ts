import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeRedirectTarget } from "@/lib/redirect-safety";
import { LOCALE_HEADER } from "@/lib/i18n/get-locale";
import { LANDING_PATH } from "@/lib/landing-routes";

function resolveRedirectTarget(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const target = `${pathname}${search}`;
  return target === "/" ? null : target;
}

// Server-to-server webhooks (Payme/Click call these directly from their own
// infrastructure) never carry a Supabase session cookie at all — without
// this exemption the auth check below would 302 every webhook call to
// /login before the route handler ever ran, silently breaking payments in
// production. These routes authenticate the caller themselves (Basic Auth
// / MD5 signature), not via Supabase auth.
// Авто-публикация результатов по времени — тоже вызов без сессии (планировщик
// зовёт её со своей стороны), и авторизуется она общим секретом CRON_SECRET
// внутри самого роута, а не Supabase-сессией. Без этой строки middleware
// заворачивал её на /login, и роут не отрабатывал никогда.
const PUBLIC_API_PATHS = ["/api/payments/payme", "/api/payments/click", "/api/cron/auto-finalize"];

// Роуты, которые авто-публикация (§15) зовёт с сервера общим секретом
// (x-internal-secret), а не сессией.
//
// БЕЗ ЭТОГО СПИСКА ОНИ НЕ РАБОТАЛИ ВОВСЕ. Проверка ниже заворачивала такой
// вызов на /login, fetch молча шёл по редиректу, получал страницу входа со
// статусом 200 — и вызывающая сторона считала, что всё прошло. Пересчёт Раша,
// CEFR и проверка эссе после автоматического закрытия теста не выполнялись, и
// узнать об этом было нельзя: ошибки не возникало.
//
// Открывать их так безопасно: каждый из трёх проверяет вызывающего сам —
// внутренним секретом ЛИБО сессией с правом на этот тест. Middleware здесь не
// охраняет ничего, что не охранялось бы внутри.
const INTERNAL_API_PATTERNS = [
  /^\/api\/rasch\/recalculate$/,
  /^\/api\/mock-tests\/[^/]+\/grade-essays$/,
  /^\/api\/mock-tests\/[^/]+\/cefr-recalculate$/,
];

export async function middleware(request: NextRequest) {
  if (PUBLIC_API_PATHS.some((path) => request.nextUrl.pathname === path)
      || INTERNAL_API_PATTERNS.some((pattern) => pattern.test(request.nextUrl.pathname))) {
    return NextResponse.next();
  }

  // ═══ Язык языковых версий лендинга ═══
  //
  // На /ru и /uz язык задаёт АДРЕС, а не cookie посетителя. Передаём его
  // заголовком запроса: из него getServerLocale() соберёт <html lang>, и
  // разметка совпадёт с текстом. Без этого робот, у которого cookie нет
  // вовсе, получил бы обе страницы с языком по умолчанию.
  const landingLocale = request.nextUrl.pathname === LANDING_PATH.ru
    ? "ru"
    : request.nextUrl.pathname === "/uz"
      ? "uz"
      : null;
  const requestHeaders = new Headers(request.headers);
  if (landingLocale) requestHeaders.set(LOCALE_HEADER, landingLocale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/onboarding" ||
    request.nextUrl.pathname === "/join";

  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isBranchPage = request.nextUrl.pathname.startsWith("/branch");

  // ═══ Корень для незалогиненного — лендинг, отданный сервером ═══
  //
  // Rewrite, а не redirect: адрес в браузере и в выдаче остаётся
  // «testregiston.uz», без лишнего перехода и без второй ссылки в индексе.
  //
  // Сама страница живёт в (landing)/uz — вне раскладки (dashboard), которая
  // до появления сессии отдаёт крутилку вместо разметки. Раньше корень уходил
  // именно в неё, и роботу доставалось 8 символов текста.
  if (!user && request.nextUrl.pathname === "/") {
    const landingHeaders = new Headers(request.headers);
    landingHeaders.set(LOCALE_HEADER, "uz");
    const rewritten = NextResponse.rewrite(new URL("/uz", request.url), {
      request: { headers: landingHeaders },
    });
    // Куки, которые успел обновить Supabase, переносим руками: они живут на
    // прежнем ответе, а возвращаем мы другой.
    response.cookies.getAll().forEach((cookie) => rewritten.cookies.set(cookie));
    return rewritten;
  }

  // Языковые версии лендинга — такие же публичные страницы, как /login.
  // Без этого /ru заворачивался на вход, и у русской версии не было ни
  // посетителей, ни индексации.
  if (!user && !isAuthPage && !landingLocale && request.nextUrl.pathname !== "/") {
    const target = resolveRedirectTarget(request);
    const loginUrl = new URL("/login", request.url);
    if (target) {
      loginUrl.searchParams.set("redirectTo", target);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Only worth the extra DB round-trip when the role actually gates
  // something (auth pages / admin routes) — every other navigation used to
  // pay for this query and throw the result away.
  if (user && (isAuthPage || isAdminPage || isBranchPage)) {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    // Не удалось ПРОЧИТАТЬ роль — это не то же самое, что «роль не подходит».
    // Раньше обе ситуации сходились в одну проверку `profile?.role !== "admin"`,
    // и любой сбой чтения (сетевая икота, гонка сразу после обновления токена
    // при возврате во вкладку) выбрасывал администратора на главную. Прав это
    // не расширяет: страница всё равно рисуется под своей раскладкой, а она
    // проверяет роль ещё раз на клиенте, и RLS в базе — третий раз.
    if (profileError || !profile) {
      return response;
    }

    if (isAuthPage && profile.role) {
      const redirectTo = request.nextUrl.searchParams.get("redirectTo");
      const target = sanitizeRedirectTarget(redirectTo ? decodeURIComponent(redirectTo) : null);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (isAdminPage && profile.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Админ филиала работает в своём разделе — в /admin его не пускаем: там
    // RLS рассчитан на is_admin(), и он всё равно увидел бы пустые страницы
    // (миграция 072).
    if (isBranchPage && profile.role !== "branch_admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // robots.txt, sitemap.xml и карточка для соцсетей ОБЯЗАНЫ быть здесь.
    // Без них matcher ловил и эти адреса тоже, и робот получал на них 307 на
    // страницу входа — то есть карты сайта у сайта не было вовсе.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
