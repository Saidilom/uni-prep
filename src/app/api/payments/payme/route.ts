import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { PAYME_ERROR, verifyPaymeAuth, amountToTiyin } from "@/lib/payme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Payme's Merchant API: a single JSON-RPC 2.0 endpoint Payme's servers call
// directly (Basic Auth, not a Supabase session) to run the payment through
// its whole lifecycle. This is server-to-server — there is no logged-in
// user on this request at all, unlike every other route in this app.
// Reference: https://developer.help.paycom.uz/
//
// State machine stored in payments.provider_data->'payme':
//   1  = transaction created, not yet captured
//   2  = performed (captured) — access is granted exactly here
//  -1  = cancelled before being performed
//  -2  = cancelled after being performed — access must be revoked

type JsonRpcRequest = { method?: string; params?: Record<string, unknown>; id?: unknown };

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string, data?: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message: { ru: message, uz: message, en: message }, data } });
}

type PaymentRow = {
  id: string;
  user_id: string;
  mock_test_id: string;
  amount: number;
  status: string;
  provider: string;
  provider_transaction_id: string | null;
  provider_data: { payme?: { transactionId: string; state: number; createTime: number; performTime?: number; cancelTime?: number; reason?: number } };
};

async function findOrder(orderId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseServer.from("payments").select("*").eq("id", orderId).maybeSingle();
  return (data as PaymentRow) ?? null;
}

async function findByPaymeTransactionId(paymeTransactionId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseServer
    .from("payments")
    .select("*")
    .eq("provider", "payme")
    .eq("provider_transaction_id", paymeTransactionId)
    .maybeSingle();
  return (data as PaymentRow) ?? null;
}

export async function POST(req: NextRequest) {
  const merchantKey = process.env.PAYME_SECRET_KEY;
  if (!merchantKey) return NextResponse.json({ error: "PAYME_SECRET_KEY не настроен" }, { status: 500 });

  const body = (await req.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body?.method) return rpcError(body?.id, PAYME_ERROR.PARSE_ERROR, "Parse error");

  if (!verifyPaymeAuth(req.headers.get("authorization"), merchantKey)) {
    return rpcError(body.id, PAYME_ERROR.INSUFFICIENT_PRIVILEGE, "Insufficient privilege");
  }

  const { method, params = {}, id } = body;
  const account = params.account as Record<string, string> | undefined;
  const orderId = account?.order_id;

  switch (method) {
    case "CheckPerformTransaction": {
      if (!orderId) return rpcError(id, PAYME_ERROR.ORDER_NOT_FOUND, "order_id required", "order_id");
      const order = await findOrder(orderId);
      if (!order) return rpcError(id, PAYME_ERROR.ORDER_NOT_FOUND, "Order not found", "order_id");
      if (order.status !== "pending") return rpcError(id, PAYME_ERROR.ORDER_NOT_PAYABLE, "Order is not payable");
      if (amountToTiyin(order.amount) !== Number(params.amount)) return rpcError(id, PAYME_ERROR.INVALID_AMOUNT, "Incorrect amount", "amount");
      return rpcResult(id, { allow: true });
    }

    case "CreateTransaction": {
      const paymeTransactionId = params.id as string;
      if (!orderId) return rpcError(id, PAYME_ERROR.ORDER_NOT_FOUND, "order_id required", "order_id");
      const order = await findOrder(orderId);
      if (!order) return rpcError(id, PAYME_ERROR.ORDER_NOT_FOUND, "Order not found", "order_id");

      const existingByTx = await findByPaymeTransactionId(paymeTransactionId);
      if (existingByTx) {
        // Idempotent retry of the same Payme transaction — Payme resends
        // this on network timeouts and expects the identical answer back.
        const state = existingByTx.provider_data.payme!;
        return rpcResult(id, { create_time: state.createTime, transaction: existingByTx.id, state: state.state });
      }

      if (order.provider === "payme" && order.provider_transaction_id && order.provider_transaction_id !== paymeTransactionId) {
        return rpcError(id, PAYME_ERROR.CANNOT_PERFORM, "A different transaction already exists for this order");
      }
      if (order.status !== "pending") return rpcError(id, PAYME_ERROR.ORDER_NOT_PAYABLE, "Order is not payable");
      if (amountToTiyin(order.amount) !== Number(params.amount)) return rpcError(id, PAYME_ERROR.INVALID_AMOUNT, "Incorrect amount", "amount");

      const createTime = Number(params.time) || Date.now();
      await supabaseServer
        .from("payments")
        .update({
          provider: "payme",
          provider_transaction_id: paymeTransactionId,
          provider_data: { payme: { transactionId: paymeTransactionId, state: 1, createTime } },
        })
        .eq("id", order.id);

      return rpcResult(id, { create_time: createTime, transaction: order.id, state: 1 });
    }

    case "PerformTransaction": {
      const paymeTransactionId = params.id as string;
      const order = await findByPaymeTransactionId(paymeTransactionId);
      if (!order) return rpcError(id, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      const payme = order.provider_data.payme!;

      if (payme.state === 2) {
        // Already performed — return the same result, don't grant access twice.
        return rpcResult(id, { transaction: order.id, perform_time: payme.performTime, state: 2 });
      }
      if (payme.state !== 1) return rpcError(id, PAYME_ERROR.CANNOT_PERFORM, "Transaction is cancelled");

      const performTime = Date.now();
      await supabaseServer
        .from("payments")
        .update({
          status: "success",
          paid_at: new Date(performTime).toISOString(),
          provider_data: { payme: { ...payme, state: 2, performTime } },
        })
        .eq("id", order.id);

      // upsert + onConflict(user_id, mock_test_id) instead of a plain insert
      // — Payme resends this on network timeouts (see comment above), so two
      // overlapping deliveries could otherwise both insert a row before
      // either commits (mock_access_user_test_unique, 062_mock_access_unique_constraint.sql).
      await supabaseServer.from("mock_access").upsert({
        id: crypto.randomUUID(),
        user_id: order.user_id,
        mock_test_id: order.mock_test_id,
        source: "payment",
        payment_id: order.id,
      }, { onConflict: "user_id,mock_test_id", ignoreDuplicates: true });

      return rpcResult(id, { transaction: order.id, perform_time: performTime, state: 2 });
    }

    case "CancelTransaction": {
      const paymeTransactionId = params.id as string;
      const reason = Number(params.reason) || 0;
      const order = await findByPaymeTransactionId(paymeTransactionId);
      if (!order) return rpcError(id, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      const payme = order.provider_data.payme!;

      if (payme.state === -1 || payme.state === -2) {
        return rpcResult(id, { transaction: order.id, cancel_time: payme.cancelTime, state: payme.state });
      }

      const wasPerformed = payme.state === 2;
      const cancelTime = Date.now();
      const nextState = wasPerformed ? -2 : -1;
      await supabaseServer
        .from("payments")
        .update({
          status: "cancelled",
          provider_data: { payme: { ...payme, state: nextState, cancelTime, reason } },
        })
        .eq("id", order.id);

      if (wasPerformed) {
        // A completed purchase got refunded/reversed after the fact — pull
        // the access back rather than leaving it silently granted forever.
        await supabaseServer.from("mock_access").delete().eq("payment_id", order.id);
      }

      return rpcResult(id, { transaction: order.id, cancel_time: cancelTime, state: nextState });
    }

    case "CheckTransaction": {
      const paymeTransactionId = params.id as string;
      const order = await findByPaymeTransactionId(paymeTransactionId);
      if (!order) return rpcError(id, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      const payme = order.provider_data.payme!;
      return rpcResult(id, {
        create_time: payme.createTime,
        perform_time: payme.performTime ?? 0,
        cancel_time: payme.cancelTime ?? 0,
        transaction: order.id,
        state: payme.state,
        reason: payme.reason ?? null,
      });
    }

    case "GetStatement": {
      const from = Number(params.from) || 0;
      const to = Number(params.to) || Date.now();
      const { data } = await supabaseServer
        .from("payments")
        .select("id, amount, provider_data")
        .eq("provider", "payme")
        .gte("created_at", new Date(from).toISOString())
        .lte("created_at", new Date(to).toISOString());
      const transactions = ((data as Array<{ id: string; amount: number; provider_data: PaymentRow["provider_data"] }>) || [])
        .filter((row) => row.provider_data.payme)
        .map((row) => {
          const payme = row.provider_data.payme!;
          return {
            id: payme.transactionId,
            time: payme.createTime,
            amount: amountToTiyin(row.amount),
            account: { order_id: row.id },
            create_time: payme.createTime,
            perform_time: payme.performTime ?? 0,
            cancel_time: payme.cancelTime ?? 0,
            transaction: row.id,
            state: payme.state,
            reason: payme.reason ?? null,
          };
        });
      return rpcResult(id, { transactions });
    }

    default:
      return rpcError(id, PAYME_ERROR.METHOD_NOT_FOUND, "Method not found");
  }
}
