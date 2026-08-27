import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { evaluatePaymentCreation } from "@/lib/payment-rules";
import { buildPaymeCheckoutUrl } from "@/lib/payme";
import { buildClickCheckoutUrl } from "@/lib/click";

function buildCheckoutUrls(req: NextRequest, paymentId: string, amount: number) {
  const returnUrl = `${req.nextUrl.origin}/mock/pay/${paymentId}`;
  const paymeMerchantId = process.env.PAYME_MERCHANT_ID;
  const clickMerchantId = process.env.CLICK_MERCHANT_ID;
  const clickServiceId = process.env.CLICK_SERVICE_ID;

  const paymeUrl = paymeMerchantId
    ? buildPaymeCheckoutUrl({ merchantId: paymeMerchantId, orderId: paymentId, amountUzs: amount, returnUrl, testMode: process.env.PAYME_TEST_MODE === "true" })
    : null;
  const clickUrl = clickMerchantId && clickServiceId
    ? buildClickCheckoutUrl({ serviceId: clickServiceId, merchantId: clickMerchantId, amountUzs: amount, orderId: paymentId, returnUrl })
    : null;

  return { paymeUrl, clickUrl };
}

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

    const { data: existingAccess } = await supabaseServer
        .from("mock_access")
        .select("id")
        .eq("user_id", user.id)
        .eq("mock_test_id", mockTestId)
        .maybeSingle();

    const { data: pendingPayment } = await supabaseServer
        .from("payments")
        .select("id")
        .eq("user_id", user.id)
        .eq("mock_test_id", mockTestId)
        .eq("status", "pending")
        .maybeSingle();

    const decision = evaluatePaymentCreation({
        testType: test.type,
        hasExistingAccess: !!existingAccess,
        pendingPaymentId: pendingPayment?.id ?? null,
    });

    if (decision.action === "reject") {
        return NextResponse.json({ error: decision.reason }, { status: 400 });
    }
    if (decision.action === "reuse_pending") {
        return NextResponse.json({ paymentId: decision.paymentId, ...buildCheckoutUrls(req, decision.paymentId, test.price) });
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
        // Real provider ("payme"/"click") is only known once the matching
        // webhook claims this order — see /api/payments/payme and /click.
        provider: "pending",
    });

    if (insertError) {
        return NextResponse.json({ error: "Не удалось создать платёж" }, { status: 500 });
    }

    return NextResponse.json({ paymentId, ...buildCheckoutUrls(req, paymentId, test.price) });
}
