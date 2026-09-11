import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Заголовок, которым middleware навязывает язык конкретному маршруту. */
export const LOCALE_HEADER = "x-locale";

/**
 * Язык серверного рендера.
 *
 * Порядок важен: сначала заголовок, потом cookie.
 *
 * Заголовок ставит middleware на языковых страницах лендинга (`/` и `/ru`), и
 * он обязан быть сильнее cookie. Иначе `<html lang>` берётся из предпочтения
 * посетителя, а текст — из адреса, и они расходятся: на `/ru` приезжает
 * русский текст с `lang="uz"`. Для поиска это прямое противоречие разметки
 * содержимому, а у робота cookie нет вовсе — он получил бы язык по умолчанию
 * на обеих страницах сразу.
 */
export function getServerLocale(): Locale {
    const forced = headers().get(LOCALE_HEADER);
    if (isLocale(forced)) return forced;
    const value = cookies().get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : defaultLocale;
}
