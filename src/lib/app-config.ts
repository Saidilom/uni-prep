export const APP_NAME = "Registan";
export const APP_DESCRIPTION = "Платформа подготовки к Национальному сертификату";
export const REGISTERED_VIA_KEY = "registan-registered-via";

/** Публичные маршруты без авторизации */
export const PUBLIC_PATHS = ["/login", "/join", "/onboarding"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Канонический адрес сайта.
 *
 * Зашит, а не берётся из окружения: на него ссылаются canonical, hreflang и
 * карта сайта, и они обязаны указывать на прод при любом деплое. Иначе тестовая
 * сборка объявила бы каноническими свои адреса и увела бы индекс на себя.
 */
export const SITE_URL = "https://testregiston.uz";
