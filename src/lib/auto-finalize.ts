import { supabaseServer } from "@/lib/supabase/server";
import { getInternalSecret, internalHeaders } from "@/lib/internal-auth";

// §15: то же, что делает кнопка «Готово» у админа/учителя, но без человека.
// Порядок шагов не косметический — каждый следующий читает то, что записал
// предыдущий: балл за эссе должен быть окончательным ДО раскрытия результатов,
// а уровень A+..C считается уже по раскрытым баллам.
//
// Живёт отдельным модулем, потому что вызывающих два и они непохожи: роут,
// который дёргает браузер ученика сразу после сдачи, и крон, который проходит
// по всем просроченным тестам разом.

export type AutoFinalizeOutcome = {
  finalized: boolean;
  reason?: "not_due" | "nothing_to_reveal" | "already_finalized";
  revealedCount?: number;
  gradedEssays?: number;
  warnings?: string[];
};

// Сколько раз подряд дёргать возобновляемый grade-essays. Тот же предел, что у
// ручной кнопки в mock-test-studio: при устойчивой ошибке модели цикл иначе
// никогда не кончится.
const MAX_GRADE_PASSES = 10;

async function gradeEssays(mockTestId: string, origin: string, warnings: string[]): Promise<number> {
  let graded = 0;
  for (let pass = 0; pass < MAX_GRADE_PASSES; pass++) {
    const response = await fetch(`${origin}/api/mock-tests/${mockTestId}/grade-essays`, {
      method: "POST",
      headers: internalHeaders(),
    }).catch((error) => {
      warnings.push(`Проверка эссе: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!response) break;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      warnings.push(`Проверка эссе: ${body?.error || response.statusText}`);
      break;
    }
    graded += Number(body?.graded ?? 0);
    // Останавливаемся, когда проверять нечего либо когда заход не сдвинул
    // счётчик — иначе устойчивая ошибка модели крутила бы цикл впустую.
    if (!body?.remaining || body.graded === 0) break;
  }
  return graded;
}

async function recalculateLevels(mockTestId: string, origin: string, warnings: string[]): Promise<void> {
  const rasch = await fetch(`${origin}/api/rasch/recalculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    body: JSON.stringify({ mockTestId }),
  }).catch(() => null);
  if (!rasch?.ok) warnings.push("Раш: пересчёт не удался");

  const { data: test } = await supabaseServer
    .from("mock_tests")
    .select("subject_id")
    .eq("id", mockTestId)
    .single();
  if (test?.subject_id === "english") {
    const cefr = await fetch(`${origin}/api/mock-tests/${mockTestId}/cefr-recalculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
    }).catch(() => null);
    if (!cefr?.ok) warnings.push("CEFR: пересчёт не удался");
  }
}

// Все ли, кому тест назначен, уже сдали. Считается на сервере, а не в браузере:
// клиент об этом судить не может и не должен.
export async function allAssignedStudentsSubmitted(mockTestId: string): Promise<boolean> {
  const [{ data: classAssignments }, { data: studentAssignments }] = await Promise.all([
    supabaseServer.from("mock_class_assignments").select("class_id").eq("mock_test_id", mockTestId),
    supabaseServer.from("mock_student_assignments").select("student_id").eq("mock_test_id", mockTestId),
  ]);

  const expected = new Set<string>((studentAssignments || []).map((row) => row.student_id as string));
  const classIds = (classAssignments || []).map((row) => row.class_id as string);
  if (classIds.length > 0) {
    const { data: members } = await supabaseServer
      .from("class_members")
      .select("student_id")
      .in("class_id", classIds);
    for (const member of members || []) expected.add(member.student_id as string);
  }

  // Тест никому не назначен (админский платный или бесплатный из каталога) —
  // «все сдали» для него не определено: сдать может кто угодно и когда угодно.
  // Такие закрываются по времени, не по этому условию.
  if (expected.size === 0) return false;

  const { data: results } = await supabaseServer
    .from("mock_results")
    .select("user_id")
    .eq("mock_test_id", mockTestId);
  const submitted = new Set((results || []).map((row) => row.user_id as string));

  for (const studentId of Array.from(expected)) {
    if (!submitted.has(studentId)) return false;
  }
  return true;
}

export async function runAutoFinalize(mockTestId: string, origin: string): Promise<AutoFinalizeOutcome> {
  const warnings: string[] = [];
  // Без секрета проверка эссе и пересчёт уровня ответят 401, и результаты
  // раскроются с нулями за письменные работы. Лучше не начинать вовсе —
  // ручная кнопка «Готово» при этом продолжает работать.
  if (!getInternalSecret()) {
    return { finalized: false, reason: "not_due", warnings: ["CRON_SECRET не задан — авто-публикация выключена"] };
  }

  const { data: test } = await supabaseServer
    .from("mock_tests")
    .select("id, closed_at, results_publish_at, auto_finalized_at")
    .eq("id", mockTestId)
    .single();
  if (!test) return { finalized: false, reason: "not_due" };
  if (test.auto_finalized_at) return { finalized: false, reason: "already_finalized" };
  if (test.results_publish_at && new Date(test.results_publish_at as string) > new Date()) {
    // Дата объявления результатов задана и ещё не наступила — это обещание
    // ученикам, автоматика его не нарушает.
    return { finalized: false, reason: "not_due" };
  }

  const { count: pendingCount } = await supabaseServer
    .from("mock_results")
    .select("id", { count: "exact", head: true })
    .eq("mock_test_id", mockTestId)
    .is("revealed_at", null);
  if (!pendingCount) return { finalized: false, reason: "nothing_to_reveal" };

  // Закрываем сами: финализация отказывает незакрытому тесту, а смысл
  // авто-публикации в том, чтобы не требовать двух нажатий.
  if (!test.closed_at) {
    const { error } = await supabaseServer
      .from("mock_tests")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", mockTestId);
    if (error) warnings.push(`Закрытие теста: ${error.message}`);
  }

  const gradedEssays = await gradeEssays(mockTestId, origin, warnings);

  const { data: finalizeData, error: finalizeError } = await supabaseServer.rpc(
    "finalize_mock_group_results_system",
    { p_mock_test_id: mockTestId }
  );
  if (finalizeError) {
    return { finalized: false, reason: "not_due", warnings: [...warnings, finalizeError.message] };
  }

  const result = finalizeData as { revealedCount?: number; alreadyFinalized?: boolean } | null;
  if (result?.alreadyFinalized) return { finalized: false, reason: "already_finalized", gradedEssays };

  const revealedCount = result?.revealedCount ?? 0;
  if (revealedCount > 0) await recalculateLevels(mockTestId, origin, warnings);

  return {
    finalized: revealedCount > 0,
    revealedCount,
    gradedEssays,
    warnings: warnings.length ? warnings : undefined,
  };
}
