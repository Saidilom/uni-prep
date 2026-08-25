import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { evaluatePaymentConfirmation } from "@/lib/payment-rules";

// Stand-in for a real provider webhook. Triggered directly by the mock
// checkout UI (src/app/mock/pay/[paymentId]/page.tsx) since there is no
// external provider to call back yet. Replace with a signature-verified
// /api/payments/webhook once a real provider (Payme/Click/Uzum) is wired up.
export async function POST(req: NextRequest) {
    const routeClient = createRouteHandlerClient();
    const {
        data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const paymentId = body?.paymentId as string | undefined;
    const outcome = body?.outcome as "success" | "cancelled" | undefined;
    if (!paymentId || (outcome !== "success" && outcome !== "cancelled")) {
        return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    const { data: payment, error: paymentError } = await supabaseServer
        .from("payments")
        .select("id, user_id, mock_test_id, status")
        .eq("id", paymentId)
        .single();

    if (paymentError || !payment) {
        return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
    }

    const decision = evaluatePaymentConfirmation({
        paymentOwnerId: payment.user_id,
        paymentStatus: payment.status,
        requestingUserId: user.id,
        outcome,
    });

    if (decision.action === "reject") {
        return NextResponse.json({ error: decision.reason }, { status: decision.httpStatus });
    }
    if (decision.action === "already_resolved") {
        return NextResponse.json({ status: decision.status });
    }
    if (decision.action === "cancel") {
        await supabaseServer.from("payments").update({ status: "cancelled" }).eq("id", paymentId);
        return NextResponse.json({ status: "cancelled" });
    }

    const providerTransactionId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await supabaseServer
        .from("payments")
        .update({
            status: "success",
            paid_at: new Date().toISOString(),
            provider_transaction_id: providerTransactionId,
        })
        .eq("id", paymentId);

    await supabaseServer.from("mock_access").insert({
        id: crypto.randomUUID(),
        user_id: payment.user_id,
        mock_test_id: payment.mock_test_id,
        source: "payment",
        payment_id: paymentId,
    });

    return NextResponse.json({ status: "success", mockTestId: payment.mock_test_id });
}
