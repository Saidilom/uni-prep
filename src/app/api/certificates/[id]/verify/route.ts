import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/server";

// Подтверждение сертификата — отдельным действием, только админом.
//
// Через RPC, а не UPDATE: подтверждение обязано проставить, КТО подтвердил и
// когда. Голым UPDATE это легко забыть, и в базе появились бы «проверенные
// неизвестно кем» записи, которые потом ушли бы в линкинг.
const VerifySchema = z.object({
    verified: z.boolean(),
    note: z.string().max(500).default(""),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

    const { data, error } = await client.rpc("verify_external_certificate", {
        p_certificate_id: params.id,
        p_verified: parsed.data.verified,
        p_note: parsed.data.note,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json(data);
}
