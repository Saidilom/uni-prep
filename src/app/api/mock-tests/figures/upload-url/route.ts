import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import {
  checkFigureFile,
  figureStoragePath,
  MAX_FIGURE_BYTES,
  QUESTION_FIGURES_BUCKET,
} from "@/lib/question-figure";

// Подписанная ссылка для загрузки рисунка задания.
//
// Устроено как загрузка исходных PDF (import/upload-url): клиент получает
// одноразовую ссылку и льёт файл прямо в хранилище, минуя наш сервер. Гонять
// картинку через serverless-функцию незачем, а INSERT-политика для этого не
// нужна — у storage.objects её нет ни одной, подписанную ссылку выдаёт
// service-role, и RLS при заливке по ней не спрашивают.
//
// Область у загрузки одна из двух: черновик импорта (тест ещё не опубликован)
// или конкретное задание опубликованного теста. Обе проверяются здесь, потому
// что дальше по цепочке проверять уже нечем.

const RequestSchema = z
  .object({
    contentType: z.string().min(1).max(100),
    size: z.number().int().positive().max(MAX_FIGURE_BYTES),
    /** Черновик импорта: рисунок ещё не привязан к заданию в базе. */
    importId: z.string().uuid().optional(),
    /** Уже опубликованный тест. */
    mockTestId: z.string().uuid().optional(),
    /** Читаемая часть имени файла — номер задания. Ни на что не влияет. */
    key: z.string().min(1).max(64),
  })
  .refine((value) => Boolean(value.importId) !== Boolean(value.mockTestId), {
    // Ровно одна область. Оба поля разом означали бы, что непонятно, чьё право
    // проверять, и такую двусмысленность лучше отклонить, чем угадывать.
    message: "Нужен ровно один из importId и mockTestId",
  });

export async function POST(req: NextRequest) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { data: profile } = await supabaseServer.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role as string | undefined;
  if (role !== "admin" && role !== "teacher") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный запрос загрузки" }, { status: 400 });
  }
  const { contentType, size, importId, mockTestId, key } = parsed.data;

  const file = checkFigureFile({ type: contentType, size });
  if (!file.ok) {
    const message = file.reason === "TYPE"
      ? "Рисунок должен быть картинкой: PNG, JPEG или WebP"
      : file.reason === "SIZE"
        ? `Картинка должна быть меньше ${Math.round(MAX_FIGURE_BYTES / (1024 * 1024))} MB`
        : "Файл пустой";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Учитель грузит только в своё. Админ — куда угодно: он и так видит все
  // тесты, и правит чужие бесплатные моки по роли.
  if (role === "teacher") {
    const { data: owner } = importId
      ? await supabaseServer.from("mock_imports").select("created_by").eq("id", importId).maybeSingle()
      : await supabaseServer.from("mock_tests").select("created_by").eq("id", mockTestId!).maybeSingle();
    if (!owner || owner.created_by !== user.id) {
      return NextResponse.json({ error: "Нет доступа к этому тесту" }, { status: 403 });
    }
  }

  const slot = crypto.randomUUID().slice(0, 8);
  const path = figureStoragePath(importId ?? mockTestId!, key, slot, file.ext);
  const { data, error } = await supabaseServer.storage
    .from(QUESTION_FIGURES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: `Не удалось подготовить загрузку: ${error?.message || "unknown"}` },
      { status: 500 },
    );
  }
  const { data: pub } = supabaseServer.storage.from(QUESTION_FIGURES_BUCKET).getPublicUrl(path);
  return NextResponse.json({ path, token: data.token, publicUrl: pub.publicUrl, contentType: file.mime });
}
