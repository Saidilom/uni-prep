import { NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Уведомление о новом входе. audit_log_login_trg (миграция 015) уже пишет
// запись аудита на КАЖДЫЙ вход любым провайдером — этот роут только
// добавляет ДОСТАВКУ уведомления, не сам факт логирования.
//
// У Google-only пользователей пока нет канала для уведомления вообще:
// email-инфраструктуры в проекте нет, добавлять её не просили. Это
// осознанный, не скрытый пробел — роут просто молча no-op'ает для них.
export async function POST() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const allowed = await checkRateLimit(client, "login_notify", authData.user.id, 1, 60);
    if (!allowed) return NextResponse.json({ ok: true });

    if (!botToken) return NextResponse.json({ ok: true });

    const { data: profile } = await supabaseServer
        .from("users")
        .select("telegram_id")
        .eq("id", authData.user.id)
        .maybeSingle();
    const telegramId = (profile as { telegram_id: number | null } | null)?.telegram_id;
    if (!telegramId) return NextResponse.json({ ok: true });

    try {
        const time = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
        const text = `Новый вход в аккаунт Registan\n${time}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: telegramId, text }),
        });
    } catch (error) {
        // Недоставленное уведомление — не повод возвращать ошибку вызывающей
        // стороне (fire-and-forget с фронта).
        console.error("[auth/notify-login] Telegram sendMessage failed:", error);
    }

    return NextResponse.json({ ok: true });
}
