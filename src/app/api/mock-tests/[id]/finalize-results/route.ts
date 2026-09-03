import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

// Пересчёты по группе тяжёлые, а раньше они шли на каждой сдаче: на группе из
// 100 медиана вызова была 119 секунд, 53 из 100 не возвращались за две минуты,
// и ученические чтения просаживались до 10 секунд. Теперь пересчёт идёт ровно
// один раз — здесь, при публикации, когда все ответы уже собраны.
export const maxDuration = 300;

// Thin wrapper around finalize_mock_group_results (053_finalize_mock_group_results.sql,
// current definition 067_finalize_where_clause.sql) — that RPC does its own
// ownership/admin check via auth.uid(), so this route must call it through the
// session-bound client, not the service-role one, or auth.uid() would resolve
// to NULL and every call would be rejected.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data, error } = await client.rpc("finalize_mock_group_results", { p_mock_test_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const revealedCount = (data as { revealedCount?: number } | null)?.revealedCount ?? 0;

  // Пересчёты — после раскрытия и строго в этом порядке: finalize
  // перезаписывает points_earned (перевзвешивание по сложности), а CEFR
  // считает балл за writing именно по ним.
  //
  // Ошибки пересчёта не роняют публикацию: результаты уже раскрыты, это
  // главное, а уровень можно пересчитать повторным нажатием. Но, в отличие от
  // прежнего поведения, мы их хотя бы возвращаем наверх, а не глотаем молча.
  const recalcErrors: string[] = [];
  if (revealedCount > 0) {
    const origin = req.nextUrl.origin;
    const cookie = req.headers.get("cookie") ?? "";

    const rasch = await fetch(`${origin}/api/rasch/recalculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ mockTestId: params.id }),
    }).catch((e) => ({ ok: false, statusText: String(e) }) as Response);
    if (!rasch.ok) recalcErrors.push(`Раш: ${rasch.statusText || "не удалось"}`);

    // CEFR применим только к английскому — для остальных предметов он не
    // нужен, и дёргать его незачем. Сам роут это тоже проверяет и отвечает
    // skipped, но тогда мы платили бы за лишний вызов на каждой публикации.
    const { data: test } = await supabaseServer
      .from("mock_tests")
      .select("subject_id")
      .eq("id", params.id)
      .single();
    if (test?.subject_id === "english") {
      const cefr = await fetch(`${origin}/api/mock-tests/${params.id}/cefr-recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
      }).catch((e) => ({ ok: false, statusText: String(e) }) as Response);
      if (!cefr.ok) recalcErrors.push(`CEFR: ${cefr.statusText || "не удалось"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    revealedCount,
    recalcErrors: recalcErrors.length ? recalcErrors : undefined,
  });
}
