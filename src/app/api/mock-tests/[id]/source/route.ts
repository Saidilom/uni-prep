import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data: allowed, error: accessError } = await client.rpc("can_access_mock", { p_mock_test_id: params.id });
  if (accessError || !allowed) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { data: test } = await supabaseServer.from("mock_tests").select("source_pdf_path, source_pdf_paths").eq("id", params.id).single();
  const paths = (test?.source_pdf_paths as string[] | null) ?? [];
  const fileIndex = Math.max(0, Number(req.nextUrl.searchParams.get("file") || 0));
  // source_pdf_paths is the source of truth for a multi-file import; falling
  // back to the legacy singular column covers any row from before it existed.
  const path = paths[fileIndex] ?? (fileIndex === 0 ? test?.source_pdf_path : null);
  if (!path) return NextResponse.json({ error: "Исходный PDF не найден" }, { status: 404 });

  const { data: signed, error } = await supabaseServer.storage
    .from("test-imports")
    .createSignedUrl(path, 15 * 60);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Не удалось открыть PDF" }, { status: 500 });
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  return NextResponse.redirect(`${signed.signedUrl}#page=${page}&toolbar=0&navpanes=0`);
}
