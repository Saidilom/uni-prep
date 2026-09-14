import { NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Выход со всех устройств кроме текущего — единственный путь отзыва,
// который целиком остаётся в поддерживаемом SDK (admin.signOut с scope
// 'others'), без прямой записи во внутреннюю схему auth.
export async function POST() {
    const client = createRouteHandlerClient();
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData.session?.user;
    if (!user || !sessionData.session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const allowed = await checkRateLimit(client, "session_revoke", user.id, 20, 5 * 60);
    if (!allowed) return NextResponse.json({ error: "Слишком много попыток, попробуйте позже" }, { status: 429 });

    const { error } = await supabaseServer.auth.admin.signOut(sessionData.session.access_token, "others");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
