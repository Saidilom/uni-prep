import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
    const routeClient = createRouteHandlerClient();
    const {
        data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const mockTestId = body?.mockTestId as string | undefined;
    if (!mockTestId) {
        return NextResponse.json({ error: "mockTestId обязателен" }, { status: 400 });
    }

    const { data: test, error: testError } = await supabaseServer
        .from("mock_tests")
        .select("id, title, type, price")
        .eq("id", mockTestId)
        .single();

    if (testError || !test) {
        return NextResponse.json({ error: "Mock-тест не найден" }, { status: 404 });
    }
    if (test.type !== "paid") {
        return NextResponse.json({ error: "Этот тест не требует оплаты" }, { status: 400 });
    }

    const { data: existingAccess } = await supabaseServer
        .from("mock_access")
        .select("id")
        .eq("user_id", user.id)
        .eq("mock_test_id", mockTestId)
        .maybeSingle();

    if (existingAccess) {
        return NextResponse.json({ error: "У вас уже есть доступ к этому тесту" }, { status: 400 });
    }

    const { data: pendingPayment } = await supabaseServer
        .from("payments")
        .select("id")
        .eq("user_id", user.id)
        .eq("mock_test_id", mockTestId)
        .eq("status", "pending")
        .maybeSingle();

    if (pendingPayment) {
        return NextResponse.json({ paymentId: pendingPayment.id });
    }

    const { data: profile } = await supabaseServer
        .from("users")
        .select("name, surname, phone")
        .eq("id", user.id)
        .single();

    const paymentId = crypto.randomUUID();
    const { error: insertError } = await supabaseServer.from("payments").insert({
        id: paymentId,
        user_id: user.id,
        user_name: `${profile?.name || ""} ${profile?.surname || ""}`.trim() || "Ученик",
        user_phone: profile?.phone || "",
        mock_test_id: test.id,
        mock_test_title: test.title,
        amount: test.price,
        currency: "UZS",
        status: "pending",
        provider: "mock",
    });

    if (insertError) {
        return NextResponse.json({ error: "Не удалось создать платёж" }, { status: 500 });
    }

    return NextResponse.json({ paymentId });
}
