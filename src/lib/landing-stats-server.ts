import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase/server";
import { scoreOnCertificateScale } from "./certificate-scale";
import type { GradeLevel } from "./mock-grade-level";
import { TOP_RESULTS, type LandingStats } from "./landing-stats";

// Живые числа для лендинга — серверная половина.
//
// ═══ ПОЧЕМУ ИЗ БАЗЫ, А НЕ КОНСТАНТАМИ ═══
//
// В присланном макете стояли «12 000+ учеников» и «40 учебных центров», тогда
// как в базе 88 и 3. Решение владельца — показывать настоящие: они растут сами,
// и врать на сайте, где принимают оплату, не придётся никогда.
//
// ═══ ПОЧЕМУ ЭТО БЕЗОПАСНО ═══
//
// Считается на СЕРВЕРЕ сервисным ключом и уезжает в разметку уже числом.
// Анонимного доступа к таблицам не открывается, новых политик не заводится, и
// наружу попадают только агрегаты — счётчики и обезличенные баллы.
//
// Файл НЕ импортировать из клиентских компонентов: он тянет за собой
// next/headers. Типы для них лежат в landing-stats.ts.

/** Как часто пересчитывать. Лендинг — витрина, минутная свежесть ей не нужна. */
const CACHE_SECONDS = 600;

async function loadLandingStats(): Promise<LandingStats | null> {
    try {
        const [students, attempts, questions, branches, top] = await Promise.all([
            supabaseServer.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
            supabaseServer.from("mock_results").select("id", { count: "exact", head: true }),
            supabaseServer.from("mock_questions").select("id", { count: "exact", head: true }),
            supabaseServer.from("branches").select("id", { count: "exact", head: true }),
            // Только ОПУБЛИКОВАННЫЕ работы: до раскрытия результат не видит даже
            // сам ученик, и показывать его на витрине тем более нельзя.
            supabaseServer
                .from("mock_results")
                .select("level_score, level_score_max, grade_level, mock_tests(subject_id)")
                .not("revealed_at", "is", null)
                .not("level_score", "is", null)
                .neq("grade_level", "below_c")
                .order("level_score", { ascending: false })
                .limit(TOP_RESULTS),
        ]);

        // Вложенный mock_tests типизирован массивом, хотя связь «к одному» и
        // приезжает объектом. Разбираем обе формы: полагаться на одну из них
        // значит сломаться при обновлении клиента.
        type Linked = { subject_id: string | null };
        const rows = (top.data || []) as unknown as Array<{
            level_score: number | null;
            level_score_max: number | null;
            grade_level: string | null;
            mock_tests: Linked | Linked[] | null;
        }>;
        const subjectOf = (linked: Linked | Linked[] | null): string | null =>
            (Array.isArray(linked) ? linked[0]?.subject_id : linked?.subject_id) ?? null;

        return {
            students: students.count ?? 0,
            attempts: attempts.count ?? 0,
            questions: questions.count ?? 0,
            branches: branches.count ?? 0,
            topResults: rows
                // Баллы разных тестов приводятся к одной шкале перед показом:
                // у старых тестов максимум 75, у новых 100, и ставить их рядом
                // без приведения значило бы сравнивать разные величины.
                .map((row) => ({
                    score: scoreOnCertificateScale(row.level_score, row.level_score_max) ?? 0,
                    level: (row.grade_level || "below_c") as GradeLevel,
                    subjectId: subjectOf(row.mock_tests),
                }))
                .filter((row) => row.score > 0)
                .sort((a, b) => b.score - a.score),
        };
    } catch (error) {
        // Лендинг обязан открыться и без базы: это витрина, а не кабинет.
        // Блоки с числами просто не рисуются — пустая страница была бы хуже.
        console.error("[landing-stats] не удалось посчитать статистику:", error);
        return null;
    }
}

export const fetchLandingStats = unstable_cache(loadLandingStats, ["landing-stats"], {
    revalidate: CACHE_SECONDS,
});
