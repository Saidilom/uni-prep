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

    const decision = evaluatePaymentCreation({
        testType: test.type,
        hasExistingAccess: !!existingAccess,
    });

    if (decision.action === "reject") {
        return NextResponse.json({ error: decision.reason }, { status: 400 });
    }

    const { data: profile } = await supabaseServer
        .from("users")
        .select("name, surname, phone")
        .eq("id", user.id)
        .single();

    // Atomic get-or-create — a plain SELECT-then-INSERT here previously let
    // two near-simultaneous "Оплатить" clicks (double-click, two open tabs)
    // both see "no pending payment yet" and both create one, minting two
    // live checkout sessions for the same purchase. This RPC does the
    // equivalent of INSERT ... ON CONFLICT (user_id, mock_test_id) WHERE
    // status='pending' ... RETURNING inside the database itself, so there
    // is no window where two requests can both "win".
    const { data: paymentId, error: paymentError } = await supabaseServer.rpc("get_or_create_pending_payment", {
        p_user_id: user.id,
        p_user_name: `${profile?.name || ""} ${profile?.surname || ""}`.trim() || "Ученик",
        p_user_phone: profile?.phone || "",
        p_mock_test_id: test.id,
        p_mock_test_title: test.title,
        p_amount: test.price,
    });

    if (paymentError || !paymentId) {
        return NextResponse.json({ error: "Не удалось создать платёж" }, { status: 500 });
    }

    return NextResponse.json({ paymentId, ...buildCheckoutUrls(req, paymentId, test.price) });
}
