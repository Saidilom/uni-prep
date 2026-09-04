import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { allAssignedStudentsSubmitted, runAutoFinalize } from "@/lib/auto-finalize";

// Проверка эссе всей группы плюс два пересчёта — столько же, сколько у ручной
// кнопки «Готово».
export const maxDuration = 300;

// §15, условие «все сдали». Дёргается браузером ученика сразу после успешной
// сдачи — это единственный момент, когда состав сдавших мог измениться.
//
// Клиент здесь только будильник: сам факт «все сдали» роут пересчитывает
// заново на сервере. Иначе достаточно было бы позвать этот адрес руками, чтобы
// опубликовать результаты раньше времени.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Звать может только тот, кто сам сдавал этот тест: он и есть возможный
  // «последний сдавший».
  const { data: allowed } = await client.rpc("can_access_mock", { p_mock_test_id: params.id });
  if (!allowed) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (!(await allAssignedStudentsSubmitted(params.id))) {
    return NextResponse.json({ finalized: false, reason: "waiting_for_others" });
  }

  const outcome = await runAutoFinalize(params.id, req.nextUrl.origin);
  return NextResponse.json(outcome);
}
