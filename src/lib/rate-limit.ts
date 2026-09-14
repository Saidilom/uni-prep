import { SupabaseClient } from "@supabase/supabase-js";

// Обёртка над уже существующей public.check_rate_limit(p_key, p_max,
// p_window_seconds) (миграция 058) — своя таблица rate_limits, фиксированное
// окно. НЕ заводить вторую реализацию рядом: так уже сделали один раз
// (миграция 120) по ошибке, не найдя эту при поиске, и пришлось откатывать
// (миграция 122).
//
// Ключ — тем же паттерном, что уже принят в существующих вызовах
// (mock-tests/import, mock-responses/ai-grade): "action:identifier".
//
// client — тот, через который вызывается: для уже залогиненного пользователя
// это createRouteHandlerClient() (функция выдана роли authenticated); для
// путей без сессии (Telegram-мост, где идентификатор — IP) — supabaseServer,
// у него тоже есть execute на эту функцию.
export async function checkRateLimit(
    client: SupabaseClient,
    action: string,
    identifier: string,
    maxAttempts: number,
    windowSeconds: number,
): Promise<boolean> {
    const { data, error } = await client.rpc("check_rate_limit", {
        p_key: `${action}:${identifier}`,
        p_max: maxAttempts,
        p_window_seconds: windowSeconds,
    });
    if (error) {
        // Сбой самого лимитера не должен обрушивать защищаемый им роут —
        // но и не должен молча открывать дверь навсегда: логируем и
        // пропускаем как временную деградацию.
        console.error("[rate-limit] check_rate_limit failed:", error);
        return true;
    }
    return data === true;
}

// Vercel выставляет x-forwarded-for на своих edge-нодах; спуфинг с клиента
// напрямую не проходит (заголовок переписывается платформой), но сам факт
// этого стоит перепроверить отдельно, а не считать данностью навсегда.
export function requestIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return request.headers.get("x-real-ip") ?? "unknown";
}
