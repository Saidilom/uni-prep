export const APP_NAME = "Registan";
export const APP_DESCRIPTION = "Платформа подготовки к Национальному сертификату";
export const APP_THEME_KEY = "registan-theme";
export const REGISTERED_VIA_KEY = "registan-registered-via";

/** Публичные маршруты без авторизации */
export const PUBLIC_PATHS = ["/login", "/join", "/onboarding"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
