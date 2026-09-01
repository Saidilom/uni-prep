import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";

// Thin wrapper around finalize_mock_group_results (053_finalize_mock_group_results.sql)
// — that RPC does its own ownership/admin check via auth.uid(), so this route
// must call it through the session-bound client, not the service-role one,
// or auth.uid() would resolve to NULL and every call would be rejected.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data, error } = await client.rpc("finalize_mock_group_results", { p_mock_test_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, revealedCount: (data as { revealedCount?: number } | null)?.revealedCount ?? 0 });
}
