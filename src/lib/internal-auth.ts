import { timingSafeEqual } from "crypto";

// Авто-публикация результатов (§15) вызывает те же роуты, что и кнопка «Готово»:
// проверку эссе, пересчёт Раша, пересчёт CEFR. Но запускает их сервер — из крона
// или сразу после сдачи последнего ученика, — а у сервера нет ни cookie, ни
// сессии, тогда как все три роута требуют залогиненного пользователя.
//
// Отсюда второй, машинный способ представиться: заголовок с общим секретом.
// Он не заменяет проверку сессии, а стоит рядом с ней, и только для операций,
// которые и так может запустить владелец теста, — ничего нового он не открывает.
export const INTERNAL_SECRET_HEADER = "x-internal-secret";

export function getInternalSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  // Пустой или незаданный CRON_SECRET значит «внутренних вызовов нет», а не
  // «пускать всех»: иначе забытая переменная окружения молча превратила бы
  // заголовок в универсальный обход авторизации.
  return secret && secret.length >= 16 ? secret : null;
}

export function isInternalCall(req: Request): boolean {
  const expected = getInternalSecret();
  if (!expected) return false;
  const provided = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual бросает на разной длине, а длина здесь и так не секрет.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function internalHeaders(): Record<string, string> {
  const secret = getInternalSecret();
  return secret ? { [INTERNAL_SECRET_HEADER]: secret } : {};
}
