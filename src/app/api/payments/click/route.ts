import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { CLICK_ERROR, verifyClickSignature, amountsMatch } from "@/lib/click";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Click Merchant API (Shop API v2) — one webhook URL handling both the
// Prepare (action=0) and Complete (action=1) calls, distinguished by the
// `action` field, which is how Click's merchant cabinet expects a single
// callback URL to be configured. Server-to-server like Payme's endpoint —
// no Supabase session, authenticated purely via the MD5 signature.
// Reference: https://docs.click.uz/en/click-api-request/
//
// merchant_trans_id is always our own payments.id (that's what we hand
// Click in the checkout URL as transaction_param). merchant_prepare_id is
// something WE mint during Prepare for Click to echo back at Complete —
// reusing payments.id again is simplest since it's already unique.

type ClickBody = {
  click_trans_id: string | number;
  service_id: string | number;
  click_paydoc_id?: string | number;
  merchant_trans_id: string;
  merchant_prepare_id?: string | number;
  amount: string | number;
  action: string | number;
  error?: string | number;
  error_note?: string;
  sign_time: string;
  sign_string: string;
};

function respond(body: Record<string, unknown>) {
  return NextResponse.json(body);
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.CLICK_SECRET_KEY;
  const expectedServiceId = process.env.CLICK_SERVICE_ID;
  if (!secretKey || !expectedServiceId) {
    return respond({ error: CLICK_ERROR.BAD_REQUEST, error_note: "Service not configured" });
  }

  const body = (await req.json().catch(() => null)) as ClickBody | null;
  if (!body) return respond({ error: CLICK_ERROR.BAD_REQUEST, error_note: "Bad request" });

  const { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time, sign_string, error: clickError } = body;
  const base = { click_trans_id, merchant_trans_id };

  if (String(service_id) !== expectedServiceId) {
    return respond({ ...base, error: CLICK_ERROR.BAD_REQUEST, error_note: "Unknown service_id" });
  }

  const validSignature = verifyClickSignature(
    { clickTransId: click_trans_id, serviceId: service_id, merchantTransId: merchant_trans_id, merchantPrepareId: merchant_prepare_id, amount, action, signTime: sign_time, signString: sign_string },
    secretKey,
  );
  if (!validSignature) return respond({ ...base, error: CLICK_ERROR.SIGN_CHECK_FAILED, error_note: "SIGN CHECK FAILED!" });

  const { data: order } = await supabaseServer.from("payments").select("*").eq("id", merchant_trans_id).maybeSingle();
  if (!order) return respond({ ...base, error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: "Order not found" });

  const actionNum = Number(action);

  if (actionNum === 0) {
    // Prepare — reserve the order, don't grant access yet.
    if (order.status !== "pending") {
      return respond({ ...base, error: CLICK_ERROR.ALREADY_PAID, error_note: "Order already processed" });
    }
    if (!amountsMatch(Number(amount), Number(order.amount))) {
      return respond({ ...base, error: CLICK_ERROR.INCORRECT_AMOUNT, error_note: "Incorrect amount" });
    }

    await supabaseServer
      .from("payments")
      .update({
        provider: "click",
        provider_transaction_id: String(click_trans_id),
        provider_data: { click: { clickTransId: click_trans_id, prepareId: order.id, prepareTime: Date.now() } },
      })
      .eq("id", order.id);

    return respond({ ...base, merchant_prepare_id: order.id, error: CLICK_ERROR.SUCCESS, error_note: "Success" });
  }

  if (actionNum === 1) {
    // Complete — Click reports whether the payment actually succeeded on
    // its side via `error`; a negative value here means Click itself
    // cancelled/failed the payment, not that our merchant_prepare_id check failed.
    if (String(merchant_prepare_id) !== order.id) {
      return respond({ ...base, error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: "merchant_prepare_id mismatch" });
    }

    if (Number(clickError) < 0) {
      await supabaseServer.from("payments").update({ status: "cancelled" }).eq("id", order.id);
      return respond({ ...base, merchant_confirm_id: order.id, error: CLICK_ERROR.SUCCESS, error_note: "Cancelled by Click" });
    }

    if (order.status === "success") {
      // Idempotent retry — do not grant mock_access a second time.
      return respond({ ...base, merchant_confirm_id: order.id, error: CLICK_ERROR.SUCCESS, error_note: "Already confirmed" });
    }

    await supabaseServer.from("payments").update({ status: "success", paid_at: new Date().toISOString() }).eq("id", order.id);
    await supabaseServer.from("mock_access").insert({
      id: crypto.randomUUID(),
      user_id: order.user_id,
      mock_test_id: order.mock_test_id,
      source: "payment",
      payment_id: order.id,
    });

    return respond({ ...base, merchant_confirm_id: order.id, error: CLICK_ERROR.SUCCESS, error_note: "Success" });
  }

  return respond({ ...base, error: CLICK_ERROR.ACTION_NOT_FOUND, error_note: "Unknown action" });
}
