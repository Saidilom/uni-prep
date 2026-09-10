import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Свежая ссылка на страницу исходного PDF — чтобы человек видел, что вырезать.
//
// Отдельным роутом, а не полем в ответе импорта: previewUrl живёт час, а
// разбор пятидесяти пяти заданий идёт дольше, и просроченная ссылка ломалась бы
// молча — кнопка есть, нажатие ничего не открывает.
//
// Право проверяется по самому пути: файлы импорта лежат под
// `${user.id}/${importId}/...` (см. import/upload-url), поэтому «путь
// начинается с моего id» и означает «файл мой». Чужую папку так не открыть.
export async function GET(req: NextRequest) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { data: profile } = await supabaseServer.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "teacher") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get("path") || "";
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Нет доступа к этому файлу" }, { status: 403 });
  }

  const { data: signed, error } = await supabaseServer.storage
    .from("test-imports")
    .createSignedUrl(path, 15 * 60);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Не удалось открыть PDF" }, { status: 500 });
  }
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  return NextResponse.json({ url: `${signed.signedUrl}#page=${page}` });
}
