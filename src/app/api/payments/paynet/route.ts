import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { PAYNET_ERROR, verifyPaynetAuth, amountToTiyin, formatPaynetTimestamp } from "@/lib/paynet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paynet's Merchant API: a single JSON-RPC 2.0 endpoint Paynet's servers
// call directly (Basic Auth, not a Supabase session) — server-to-server,
// same shape as Payme (src/app/api/payments/payme/route.ts) but a
// different, unpublished protocol handed to us as a certification test
// plan (5 methods, see paynet.ts). No separate Create step like Payme —
// PerformTransaction both creates and executes in one call, keyed by
// Paynet's own transactionId for idempotent retries.
//
// The account/order identifier field name is assumed to be "order_id",
// matching the Payme/Click convention already used everywhere else in this
// app (payments.id). Confirm this against Paynet's actual test parameters
// before submitting the certification Test Report — if their harness sends
// a different field name, change FIELD_NAME below, nothing else.
const FIELD_NAME = "order_id";

// State stored in payments.provider_data->'paynet':
//   1 = performed (captured) — access is granted exactly here
//   2 = cancelled (before or after being performed)

type JsonRpcRequest = { method?: string; params?: Record<string, unknown>; id?: unknown };

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

type PaynetState = { transactionId: string; providerTrnId: number; state: 1 | 2; performTime: string; cancelTime?: string };
type PaymentRow = {
  id: string;
  user_id: string;
  mock_test_id: string;
  mock_test_title: string;
  amount: number;
  status: string;
  provider: string;
  provider_transaction_id: string | null;
  provider_data: { paynet?: PaynetState };
};

async function findOrder(orderId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseServer.from("payments").select("*").eq("id", orderId).maybeSingle();
  return (data as PaymentRow) ?? null;
}

async function findByPaynetTransactionId(transactionId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseServer
    .from("payments")
    .select("*")
    .eq("provider", "paynet")
    .eq("provider_transaction_id", transactionId)
    .maybeSingle();
  return (data as PaymentRow) ?? null;
}

export async function POST(req: NextRequest) {
  const username = process.env.PAYNET_USERNAME;
  const password = process.env.PAYNET_PASSWORD;
  const serviceId = process.env.PAYNET_SERVICE_ID;
  if (!username || !password || !serviceId) {
    return NextResponse.json({ error: "PAYNET_USERNAME / PAYNET_PASSWORD / PAYNET_SERVICE_ID не настроены" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body?.method) return rpcError(body?.id, -32700, "Parse error");

  if (!verifyPaynetAuth(req.headers.get("authorization"), username, password)) {
    return rpcError(body.id, -32504, "Insufficient privilege");
  }

  const { method, params = {}, id } = body;
  if (params.serviceId !== undefined && String(params.serviceId) !== serviceId) {
    return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");
  }

  const fields = (params.fields as Record<string, string> | undefined) ?? {};
  const orderId = fields[FIELD_NAME];

  switch (method) {
    case "GetInformation": {
      if (!orderId) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");
      const order = await findOrder(orderId);
      if (!order || order.status !== "pending") return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");
      return rpcResult(id, {
        status: 0,
        timestamp: formatPaynetTimestamp(new Date()),
        fields: { [FIELD_NAME]: orderId, title: order.mock_test_title, amount: amountToTiyin(order.amount) },
      });
    }

    case "PerformTransaction": {
      const transactionId = String(params.transactionId ?? "");
      if (!transactionId) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");

      const existingByTx = await findByPaynetTransactionId(transactionId);
      if (existingByTx) {
        // Idempotent retry of the same Paynet transaction (network
        // timeouts) — same paattern as Payme's CreateTransaction/
        // PerformTransaction retry handling — return the identical answer.
        const state = existingByTx.provider_data.paynet!;
        return rpcResult(id, { providerTrnId: state.providerTrnId, timestamp: state.performTime, fields: { [FIELD_NAME]: orderId } });
      }

      if (!orderId) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");
      const order = await findOrder(orderId);
      if (!order) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Клиент не найден");

      if (order.provider === "paynet" && order.provider_transaction_id && order.provider_transaction_id !== transactionId) {
        return rpcError(id, PAYNET_ERROR.DUPLICATE_TRANSACTION, "Транзакция уже существует");
      }
      if (order.status !== "pending") return rpcError(id, PAYNET_ERROR.DUPLICATE_TRANSACTION, "Транзакция уже существует");
      if (amountToTiyin(order.amount) !== Number(params.amount)) return rpcError(id, PAYNET_ERROR.WRONG_AMOUNT, "Сумма превышает максимальный лимит");

      const performTime = formatPaynetTimestamp(new Date());
      const providerTrnId = Date.now();
      const paynetState: PaynetState = { transactionId, providerTrnId, state: 1, performTime };

      await supabaseServer
        .from("payments")
        .update({
          status: "success",
          provider: "paynet",
          provider_transaction_id: transactionId,
          paid_at: new Date().toISOString(),
          provider_data: { paynet: paynetState },
        })
        .eq("id", order.id);

      // upsert + onConflict instead of a plain insert — Paynet may resend
      // this on network timeouts, so two overlapping deliveries could
      // otherwise both insert a row before either commits
      // (mock_access_user_test_unique, 062_mock_access_unique_constraint.sql).
      await supabaseServer.from("mock_access").upsert({
        id: crypto.randomUUID(),
        user_id: order.user_id,
        mock_test_id: order.mock_test_id,
        source: "payment",
        payment_id: order.id,
      }, { onConflict: "user_id,mock_test_id", ignoreDuplicates: true });

      return rpcResult(id, { providerTrnId, timestamp: performTime, fields: { [FIELD_NAME]: orderId } });
    }

    case "CheckTransaction": {
      const transactionId = String(params.transactionId ?? "");
      const order = await findByPaynetTransactionId(transactionId);
      if (!order) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Транзакция не найдена");
      const paynet = order.provider_data.paynet!;
      return rpcResult(id, {
        transactionState: paynet.state,
        timestamp: paynet.cancelTime ?? paynet.performTime,
        providerTrnId: paynet.providerTrnId,
      });
    }

    case "CancelTransaction": {
      const transactionId = String(params.transactionId ?? "");
      const order = await findByPaynetTransactionId(transactionId);
      if (!order) return rpcError(id, PAYNET_ERROR.NOT_FOUND, "Транзакция не найдена");
      const paynet = order.provider_data.paynet!;

      if (paynet.state === 2) {
        return rpcResult(id, { providerTrnId: paynet.providerTrnId, timestamp: paynet.cancelTime, transactionState: 2 });
      }

      const cancelTime = formatPaynetTimestamp(new Date());
      await supabaseServer
        .from("payments")
        .update({ status: "cancelled", provider_data: { paynet: { ...paynet, state: 2, cancelTime } } })
        .eq("id", order.id);

      // A completed purchase got reversed after the fact — pull the access
      // back rather than leaving it silently granted forever (same as
      // Payme's CancelTransaction handling).
      await supabaseServer.from("mock_access").delete().eq("payment_id", order.id);

      return rpcResult(id, { providerTrnId: paynet.providerTrnId, timestamp: cancelTime, transactionState: 2 });
    }

    case "GetStatement": {
      const dateFrom = String(params.dateFrom ?? "");
      const dateTo = String(params.dateTo ?? "");
      const { data } = await supabaseServer
        .from("payments")
        .select("amount, provider_data")
        .eq("provider", "paynet")
        .gte("paid_at", dateFrom.replace(" ", "T"))
        .lte("paid_at", dateTo.replace(" ", "T"));
      const statements = ((data as Array<{ amount: number; provider_data: PaymentRow["provider_data"] }>) || [])
        .filter((row) => row.provider_data.paynet?.state === 1)
        .map((row) => {
          const paynet = row.provider_data.paynet!;
          return {
            amount: amountToTiyin(row.amount),
            providerTrnId: paynet.providerTrnId,
            transactionId: paynet.transactionId,
            timestamp: paynet.performTime,
          };
        });
      return rpcResult(id, { statements });
    }

    default:
      return rpcError(id, -32601, "Method not found");
  }
}
