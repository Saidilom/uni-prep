import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { getPublicationIssues, ImportedMockSchema } from "@/lib/mock-import-schema";
import { isOwnFigureUrl } from "@/lib/question-figure";

export const dynamic = "force-dynamic";

async function getActor() {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return { client, user: null, role: null };
  const { data: profile } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  return { client, user: authData.user, role: profile?.role as string | null };
}

export async function GET() {
  const { user, role } = await getActor();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (role !== "admin" && role !== "teacher") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  let query = supabaseServer
    .from("mock_tests")
    .select("id,title,description,type,price,duration_minutes,subject_id,language,created_by,status,created_at,published_at,starts_at,ends_at,results_publish_at,closed_at")
    .order("created_at", { ascending: false });
  if (role === "teacher") query = query.eq("created_by", user.id);
  const { data: tests, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creatorIds = Array.from(new Set((tests || []).map((test) => test.created_by).filter(Boolean)));
  const { data: creators } = creatorIds.length
    ? await supabaseServer.from("users").select("id,name,surname").in("id", creatorIds)
    : { data: [] as Array<{ id: string; name: string; surname: string | null }> };
  const creatorMap = new Map((creators || []).map((creator) => [creator.id, `${creator.name} ${creator.surname || ""}`.trim()]));

  // One batched read for every test's submitted-result count instead of a
  // per-row query — used by the studio list to gate the "Готово" (finalize
  // results) button next to Закрыть/Открыть снова.
  const testIds = (tests || []).map((test) => test.id);
  const { data: resultRows } = testIds.length
    ? await supabaseServer.from("mock_results").select("mock_test_id").in("mock_test_id", testIds)
    : { data: [] as Array<{ mock_test_id: string }> };
  const completedCountByTest = new Map<string, number>();
  (resultRows || []).forEach((row) => {
    const key = row.mock_test_id as string;
    completedCountByTest.set(key, (completedCountByTest.get(key) || 0) + 1);
  });

  // Сколько заданий каждого теста ждут рисунок. Одним вызовом на весь список:
  // выбирать вопросы и считать здесь значило бы тащить content у 55 заданий на
  // каждый тест, а .select() без пагинации ещё и молча обрежется по max_rows.
  const { data: figureRows } = testIds.length
    ? await supabaseServer.rpc("mock_figure_counts", { p_test_ids: testIds })
    : { data: [] as Array<{ mock_test_id: string; needed: number; missing: number }> };
  const figuresByTest = new Map(
    ((figureRows || []) as Array<{ mock_test_id: string; needed: number; missing: number }>).map((row) => [
      row.mock_test_id,
      { needed: Number(row.needed) || 0, missing: Number(row.missing) || 0 },
    ]),
  );

  const rows = await Promise.all((tests || []).map(async (test) => {
    const { data: sections } = await supabaseServer.from("mock_sections").select("id").eq("mock_test_id", test.id);
    const sectionIds = (sections || []).map((section) => section.id);
    const { count } = sectionIds.length
      ? await supabaseServer.from("mock_questions").select("id", { count: "exact", head: true }).in("section_id", sectionIds)
      : { count: 0 };
    const figures = figuresByTest.get(test.id);
    return {
      ...test,
      question_count: count || 0,
      creator_name: test.created_by ? creatorMap.get(test.created_by) || "—" : "Старый тест",
      completed_count: completedCountByTest.get(test.id) || 0,
      figure_needed: figures?.needed || 0,
      figure_missing: figures?.missing || 0,
    };
  }));

  return NextResponse.json({ tests: rows });
}

const PublishSchema = z.object({
  draft: ImportedMockSchema,
  importId: z.string().uuid(),
  sourcePdfPaths: z.array(z.string().min(1)).min(1),
  price: z.number().int().min(0),
  isFree: z.boolean().optional(),
  // Без этого поля zod молча отбрасывал его из тела запроса, и тест никогда не
  // попадал в комплект: publish_imported_mock читает payload->>'oylikSetId',
  // а до неё доходил payload уже без него. Комплект оставался пустым, и
  // раздача по предметам просто не срабатывала.
  oylikSetId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  resultsPublishAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { client, user, role } = await getActor();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (role !== "admin" && role !== "teacher") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = PublishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный черновик", details: parsed.error.flatten() }, { status: 400 });
  }
  // §14: тест из комплекта «Ойлик тест» бесплатен всегда — цену за него не
  // спрашиваем. Проверка именно здесь, а не только в интерфейсе: цену в это
  // тело запроса можно прислать и мимо студии.
  const oylikSetId = role === "admin" ? parsed.data.oylikSetId ?? null : null;
  const isFree = role === "admin" ? (Boolean(parsed.data.isFree) || oylikSetId !== null) : false;
  if (role === "admin" && !isFree && parsed.data.price <= 0) {
    return NextResponse.json({ error: "Для платного Mock укажите цену" }, { status: 400 });
  }

  const issues = getPublicationIssues(parsed.data.draft);

  // Ссылка на рисунок обязана быть нашей.
  //
  // Черновик приезжает от клиента, а imageUrl описан в схеме как «любой
  // валидный URL» — то есть сюда пройдёт адрес чужого сайта и поедет ученику на
  // экзамен: сторонний хост увидит IP каждого сдающего, а картинку там могут
  // подменить в любой момент. Пускаем только то, что лежит в нашем bucket.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  parsed.data.draft.sections.forEach((section, sectionIndex) => {
    section.questions.forEach((question) => {
      if (!question.imageUrl) return;
      if (isOwnFigureUrl(question.imageUrl, supabaseUrl)) return;
      const label = question.number || `${sectionIndex + 1}.${question.order + 1}`;
      issues.push(`Задание ${label}: рисунок должен быть загружен в систему, внешняя ссылка не принимается`);
    });
  });

  if (issues.length > 0) {
    return NextResponse.json({ error: "Исправьте тест перед публикацией", issues }, { status: 422 });
  }

  const payload = {
    ...parsed.data.draft,
    importId: parsed.data.importId,
    sourcePdfPaths: parsed.data.sourcePdfPaths,
    isFree,
    oylikSetId,
    price: role === "admin" && !isFree ? parsed.data.price : 0,
    startsAt: role === "admin" ? parsed.data.startsAt ?? null : null,
    endsAt: role === "admin" ? parsed.data.endsAt ?? null : null,
    resultsPublishAt: role === "admin" ? parsed.data.resultsPublishAt ?? null : null,
    importMetadata: {
      importedWithClaude: true,
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
      originalWarnings: parsed.data.draft.warnings,
    },
  };
  const { data: testId, error } = await client.rpc("publish_imported_mock", { p_payload: payload });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ testId });
}

