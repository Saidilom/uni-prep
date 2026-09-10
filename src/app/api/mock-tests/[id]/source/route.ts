import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Исходный PDF теста — ИНСТРУМЕНТ ПЕРСОНАЛА, не показ ученику.
//
// ═══ ПОЧЕМУ ПРОВЕРКА ИМЕННО ТАКАЯ ═══
//
// Ниже отдаётся подписанная ссылка на ЦЕЛЫЙ файл: `#page=N` — это подсказка
// просмотрщику, а не ограничение, и по такой ссылке листается весь тест.
//
// Раньше здесь стоял can_access_mock, то есть доступ был у любого, кому мок
// назначен. Экран мока показывал этот PDF в iframe, когда у задания не было
// вырезанного рисунка, — и ученик листал все страницы теста прямо на экзамене.
// Рисунков не было ни у кого: автовырезка не работала на сервере (ключи
// next.config от Next 15 в проекте на Next 14, миграция 113 в шапке).
//
// Теперь у задания либо есть своя картинка, либо не показывается ничего, а сюда
// приходят только админ и автор теста: им нужно видеть страницу, чтобы вырезать
// рисунок руками. Ученику здесь делать нечего.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data: profile } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (role !== "admin" && role !== "teacher") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { data: test } = await supabaseServer
    .from("mock_tests")
    .select("source_pdf_path, source_pdf_paths, created_by")
    .eq("id", params.id)
    .single();
  if (!test) return NextResponse.json({ error: "Тест не найден" }, { status: 404 });
  if (role === "teacher" && test.created_by !== authData.user.id) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const paths = (test.source_pdf_paths as string[] | null) ?? [];
  const fileIndex = Math.max(0, Number(req.nextUrl.searchParams.get("file") || 0));
  // source_pdf_paths is the source of truth for a multi-file import; falling
  // back to the legacy singular column covers any row from before it existed.
  const path = paths[fileIndex] ?? (fileIndex === 0 ? test.source_pdf_path : null);
  if (!path) return NextResponse.json({ error: "Исходный PDF не найден" }, { status: 404 });

  const { data: signed, error } = await supabaseServer.storage
    .from("test-imports")
    .createSignedUrl(path, 15 * 60);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Не удалось открыть PDF" }, { status: 500 });
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  return NextResponse.redirect(`${signed.signedUrl}#page=${page}&toolbar=0&navpanes=0`);
}
