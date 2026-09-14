import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Список сессий текущего пользователя. list_my_sessions() (миграция 121)
// сама фильтрует по auth.uid() внутри SECURITY DEFINER функции — параметра-
// id здесь нет и быть не должно, чужую сессию прочитать неоткуда по
// построению.
export async function GET() {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { data, error } = await client.rpc("list_my_sessions");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ sessions: data ?? [] });
}
