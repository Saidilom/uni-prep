import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isInternalCall } from "@/lib/internal-auth";
import { runAutoFinalize } from "@/lib/auto-finalize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Сколько тестов обрабатываем за один заход. Каждый — это проверка эссе всей
// группы и два пересчёта, так что за отведённое время больше и не успеть;
// остальные подхватит следующий запуск через пять минут.
const MAX_TESTS_PER_RUN = 3;

// §15, условие «вышло время». Второй триггер авто-публикации: первый (все сдали)
// живёт в /api/mock-tests/[id]/auto-finalize и срабатывает от действия ученика,
// а этот нужен для случая, когда кто-то просто не пришёл.
//
// Vercel Cron, каждые 5 минут (vercel.json). pg_cron и edge-функций в проекте
// нет, поэтому расписание живёт на стороне хостинга.
export async function GET(req: NextRequest) {
  // Vercel Cron присылает свой Authorization: Bearer CRON_SECRET; тот же
  // секрет принимаем и в общем внутреннем заголовке, чтобы роут можно было
  // дёрнуть вручную при проверке.
  const bearer = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const authorized = isInternalCall(req) || Boolean(secret && bearer === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const nowIso = new Date().toISOString();
  // Кандидаты: время проведения истекло, но авто-публикация ещё не отработала.
  // Тесты без ends_at сюда не попадают — у них нет объявленного конца, и
  // закрывать их должен человек.
  const { data: candidates, error } = await supabaseServer
    .from("mock_tests")
    .select("id, title")
    .not("ends_at", "is", null)
    .lt("ends_at", nowIso)
    .is("auto_finalized_at", null)
    .eq("status", "published")
    .order("ends_at", { ascending: true })
    .limit(MAX_TESTS_PER_RUN * 4);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const processed: Array<{ id: string; title: string; finalized: boolean; reason?: string; revealedCount?: number }> = [];
  for (const test of candidates || []) {
    if (processed.filter((p) => p.finalized).length >= MAX_TESTS_PER_RUN) break;
    const outcome = await runAutoFinalize(test.id as string, req.nextUrl.origin);
    processed.push({
      id: test.id as string,
      title: test.title as string,
      finalized: outcome.finalized,
      reason: outcome.reason,
      revealedCount: outcome.revealedCount,
    });
  }

  return NextResponse.json({ ok: true, checked: (candidates || []).length, processed });
}
