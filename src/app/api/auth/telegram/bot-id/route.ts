import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Числовой bot_id — не секрет (та же публичность, что у имени бота: нужен
// именно программному попапу Telegram.Login.auth(), в отличие от
// автовиджета, которому хватало имени). Отдаём его отдельным лёгким GET —
// вместо того чтобы просить владельца вручную вычислять и заводить ещё одну
// переменную окружения: bot_id — это то, что стоит до двоеточия в уже
// заданном TELEGRAM_BOT_TOKEN.
export async function GET(req: NextRequest) {
    const allowed = await checkRateLimit(supabaseServer, "telegram_bot_id", requestIp(req), 60, 60);
    if (!allowed) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const botId = token?.split(":")[0];
    if (!botId) return NextResponse.json({ error: "Вход через Telegram временно недоступен" }, { status: 503 });

    return NextResponse.json({ botId });
}
