import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Отзыв одного устройства. revoke_my_session() (миграция 121) сама
// проверяет владение сессией через auth.uid() — здесь достаточно передать
// id, подделать чужую сессию через это нельзя.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const allowed = await checkRateLimit(client, "session_revoke", authData.user.id, 20, 5 * 60);
    if (!allowed) return NextResponse.json({ error: "Слишком много попыток, попробуйте позже" }, { status: 429 });

    const { error } = await client.rpc("revoke_my_session", { p_session_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    return NextResponse.json({ ok: true });
}
