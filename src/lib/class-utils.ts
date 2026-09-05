import supabase from "./supabase/client";
import { User, Class, MockTest } from "./firestore-schema";
import { pageCache } from "./page-cache";
import { fetchAllRows } from "./supabase/fetch-all";
import { formatCorrectAnswer, formatStudentAnswer } from "./answer-display";

// Same reasoning as registan-utils.ts's STUDENT_CACHE_TTL — short enough
// that a just-created class/assignment shows up on its own, long enough that
// hopping between teacher pages (home, class list, class detail) feels
// instant instead of re-fetching every time.
const TEACHER_CACHE_TTL = 60 * 1000;

const toUser = (row: Record<string, unknown>): User =>
    ({
        id: row.id,
        shortId: (row.shortid as string) ?? (row.shortId as string) ?? "",
        email: row.email,
        phone: row.phone ?? "",
        name: row.name,
        surname: row.surname ?? "",
        role: row.role,
        subjects: row.subjects ?? [],
        isRegistanStudent: Boolean(row.isregistanstudent ?? row.isRegistanStudent ?? false),
        registeredVia: (row.registeredvia as User["registeredVia"]) ?? (row.registeredVia as User["registeredVia"]) ?? "google",
        createdAt: (row.createdAt as string) ?? (row.createdat as string) ?? "",
        avatar: (row.avatar as string) ?? "",
    }) as User;

const toClass = (row: Record<string, unknown>): Class => ({
    id: row.id as string,
    teacherId: row.teacher_id as string,
    name: row.name as string,
    subjectId: (row.subject_id as string | null) ?? null,
    branchId: (row.branch_id as string | null) ?? null,
    createdAt: row.created_at as string,
});

export type ClassWithCount = Class & { memberCount: number };

export const fetchTeacherClasses = async (teacherId: string): Promise<ClassWithCount[]> => {
    return pageCache.fetch(`teacherClasses:${teacherId}`, async () => {
        const { data: classes } = await supabase
            .from("classes")
            .select("*")
            .eq("teacher_id", teacherId)
            .order("created_at", { ascending: false });
        if (!classes || classes.length === 0) return [];

        const { data: members } = await supabase
            .from("class_members")
            .select("class_id")
            .in("class_id", classes.map((c) => c.id));
        const counts = new Map<string, number>();
        (members || []).forEach((m) => counts.set(m.class_id, (counts.get(m.class_id) || 0) + 1));

        return classes.map((c) => ({ ...toClass(c), memberCount: counts.get(c.id) || 0 }));
    }, TEACHER_CACHE_TTL);
};

export const fetchClassById = async (classId: string): Promise<Class | null> => {
    return pageCache.fetch(`class:${classId}`, async () => {
        const { data } = await supabase.from("classes").select("*").eq("id", classId).single();
        return data ? toClass(data) : null;
    }, TEACHER_CACHE_TTL);
};

// subjectId обязателен: по нему комплект «Ойлик тест» раздаёт группе её
// предметный тест (см. publish_oylik_set, миграция 073). Филиал группы
// проставляет триггер из карточки учителя, клиент его не передаёт.
export const createClass = async (teacherId: string, name: string, subjectId: string): Promise<Class> => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("classes").insert({ id, teacher_id: teacherId, name, subject_id: subjectId });
    if (error) throw error;
    pageCache.invalidate(`teacherClasses:${teacherId}`);
    return { id, teacherId, name, subjectId, branchId: null, createdAt: new Date().toISOString() };
};

// Предмет задавался только при создании, и у групп, созданных до его
// появления, он пуст — а комплект «Ойлик тест» раздаётся именно по предмету и
// такие группы просто пропускает. Без этой функции починить их было негде,
// кроме как пересоздав группу с потерей состава учеников.
//
// Отдельной RLS-политики не нужно: classes_teacher_own — FOR ALL, учитель и
// так может обновлять свою группу, а админ проходит по classes_admin.
export const updateClassSubject = async (classId: string, subjectId: string): Promise<void> => {
    const { error } = await supabase.from("classes").update({ subject_id: subjectId }).eq("id", classId);
    if (error) throw error;
    pageCache.invalidatePrefix("teacherClasses:");
    pageCache.invalidate(`class:${classId}`);
    pageCache.invalidate("adminClassesOverview");
};

// Смена роли идёт через RPC, а не прямым UPDATE по таблице (миграция 079).
//
// У прямого UPDATE через PostgREST отказ неотличим от успеха: не пропустит
// RLS — затронуто ноль строк и придёт 204 без ошибки; вернёт триггер
// protect_user_privileged_fields роль обратно — тоже тишина. Именно так это и
// выглядело у владельца: роль «не меняется», причины нет.
//
// RPC либо делает работу, либо бросает исключение. Сверка возвращённой роли —
// вторая линия: если её всё-таки подменят, мы скажем об этом вслух, а не
// отрисуем мнимый успех.
export const setUserRole = async (userId: string, role: string): Promise<void> => {
    const { data, error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
    if (error) throw error;
    if (data !== role) {
        throw new Error(`Роль осталась «${data}» вместо «${role}»`);
    }
};

// ═══ Проверяющий письменных работ (миграция 080) ═══
//
// Назначается на КОНКРЕТНЫЙ мок, а не отдельной ролью: так семь предметов
// естественно расходятся по разным людям, и новая роль в проекте не заводится.
// Публиковать результаты назначенный не может — finalize_mock_group_results
// требует автора теста или админа.

export type ReviewerCandidate = { id: string; name: string; role: string };

// Кого вообще можно назначить. Учеников намеренно нет: проверять работы
// одноклассников им нельзя, а «сначала сделай учителем» — осознанный шаг.
export const fetchReviewerCandidates = async (): Promise<ReviewerCandidate[]> => {
    const { data, error } = await supabase
        .from("users")
        .select("id, name, surname, role")
        .in("role", ["teacher", "staff", "branch_admin", "admin"])
        .order("name");
    if (error) throw error;
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: `${row.name ?? ""} ${row.surname ?? ""}`.trim() || (row.id as string),
        role: row.role as string,
    }));
};

export const fetchMockReviewerId = async (mockTestId: string): Promise<string | null> => {
    const { data, error } = await supabase
        .from("mock_reviewers")
        .select("reviewer_id")
        .eq("mock_test_id", mockTestId)
        .limit(1);
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    return rows.length > 0 ? (rows[0].reviewer_id as string) : null;
};

// reviewerId = null снимает назначение. Вставка через upsert по UNIQUE
// (mock_test_id, reviewer_id): повторное назначение того же человека должно
// быть безобидным, а не падать на полпути.
export const setMockReviewer = async (mockTestId: string, reviewerId: string | null, assignedBy: string): Promise<void> => {
    const { error: clearError } = await supabase.from("mock_reviewers").delete().eq("mock_test_id", mockTestId);
    if (clearError) throw clearError;
    if (!reviewerId) return;
    const { error } = await supabase
        .from("mock_reviewers")
        .upsert({ mock_test_id: mockTestId, reviewer_id: reviewerId, assigned_by: assignedBy }, { onConflict: "mock_test_id,reviewer_id" });
    if (error) throw error;
};

export type ReviewMock = {
    mockTestId: string;
    title: string;
    subjectId: string | null;
    takerCount: number;
    pendingCount: number;
};

// Мои тесты на проверку. Фильтр по проверяющему делает не запрос, а политики
// из 080: чужие моки просто не приходят.
export const fetchMyReviewMocks = async (): Promise<ReviewMock[]> => {
    const { data: assignments, error } = await supabase.from("mock_reviewers").select("mock_test_id");
    if (error) throw error;
    const mockTestIds = Array.from(new Set(((assignments || []) as Array<Record<string, unknown>>).map((a) => a.mock_test_id as string)));
    if (mockTestIds.length === 0) return [];

    const [{ data: tests }, { data: results }] = await Promise.all([
        supabase.from("mock_tests").select("id, title, subject_id").in("id", mockTestIds),
        // Постранично: на моке со ста участниками плоский select молча
        // обрезался бы по max_rows PostgREST, и «осталось проверить» показало
        // бы меньше, чем есть. Занижение тут особенно скверное — проверяющий
        // решит, что закончил.
        fetchAllRows<{ id: string; mock_test_id: string }>((from, to) =>
            supabase.from("mock_results").select("id, mock_test_id").in("mock_test_id", mockTestIds).order("id").range(from, to)),
    ]);

    const resultIds = ((results || []) as Array<Record<string, unknown>>).map((r) => r.id as string);
    const mockByResult = new Map(((results || []) as Array<Record<string, unknown>>).map((r) => [r.id as string, r.mock_test_id as string]));

    const { data: pendingRows } = resultIds.length > 0
        ? await fetchAllRows<{ result_id: string }>((from, to) =>
            supabase.from("mock_answer_details").select("result_id")
                .in("result_id", resultIds).in("review_status", ["pending", "ai_graded"])
                .order("id").range(from, to))
        : { data: [] as Array<{ result_id: string }> };

    const pendingByMock = new Map<string, number>();
    (pendingRows || []).forEach((row) => {
        const mockId = mockByResult.get(row.result_id as string);
        if (!mockId) return;
        pendingByMock.set(mockId, (pendingByMock.get(mockId) || 0) + 1);
    });
    const takersByMock = new Map<string, number>();
    ((results || []) as Array<Record<string, unknown>>).forEach((r) => {
        const mockId = r.mock_test_id as string;
        takersByMock.set(mockId, (takersByMock.get(mockId) || 0) + 1);
    });

    return ((tests || []) as Array<Record<string, unknown>>).map((test) => ({
        mockTestId: test.id as string,
        title: test.title as string,
        subjectId: (test.subject_id as string | null) ?? null,
        takerCount: takersByMock.get(test.id as string) || 0,
        pendingCount: pendingByMock.get(test.id as string) || 0,
    }));
};

// Есть ли у меня вообще назначения — от этого зависит пункт меню. Кэшируем:
// сайдбар рисуется на каждой навигации, а ответ меняется редко.
export const fetchHasReviewAssignments = async (userId: string): Promise<boolean> => {
    return pageCache.fetch(`hasReviewAssignments:${userId}`, async () => {
        const { data } = await supabase.from("mock_reviewers").select("id").limit(1);
        return (data || []).length > 0;
    }, TEACHER_CACHE_TTL);
};

export const deleteClass = async (classId: string): Promise<void> => {
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    if (error) throw error;
    pageCache.invalidatePrefix("teacherClasses:");
    pageCache.invalidate(`class:${classId}`);
    pageCache.invalidate(`classMembers:${classId}`);
    pageCache.invalidate(`classMockAssignments:${classId}`);
};

export const fetchClassMembers = async (classId: string): Promise<User[]> => {
    return pageCache.fetch(`classMembers:${classId}`, async () => {
        const { data: members } = await supabase.from("class_members").select("student_id").eq("class_id", classId);
        const studentIds = (members || []).map((m) => m.student_id as string);
        if (studentIds.length === 0) return [];
        const { data: users } = await supabase.from("users").select("*").in("id", studentIds);
        return (users || []).map(toUser);
    }, TEACHER_CACHE_TTL);
};

export const findStudentByShortId = async (shortId: string): Promise<User | null> => {
    const { data } = await supabase
        .from("users")
        .select("*")
        .eq("shortid", shortId.trim().toUpperCase())
        .eq("role", "student")
        .maybeSingle();
    return data ? toUser(data) : null;
};

export const addStudentToClass = async (classId: string, studentId: string): Promise<void> => {
    const { error } = await supabase.from("class_members").insert({ id: crypto.randomUUID(), class_id: classId, student_id: studentId });
    if (error) throw error;
    pageCache.invalidate(`classMembers:${classId}`);
    pageCache.invalidate(`classStudentsOverview:${classId}`);
    pageCache.invalidatePrefix("teacherClasses:");
    pageCache.invalidatePrefix("teacherResultsOverview:");
};

export const removeStudentFromClass = async (classId: string, studentId: string): Promise<void> => {
    const { error } = await supabase.from("class_members").delete().eq("class_id", classId).eq("student_id", studentId);
    if (error) throw error;
    pageCache.invalidate(`classMembers:${classId}`);
    pageCache.invalidate(`classStudentsOverview:${classId}`);
    pageCache.invalidatePrefix("teacherClasses:");
    pageCache.invalidatePrefix("teacherResultsOverview:");
};

export type ClassMockAssignment = {
    id: string;
    mockTestId: string;
    title: string;
    durationMinutes: number;
    completedCount: number;
    // Закрытие назначения этой конкретной группы (миграция 073). Тест может
    // оставаться открытым для остальных групп — учитель закрывает свою, когда
    // все его ученики сдали.
    closedAt: string | null;
    // Порядковый номер теста внутри его предмета (миграция 076). Нужен потому,
    // что одноимённых тестов бывает несколько — по названию их не различить.
    seq: number | null;
    createdAt: string | null;
};

export const fetchAssignableMockTests = async (teacherId: string): Promise<MockTest[]> => {
    return pageCache.fetch(`assignableMockTests:${teacherId}`, async () => {
        const { data } = await supabase
            .from("mock_tests")
            .select("*")
            .eq("type", "class_only")
            .eq("status", "published")
            .eq("created_by", teacherId)
            .order("created_at", { ascending: false });
        return (data || []) as MockTest[];
    }, TEACHER_CACHE_TTL);
};

// Номера считает база (get_mock_numbers, миграция 076), а не клиент: у учителя
// RLS показывает не все тесты предмета, и посчитанный на клиенте номер отличался
// бы от админского для одного и того же теста.
export const fetchMockNumbers = async (mockTestIds: string[]): Promise<Map<string, number>> => {
    if (mockTestIds.length === 0) return new Map();
    const { data, error } = await supabase.rpc("get_mock_numbers", { p_ids: mockTestIds });
    if (error) return new Map();
    return new Map(((data || []) as Array<Record<string, unknown>>).map((row) => [row.mock_test_id as string, Number(row.seq)]));
};

export const fetchClassMockAssignments = async (classId: string): Promise<ClassMockAssignment[]> => {
    return pageCache.fetch(`classMockAssignments:${classId}`, async () => {
        const { data: assignments } = await supabase
            .from("mock_class_assignments")
            .select("id, mock_test_id, closed_at")
            .eq("class_id", classId);
        if (!assignments || assignments.length === 0) return [];

        const mockTestIds = assignments.map((a) => a.mock_test_id as string);
        const [{ data: tests }, { data: members }, numbers] = await Promise.all([
            supabase.from("mock_tests").select("id, title, duration_minutes, created_at").in("id", mockTestIds),
            supabase.from("class_members").select("student_id").eq("class_id", classId),
            fetchMockNumbers(mockTestIds),
        ]);
        const studentIds = (members || []).map((m) => m.student_id as string);
        const testMap = new Map((tests || []).map((t) => [t.id, t]));

        const results: ClassMockAssignment[] = [];
        for (const a of assignments) {
            const test = testMap.get(a.mock_test_id);
            let completedCount = 0;
            if (studentIds.length > 0) {
                const { count } = await supabase
                    .from("mock_results")
                    .select("id", { count: "exact", head: true })
                    .eq("mock_test_id", a.mock_test_id)
                    .in("user_id", studentIds);
                completedCount = count || 0;
            }
            results.push({
                id: a.id as string,
                mockTestId: a.mock_test_id as string,
                title: test?.title || "—",
                durationMinutes: (test?.duration_minutes as number) || 0,
                completedCount,
                closedAt: (a.closed_at as string | null) ?? null,
                seq: numbers.get(a.mock_test_id as string) ?? null,
                createdAt: (test?.created_at as string | null) ?? null,
            });
        }
        return results;
    }, TEACHER_CACHE_TTL);
};

export const assignMockToClass = async (mockTestId: string, classId: string): Promise<void> => {
    const { error } = await supabase.from("mock_class_assignments").insert({ id: crypto.randomUUID(), mock_test_id: mockTestId, class_id: classId });
    if (error) throw error;
    pageCache.invalidate(`classMockAssignments:${classId}`);
};

export const unassignMockFromClass = async (assignmentId: string, classId: string): Promise<void> => {
    const { error } = await supabase.from("mock_class_assignments").delete().eq("id", assignmentId);
    if (error) throw error;
    pageCache.invalidate(`classMockAssignments:${classId}`);
};

export type ClassStudentMockAssignment = {
    id: string;
    mockTestId: string;
    title: string;
    durationMinutes: number;
    studentId: string;
    studentName: string;
    completed: boolean;
};

// Individual (per-student) assignments, as opposed to fetchClassMockAssignments'
// whole-class ones — the two are separate tables (mock_student_assignments vs
// mock_class_assignments) and the class page shows them as two separate lists.
export const fetchClassStudentMockAssignments = async (classId: string): Promise<ClassStudentMockAssignment[]> => {
    return pageCache.fetch(`classStudentMockAssignments:${classId}`, async () => {
        const { data: members } = await supabase.from("class_members").select("student_id").eq("class_id", classId);
        const studentIds = (members || []).map((m) => m.student_id as string);
        if (studentIds.length === 0) return [];

        const { data: assignments } = await supabase
            .from("mock_student_assignments")
            .select("id, mock_test_id, student_id")
            .in("student_id", studentIds);
        if (!assignments || assignments.length === 0) return [];

        const mockTestIds = Array.from(new Set(assignments.map((a) => a.mock_test_id as string)));
        const [{ data: tests }, { data: students }, { data: results }] = await Promise.all([
            supabase.from("mock_tests").select("id, title, duration_minutes").in("id", mockTestIds),
            supabase.from("users").select("id, name, surname").in("id", studentIds),
            supabase.from("mock_results").select("mock_test_id, user_id").in("mock_test_id", mockTestIds).in("user_id", studentIds),
        ]);
        const testMap = new Map((tests || []).map((t) => [t.id as string, t]));
        const studentMap = new Map((students || []).map((s) => [s.id as string, s]));
        const completedSet = new Set((results || []).map((r) => `${r.mock_test_id}:${r.user_id}`));

        return assignments
            .map((a) => {
                const test = testMap.get(a.mock_test_id as string);
                const student = studentMap.get(a.student_id as string);
                return {
                    id: a.id as string,
                    mockTestId: a.mock_test_id as string,
                    title: (test?.title as string) || "—",
                    durationMinutes: (test?.duration_minutes as number) || 0,
                    studentId: a.student_id as string,
                    studentName: student ? `${student.name} ${student.surname || ""}`.trim() : "—",
                    completed: completedSet.has(`${a.mock_test_id}:${a.student_id}`),
                };
            })
            .sort((a, b) => a.title.localeCompare(b.title) || a.studentName.localeCompare(b.studentName));
    }, TEACHER_CACHE_TTL);
};

export const unassignMockFromStudent = async (assignmentId: string, classId: string): Promise<void> => {
    const { error } = await supabase.from("mock_student_assignments").delete().eq("id", assignmentId);
    if (error) throw error;
    pageCache.invalidate(`classStudentMockAssignments:${classId}`);
};

export type TeacherMockAssignmentSummary = {
    classes: { id: string; name: string }[];
    students: { id: string; name: string }[];
    // Union of every student reachable by this test (class members of any
    // assigned class, plus anyone assigned individually) and how many of
    // them already have a result — lets a teacher see "all done" before
    // deciding to close the mock (see closed_at, 048_manual_mock_close.sql).
    completedCount: number;
    totalCount: number;
};

// Cross-class assignment overview for a teacher's own tests — used by the
// teacher's "Mock-тесты" catalog view, which shows who a test is assigned
// to instead of a student-style locked/available/completed status (a
// teacher doesn't "unlock" or "pass" their own tests).
export const fetchTeacherMockAssignmentsSummary = async (
    teacherId: string,
    mockTestIds: string[]
): Promise<Record<string, TeacherMockAssignmentSummary>> => {
    const summary: Record<string, TeacherMockAssignmentSummary> = {};
    mockTestIds.forEach((id) => { summary[id] = { classes: [], students: [], completedCount: 0, totalCount: 0 }; });
    if (mockTestIds.length === 0) return summary;

    const [{ data: classAssignments }, { data: studentAssignments }] = await Promise.all([
        supabase.from("mock_class_assignments").select("mock_test_id, class_id").in("mock_test_id", mockTestIds),
        supabase.from("mock_student_assignments").select("mock_test_id, student_id").eq("assigned_by", teacherId).in("mock_test_id", mockTestIds),
    ]);

    const classIds = Array.from(new Set((classAssignments || []).map((a) => a.class_id as string)));
    const [{ data: classes }, { data: classMembers }] = await Promise.all([
        classIds.length ? supabase.from("classes").select("id, name").in("id", classIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        classIds.length ? supabase.from("class_members").select("class_id, student_id").in("class_id", classIds) : Promise.resolve({ data: [] as { class_id: string; student_id: string }[] }),
    ]);
    const classMap = new Map((classes || []).map((c) => [c.id as string, c.name as string]));
    const memberIdsByClass = new Map<string, string[]>();
    (classMembers || []).forEach((m) => {
        const list = memberIdsByClass.get(m.class_id as string) || [];
        list.push(m.student_id as string);
        memberIdsByClass.set(m.class_id as string, list);
    });

    const individualStudentIds = Array.from(new Set((studentAssignments || []).map((a) => a.student_id as string)));
    const { data: students } = individualStudentIds.length
        ? await supabase.from("users").select("id, name, surname").in("id", individualStudentIds)
        : { data: [] as { id: string; name: string; surname: string | null }[] };
    const studentMap = new Map((students || []).map((s) => [s.id as string, `${s.name} ${s.surname || ""}`.trim()]));

    const involvedByTest = new Map<string, Set<string>>();
    const addInvolved = (testId: string, studentId: string) => {
        const set = involvedByTest.get(testId) || new Set<string>();
        set.add(studentId);
        involvedByTest.set(testId, set);
    };

    (classAssignments || []).forEach((a) => {
        const testId = a.mock_test_id as string;
        const entry = summary[testId];
        if (entry) entry.classes.push({ id: a.class_id as string, name: classMap.get(a.class_id as string) || "—" });
        (memberIdsByClass.get(a.class_id as string) || []).forEach((studentId) => addInvolved(testId, studentId));
    });
    (studentAssignments || []).forEach((a) => {
        const testId = a.mock_test_id as string;
        const entry = summary[testId];
        if (entry) entry.students.push({ id: a.student_id as string, name: studentMap.get(a.student_id as string) || "—" });
        addInvolved(testId, a.student_id as string);
    });

    const allInvolvedIds = Array.from(new Set(Array.from(involvedByTest.values()).flatMap((set) => Array.from(set))));
    const { data: results } = allInvolvedIds.length
        ? await supabase.from("mock_results").select("user_id, mock_test_id").in("mock_test_id", mockTestIds).in("user_id", allInvolvedIds)
        : { data: [] as { user_id: string; mock_test_id: string }[] };
    const completedByTest = new Map<string, Set<string>>();
    (results || []).forEach((r) => {
        const set = completedByTest.get(r.mock_test_id as string) || new Set<string>();
        set.add(r.user_id as string);
        completedByTest.set(r.mock_test_id as string, set);
    });

    mockTestIds.forEach((testId) => {
        const involved = involvedByTest.get(testId) || new Set<string>();
        const completed = completedByTest.get(testId) || new Set<string>();
        summary[testId].totalCount = involved.size;
        summary[testId].completedCount = Array.from(involved).filter((id) => completed.has(id)).length;
    });

    return summary;
};

export type AssignablePlacementTest = { id: string; title: string };

export const fetchAssignablePlacementTests = async (): Promise<AssignablePlacementTest[]> => {
    const { data } = await supabase.from("placement_tests").select("id, title").order("created_at", { ascending: false });
    return (data || []) as AssignablePlacementTest[];
};

// Tests already assigned to this student that aren't finished yet — used to
// hide them from the "assign" picker so a teacher can't stack a second
// active assignment for the same test (same rule the admin picker follows).
export const fetchStudentActivePlacementTestIds = async (studentId: string): Promise<Set<string>> => {
    const { data } = await supabase.from("placement_assignments").select("test_id, status").eq("user_id", studentId);
    return new Set((data || []).filter((a) => a.status !== "completed").map((a) => a.test_id as string));
};

// Backed by reassign_placement_test (044_reassign_placement_test.sql): a
// brand-new student gets a fresh assignment row; a student who already has
// one for this test (including a completed one — that's the retake case)
// gets that same row reset instead, since placement_assignments now has a
// UNIQUE (user_id, test_id) constraint. Needs SECURITY DEFINER because
// placement_assignments/placement_results have no teacher UPDATE/DELETE RLS
// policy, only INSERT/SELECT.
export const assignPlacementToStudent = async (test: AssignablePlacementTest, studentId: string): Promise<void> => {
    const { error } = await supabase.rpc("reassign_placement_test", {
        p_test_id: test.id,
        p_student_id: studentId,
        p_test_title: test.title,
    });
    if (error) throw error;
};

export type StudentMockResult = {
    student: User;
    resultId: string | null;
    score: number | null;
    maxScore: number | null;
    accuracy: number | null;
    correctAnswers: number | null;
    totalQuestions: number | null;
    completedAt: string | null;
    // Official CEFR scoring — only populated for English mocks (see
    // src/lib/english-cefr.ts) — null for every other subject.
    cefrBand: string | null;
    cefrScore: number | null;
    // Балл по модели Раша, шкала 0-75 — ГЛАВНЫЙ балл мока (см. «Две шкалы 75»
    // в design/FIX.md). null, пока когорта слишком мала, чтобы было с чем
    // стандартизовать; тогда показываем не подставную середину, а заглушку.
    levelScore: number | null;
    // Максимум шкалы, в которой записан levelScore: 100 у общеобразовательных,
    // 75 у иностранных языков. На экране не показывается — нужен для раскраски.
    levelScoreMax: number | null;
    // Generic A+..C level (src/lib/mock-grade-level.ts) — populated for
    // every subject once a real cohort exists to standardize against.
    gradeLevel: string | null;
    // Essay/writing questions still awaiting a teacher's manual grade
    // (review_status 'pending' or 'ai_graded' — the latter still needs a
    // human to confirm/adjust). Surfaced so a teacher can find who needs
    // grading without opening every student's answer panel one by one.
    pendingReviewCount: number;
};

export type ClassMockResultsSummary = {
    mockTitle: string;
    students: StudentMockResult[];
    completedCount: number;
    totalCount: number;
    // Points-based (same scale as each student's score/maxScore), matching
    // the "score/max" convention used everywhere else results are shown —
    // see student-class-detail.tsx and mock/[id]/page.tsx.
    mockMaxScore: number | null;
    avgScore: number | null;
    topScore: number | null;
    lowScore: number | null;
    pendingReviewCount: number;
};

// Все, кто сдавал этот тест, независимо от класса. Нужно для админских моков
// (type 'paid'/'free'): их проходят ученики, ни в какой класс не входящие,
// поэтому список участников неоткуда взять — только из самих результатов.
export const fetchMockTakers = async (mockTestId: string): Promise<User[]> => {
    const { data: results } = await supabase
        .from("mock_results")
        .select("user_id")
        .eq("mock_test_id", mockTestId);
    const ids = Array.from(new Set((results || []).map((r) => r.user_id as string)));
    if (ids.length === 0) return [];
    const { data: users } = await fetchAllRows<Record<string, unknown>>((from, to) =>
        supabase.from("users").select("*").in("id", ids).order("id").range(from, to));
    return (users || []).map(toUser);
};

// classId = null — режим «весь тест», для админского мока без класса.
export const fetchClassMockResults = async (classId: string | null, mockTestId: string): Promise<ClassMockResultsSummary> => {
    const [members, { data: test }, { data: results }] = await Promise.all([
        classId ? fetchClassMembers(classId) : fetchMockTakers(mockTestId),
        supabase.from("mock_tests").select("title").eq("id", mockTestId).single(),
        supabase.from("mock_results").select("id, user_id, score, max_score, accuracy, correct_answers, total_questions, cefr_band, cefr_score, level_score, level_score_max, grade_level, completed_at").eq("mock_test_id", mockTestId),
    ]);

    const resultIds = (results || []).map((r) => r.id as string);
    // Постранично: строк здесь takers × заданий с ручной проверкой, и на
    // большой группе PostgREST обрезал бы ответ молча. Занижение тут особенно
    // скверное — учитель видит «проверять нечего», непроверенные эссе остаются
    // с нулём баллов, и он жмёт «Готово», что необратимо.
    const { data: pendingRows } = resultIds.length > 0
        ? await fetchAllRows<{ result_id: string }>((from, to) =>
            supabase
                .from("mock_answer_details")
                .select("result_id")
                .in("result_id", resultIds)
                .in("review_status", ["pending", "ai_graded"])
                .order("id")
                .range(from, to))
        : { data: [] as Array<{ result_id: string }> };
    const pendingCountByResult = new Map<string, number>();
    (pendingRows || []).forEach((row) => {
        const id = row.result_id as string;
        pendingCountByResult.set(id, (pendingCountByResult.get(id) || 0) + 1);
    });

    const resultByStudent = new Map((results || []).map((r) => [r.user_id as string, r]));
    const students: StudentMockResult[] = members
        .map((student) => {
            const r = resultByStudent.get(student.id);
            return {
                student,
                resultId: r ? (r.id as string) : null,
                score: r ? (r.score as number) : null,
                maxScore: r ? (r.max_score as number) : null,
                accuracy: r ? (r.accuracy as number) : null,
                correctAnswers: r ? (r.correct_answers as number) : null,
                totalQuestions: r ? (r.total_questions as number) : null,
                cefrBand: r ? (r.cefr_band as string | null) : null,
                cefrScore: r && r.cefr_score !== null ? (r.cefr_score as number) : null,
                levelScore: r && r.level_score !== null ? Number(r.level_score) : null,
                levelScoreMax: r && r.level_score_max !== null && r.level_score_max !== undefined ? Number(r.level_score_max) : null,
                gradeLevel: r ? (r.grade_level as string | null) : null,
                completedAt: r ? (r.completed_at as string) : null,
                pendingReviewCount: r ? (pendingCountByResult.get(r.id as string) || 0) : 0,
            };
        })
        // Сортируем и считаем сводку по Rasch-баллу — это то число, которое
        // видит учитель.
        //
        // Подстановки `?? s.score` здесь быть не должно, хотя она и выглядит
        // безобидной страховкой. Сырой балл живёт в другой шкале: у теста
        // «ona tili p» это 36.5 из 100, а плитки подписаны «/75», и в них
        // выходило «37/75». На группе, где у части учеников балл посчитан, а у
        // части нет, среднее вообще складывало числа из двух разных шкал.
        .sort((a, b) => (b.levelScore ?? -1) - (a.levelScore ?? -1));

    const scores = students.map((s) => s.levelScore).filter((s): s is number => s !== null);
    const mockMaxScore = students.find((s) => s.maxScore !== null)?.maxScore ?? null;

    return {
        mockTitle: test?.title || "—",
        students,
        // Именно «сдали», а не «посчитан балл». Раньше сюда шло scores.length и
        // совпадало случайно — сырой балл был у всех, у кого есть результат.
        // Теперь scores содержит только Rasch-баллы, и на неопубликованном моке
        // плитка показала бы «сдали 0», пока работы лежат несданными.
        completedCount: students.filter((s) => s.completedAt !== null).length,
        totalCount: members.length,
        mockMaxScore,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        topScore: scores.length > 0 ? Math.max(...scores) : null,
        lowScore: scores.length > 0 ? Math.min(...scores) : null,
        pendingReviewCount: students.reduce((sum, s) => sum + s.pendingReviewCount, 0),
    };
};

export type StudentClassSummary = { id: string; name: string; teacherName: string };

// A student's own read-only view of the classes they belong to — powers the
// student-facing "Классы" nav item (#18). Relies on the narrow
// users_student_read_own_teacher policy (035_student_read_own_teacher.sql)
// to resolve the teacher's display name.
export const fetchStudentClasses = async (studentId: string): Promise<StudentClassSummary[]> => {
    // Deliberately its own cache key, distinct from profile-utils.ts's
    // fetchStudentClasses (`studentClasses:${studentId}`) — that one returns
    // a different shape (Class[], no teacherName) and used to collide on
    // the same key, so whichever of the two fetched first "poisoned" the
    // other's read for the rest of that cache entry's TTL.
    return pageCache.fetch(`studentClassesSummary:${studentId}`, async () => {
        const { data: memberships } = await supabase.from("class_members").select("class_id").eq("student_id", studentId);
        const classIds = Array.from(new Set((memberships || []).map((m) => m.class_id as string)));
        if (classIds.length === 0) return [];

        const { data: classes } = await supabase.from("classes").select("*").in("id", classIds).order("created_at", { ascending: false });
        const classRows = (classes || []) as Array<Record<string, unknown>>;
        const teacherIds = Array.from(new Set(classRows.map((c) => c.teacher_id as string)));
        const { data: teachers } = teacherIds.length > 0
            ? await supabase.from("users").select("id, name, surname").in("id", teacherIds)
            : { data: [] as Array<{ id: string; name: string; surname: string | null }> };
        const teacherMap = new Map((teachers || []).map((u) => [u.id as string, `${u.name} ${u.surname || ""}`.trim()]));

        return classRows.map((c) => ({
            id: c.id as string,
            name: c.name as string,
            teacherName: teacherMap.get(c.teacher_id as string) || "—",
        }));
    }, TEACHER_CACHE_TTL);
};

export type StudentClassMock = {
    mockTestId: string;
    title: string;
    durationMinutes: number;
    price: number;
    myResult: { score: number; maxScore: number; accuracy: number; levelScore: number | null; levelScoreMax: number | null; gradeLevel: string | null; revealed: boolean } | null;
};

// Every mock assigned to this class (whole-class or individually to this
// student) together with the student's own result, if any — deliberately
// does NOT surface classmates' completion counts, since a student session's
// RLS view of class_members is limited to their own row (class_members_student_read_own),
// so any class-wide count computed client-side here would silently undercount.
export const fetchStudentClassMocks = async (classId: string, studentId: string): Promise<StudentClassMock[]> => {
    const [{ data: classAssignments }, { data: individualAssignments }] = await Promise.all([
        supabase.from("mock_class_assignments").select("mock_test_id").eq("class_id", classId),
        supabase.from("mock_student_assignments").select("mock_test_id").eq("student_id", studentId),
    ]);
    const mockTestIds = Array.from(new Set([
        ...(classAssignments || []).map((a) => a.mock_test_id as string),
        ...(individualAssignments || []).map((a) => a.mock_test_id as string),
    ]));
    if (mockTestIds.length === 0) return [];

    const [{ data: tests }, { data: results }] = await Promise.all([
        supabase.from("mock_tests").select("id, title, duration_minutes, price").in("id", mockTestIds),
        supabase.from("mock_results").select("mock_test_id, score, max_score, accuracy, level_score, level_score_max, grade_level, revealed_at").eq("user_id", studentId).in("mock_test_id", mockTestIds),
    ]);
    const resultMap = new Map((results || []).map((r) => [r.mock_test_id as string, r]));

    return ((tests || []) as Array<Record<string, unknown>>).map((test) => {
        const r = resultMap.get(test.id as string) as Record<string, unknown> | undefined;
        return {
            mockTestId: test.id as string,
            title: test.title as string,
            durationMinutes: (test.duration_minutes as number) || 0,
            price: (test.price as number) || 0,
            // A row existing here just means "submitted" — score/gradeLevel
            // must stay hidden until the teacher/admin finalizes a
            // class-assigned mock (revealed_at IS NULL until then, same gate
            // as results/page.tsx and mock/[id]/page.tsx).
            myResult: r ? {
                score: r.score as number,
                maxScore: r.max_score as number,
                accuracy: r.accuracy as number,
                levelScore: r.level_score !== null && r.level_score !== undefined ? Number(r.level_score) : null,
                levelScoreMax: r.level_score_max !== null && r.level_score_max !== undefined ? Number(r.level_score_max) : null,
                gradeLevel: (r.grade_level as string | null) ?? null,
                revealed: Boolean(r.revealed_at),
            } : null,
        };
    });
};

export type SubjectRanking = {
    subjectId: string;
    myAvgAccuracy: number;
    myAttempts: number;
    myRank: number;
    totalStudents: number;
};

// #23 — wraps the get_my_class_subject_ranking RPC (037_student_subject_ranking.sql),
// which computes the ranking server-side and returns only the calling
// student's own place in it, never a classmate's row.
export const fetchMySubjectRanking = async (classId: string): Promise<SubjectRanking[]> => {
    const { data, error } = await supabase.rpc("get_my_class_subject_ranking", { p_class_id: classId });
    if (error) {
        console.error("[class-utils] fetchMySubjectRanking:", error);
        return [];
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        subjectId: row.subject_id as string,
        myAvgAccuracy: Number(row.my_avg_accuracy),
        myAttempts: row.my_attempts as number,
        myRank: row.my_rank as number,
        totalStudents: row.total_students as number,
    }));
};

export type QuestionErrorStat = {
    questionId: string;
    questionText: string;
    wrongCount: number;
    totalCount: number;
    wrongRate: number;
};

// Cross-student aggregation for one class's attempt at one mock: how many of
// the class's students got each question wrong, ranked worst-first. Powers
// the "hardest question" ranking on the class-mock results page (#24) — a
// natural extension of the per-student breakdown already shown there.
export const fetchMockQuestionErrorStats = async (classId: string | null, mockTestId: string): Promise<QuestionErrorStat[]> => {
    // classId = null — считаем по всем сдававшим (админский мок без класса).
    let query = supabase.from("mock_results").select("id").eq("mock_test_id", mockTestId);
    if (classId) {
        const members = await fetchClassMembers(classId);
        if (members.length === 0) return [];
        query = query.in("user_id", members.map((m) => m.id));
    }
    const { data: results } = await query;
    const resultIds = (results || []).map((r) => r.id as string);
    if (resultIds.length === 0) return [];

    // Постранично: 15 учеников × 71 вопрос уже превышают одну страницу. При
    // усечении доли ошибок считались неверно, а вопросы, чьи строки обрезались
    // целиком, вообще исчезали из рейтинга — учитель разбирал не ту тему.
    const { data: details } = await fetchAllRows<{ question_id: string | null; question_text: string; is_correct: boolean }>(
        (from, to) => supabase
            .from("mock_answer_details")
            .select("question_id, question_text, is_correct")
            .in("result_id", resultIds)
            .order("id")
            .range(from, to)
    );

    const byQuestion = new Map<string, { questionText: string; wrong: number; total: number }>();
    (details || []).forEach((d) => {
        const questionId = d.question_id as string | null;
        if (!questionId) return;
        const entry = byQuestion.get(questionId) || { questionText: d.question_text as string, wrong: 0, total: 0 };
        entry.total += 1;
        if (!d.is_correct) entry.wrong += 1;
        byQuestion.set(questionId, entry);
    });

    return Array.from(byQuestion.entries())
        .map(([questionId, { questionText, wrong, total }]) => ({
            questionId,
            questionText,
            wrongCount: wrong,
            totalCount: total,
            wrongRate: total > 0 ? Math.round((wrong / total) * 100) : 0,
        }))
        .sort((a, b) => b.wrongRate - a.wrongRate);
};

export type MockAnswerDetail = {
    id: string;
    questionText: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    pointsEarned: number;
    maxPoints: number;
    reviewStatus: "auto_graded" | "pending" | "reviewed" | "ai_graded";
    reviewFeedback?: string | null;
};

export const fetchMockAnswerDetails = async (resultId: string): Promise<MockAnswerDetail[]> => {
    const { data } = await supabase
        .from("mock_answer_details")
        .select("id, question_id, question_text, selected_answer, correct_answer, is_correct, points_earned, max_points, review_status, review_feedback")
        .eq("result_id", resultId);
    const rows = data || [];

    // Текст рубрики здесь больше не грузится: он занимал полэкрана над полем
    // балла и мешал проставлять оценки быстро, поэтому убран с экрана. Это
    // экономит ещё и запрос к mock_questions на каждое раскрытие ученика.
    // Автопроверке эссе рубрика по-прежнему нужна — она берёт её сама, своим
    // запросом в /api/mock-tests/[id]/grade-essays.
    return rows.map((d) => ({
        id: d.id as string,
        questionText: d.question_text as string,
        // В базе оба поля лежат в служебном виде: правильный ответ — JSON
        // ключа проверки ({"values": ["a"], "accepted": []}), а неотвеченный
        // вопрос — строка "null". Учитель видел это дословно.
        selectedAnswer: formatStudentAnswer(d.selected_answer as string | null),
        correctAnswer: formatCorrectAnswer(d.correct_answer as string | null),
        isCorrect: d.is_correct as boolean,
        pointsEarned: d.points_earned as number,
        maxPoints: (d.max_points as number) ?? 1,
        reviewStatus: d.review_status as MockAnswerDetail["reviewStatus"],
        reviewFeedback: d.review_feedback as string | null,
    }));
};

// --- Teacher-facing results drill-down: classes -> students -> attempts ---

export type ClassStudentOverview = {
    student: User;
    attemptCount: number;
    avgAccuracy: number | null;
    bestAccuracy: number | null;
};

export const fetchClassStudentsOverview = async (classId: string): Promise<ClassStudentOverview[]> => {
    return pageCache.fetch(`classStudentsOverview:${classId}`, async () => {
        const members = await fetchClassMembers(classId);
        if (members.length === 0) return [];
        const { data: results } = await supabase
            .from("mock_results")
            .select("user_id, accuracy")
            .in("user_id", members.map((m) => m.id));
        const byStudent = new Map<string, number[]>();
        (results || []).forEach((r) => {
            const list = byStudent.get(r.user_id as string) || [];
            list.push(r.accuracy as number);
            byStudent.set(r.user_id as string, list);
        });
        return members
            .map((student) => {
                const scores = byStudent.get(student.id) || [];
                return {
                    student,
                    attemptCount: scores.length,
                    avgAccuracy: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
                    bestAccuracy: scores.length ? Math.max(...scores) : null,
                };
            })
            .sort((a, b) => (b.avgAccuracy ?? -1) - (a.avgAccuracy ?? -1));
    }, TEACHER_CACHE_TTL);
};

export type StudentMockScore = {
    mockTestId: string;
    title: string;
    // Тот же номер, что в списке назначений — чтобы «Тарих №2» у ученика и в
    // фильтре группы означали один и тот же тест.
    seq: number | null;
    // Балл по модели Раша, 0-75 — то же число, что видит сам ученик. null,
    // пока сдавших слишком мало для стандартизации.
    levelScore: number | null;
    levelScoreMax: number | null;
    gradeLevel: string | null;
    completedAt: string;
    revealed: boolean;
};

// Балл каждого ученика группы по КАЖДОМУ моку, который он сдавал — то, чего не
// хватало на странице группы: там был только общий рейтинг, а посмотреть
// отдельный мок ученика было негде (§9 в design/FIX.md).
//
// Один батч-запрос на всю группу, а не запрос на ученика: группа в 30 человек
// иначе давала бы 30 круговых обращений при каждом открытии страницы.
export const fetchClassStudentMockScores = async (classId: string): Promise<Map<string, StudentMockScore[]>> => {
    return pageCache.fetch(`classStudentMockScores:${classId}`, async () => {
        const members = await fetchClassMembers(classId);
        if (members.length === 0) return new Map<string, StudentMockScore[]>();
        const studentIds = members.map((m) => m.id);

        const { data: results } = await fetchAllRows<{
            user_id: string; mock_test_id: string; mock_test_title: string;
            level_score: number | null; level_score_max: number | null; grade_level: string | null;
            completed_at: string; revealed_at: string | null;
        }>((from, to) =>
            supabase.from("mock_results")
                .select("user_id, mock_test_id, mock_test_title, level_score, level_score_max, grade_level, completed_at, revealed_at")
                .in("user_id", studentIds).order("id").range(from, to));

        const numbers = await fetchMockNumbers(
            Array.from(new Set((results || []).map((r) => r.mock_test_id)))
        );

        const byStudent = new Map<string, StudentMockScore[]>();
        (results || []).forEach((r) => {
            const list = byStudent.get(r.user_id) || [];
            list.push({
                mockTestId: r.mock_test_id,
                title: r.mock_test_title,
                seq: numbers.get(r.mock_test_id) ?? null,
                levelScore: r.level_score !== null ? Number(r.level_score) : null,
                levelScoreMax: r.level_score_max !== null && r.level_score_max !== undefined ? Number(r.level_score_max) : null,
                gradeLevel: r.grade_level,
                completedAt: r.completed_at,
                revealed: Boolean(r.revealed_at),
            });
            byStudent.set(r.user_id, list);
        });
        for (const list of Array.from(byStudent.values())) {
            list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
        }
        return byStudent;
    }, TEACHER_CACHE_TTL);
};

export type TeacherClassSummary = ClassWithCount & { avgAccuracy: number | null; attemptCount: number };
export type TeacherTopStudent = { student: User; className: string; avgAccuracy: number; attemptCount: number };
export type TeacherResultsOverview = {
    classes: TeacherClassSummary[];
    topClass: TeacherClassSummary | null;
    topStudent: TeacherTopStudent | null;
    // Средний результат всех учеников учителя по всем их мокам, в процентах —
    // агрегат по разным тестам, поэтому именно доля от максимума, а не баллы
    // (см. «Правило отображения баллов» в design/FIX.md). Показывается на
    // главной учителя.
    overallAvgAccuracy: number | null;
    overallAttemptCount: number;
};

// One pass across every class the teacher owns: per-class average accuracy
// (mean of every completed attempt by that class's students) plus whichever
// single student has the highest average across their own attempts — powers
// the "Топ класс" / "Топ ученик" cards on the teacher results page.
export const fetchTeacherResultsOverview = async (teacherId: string): Promise<TeacherResultsOverview> => {
    return pageCache.fetch(`teacherResultsOverview:${teacherId}`, async () => {
        const classes = await fetchTeacherClasses(teacherId);
        if (classes.length === 0) return { classes: [], topClass: null, topStudent: null, overallAvgAccuracy: null, overallAttemptCount: 0 };

        const { data: memberships } = await supabase
            .from("class_members")
            .select("class_id, student_id")
            .in("class_id", classes.map((c) => c.id));
        const studentIds = Array.from(new Set((memberships || []).map((m) => m.student_id as string)));
        if (studentIds.length === 0) {
            return { classes: classes.map((c) => ({ ...c, avgAccuracy: null, attemptCount: 0 })), topClass: null, topStudent: null, overallAvgAccuracy: null, overallAttemptCount: 0 };
        }

        // Через fetchAllRows: PostgREST молча обрезает выборку по max_rows, и
        // без пагинации средний балл у большого учителя считался бы по куску
        // результатов, без единой ошибки. revealed_at — чтобы в среднее не
        // попадали ещё не опубликованные попытки.
        const [{ data: results }, { data: users }] = await Promise.all([
            fetchAllRows<{ user_id: string; accuracy: number }>((from, to) =>
                supabase.from("mock_results").select("user_id, accuracy")
                    .in("user_id", studentIds).not("revealed_at", "is", null).order("id").range(from, to)),
            supabase.from("users").select("*").in("id", studentIds),
        ]);
        const userMap = new Map((users || []).map((u) => [u.id as string, toUser(u)]));
        const studentScores = new Map<string, number[]>();
        (results || []).forEach((r) => {
            const list = studentScores.get(r.user_id as string) || [];
            list.push(r.accuracy as number);
            studentScores.set(r.user_id as string, list);
        });

        const classStudentIds = new Map<string, string[]>();
        (memberships || []).forEach((m) => {
            const list = classStudentIds.get(m.class_id as string) || [];
            list.push(m.student_id as string);
            classStudentIds.set(m.class_id as string, list);
        });

        const classSummaries: TeacherClassSummary[] = classes.map((cls) => {
            const ids = classStudentIds.get(cls.id) || [];
            const scores = ids.flatMap((id) => studentScores.get(id) || []);
            return {
                ...cls,
                attemptCount: scores.length,
                avgAccuracy: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
            };
        });

        const topClass = classSummaries
            .filter((c): c is TeacherClassSummary & { avgAccuracy: number } => c.avgAccuracy !== null)
            .sort((a, b) => b.avgAccuracy - a.avgAccuracy)[0] || null;

        let topStudent: TeacherTopStudent | null = null;
        for (const [studentId, scores] of Array.from(studentScores.entries())) {
            if (scores.length === 0) continue;
            const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            if (!topStudent || avg > topStudent.avgAccuracy) {
                const student = userMap.get(studentId);
                if (!student) continue;
                const classId = Array.from(classStudentIds.entries()).find(([, ids]) => ids.includes(studentId))?.[0];
                const className = classes.find((c) => c.id === classId)?.name || "—";
                topStudent = { student, className, avgAccuracy: avg, attemptCount: scores.length };
            }
        }

        const allScores = (results || []).map((r) => r.accuracy as number);
        const overallAvgAccuracy = allScores.length
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : null;

        return { classes: classSummaries, topClass, topStudent, overallAvgAccuracy, overallAttemptCount: allScores.length };
    }, TEACHER_CACHE_TTL);
};

export type AdminClassSummary = ClassWithCount & { teacherName: string; avgAccuracy: number | null; attemptCount: number };

// Same average-accuracy math as fetchTeacherResultsOverview, but across every
// class on the platform (not scoped to one teacher) — powers the admin
// classes list and its avgAccuracy badge (#19 for the admin role).
export const fetchAdminClassesOverview = async (): Promise<AdminClassSummary[]> => {
    return pageCache.fetch("adminClassesOverview", async () => {
        const { data: classes } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
        const classRows = (classes || []) as Array<Record<string, unknown>>;
        if (classRows.length === 0) return [];

        const classIds = classRows.map((c) => c.id as string);
        const teacherIds = Array.from(new Set(classRows.map((c) => c.teacher_id as string)));

        const [{ data: teachers }, { data: members }] = await Promise.all([
            supabase.from("users").select("id, name, surname").in("id", teacherIds),
            supabase.from("class_members").select("class_id, student_id").in("class_id", classIds),
        ]);
        const teacherMap = new Map((teachers || []).map((u) => [u.id as string, `${u.name} ${u.surname || ""}`.trim()]));

        const studentIds = Array.from(new Set((members || []).map((m) => m.student_id as string)));
        const { data: results } = studentIds.length > 0
            ? await supabase.from("mock_results").select("user_id, accuracy").in("user_id", studentIds)
            : { data: [] as Array<{ user_id: string; accuracy: number }> };

        const scoresByStudent = new Map<string, number[]>();
        (results || []).forEach((r) => {
            const list = scoresByStudent.get(r.user_id as string) || [];
            list.push(r.accuracy as number);
            scoresByStudent.set(r.user_id as string, list);
        });

        const studentsByClass = new Map<string, string[]>();
        (members || []).forEach((m) => {
            const list = studentsByClass.get(m.class_id as string) || [];
            list.push(m.student_id as string);
            studentsByClass.set(m.class_id as string, list);
        });

        return classRows.map((c) => {
            const ids = studentsByClass.get(c.id as string) || [];
            const scores = ids.flatMap((id) => scoresByStudent.get(id) || []);
            return {
                ...toClass(c),
                memberCount: ids.length,
                teacherName: teacherMap.get(c.teacher_id as string) || "—",
                attemptCount: scores.length,
                avgAccuracy: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
            };
        });
    }, TEACHER_CACHE_TTL);
};

export type AdminTeacherOverview = {
    teacherId: string;
    classCount: number;
    studentCount: number;
    attemptCount: number;
    avgAccuracy: number | null;
};

// Та же арифметика, что в fetchAdminClassesOverview, но сгруппированная по
// учителю, а не по группе — для колонки «Средний скор» в /admin/teachers, где
// до этого было только количество групп.
//
// Средний в процентах, а не в баллах: у учителя обычно несколько тестов с
// разной суммой баллов, и складывать их сырые баллы бессмысленно
// (design/FIX.md, «Правило отображения баллов»).
export const fetchAdminTeachersOverview = async (): Promise<Map<string, AdminTeacherOverview>> => {
    return pageCache.fetch("adminTeachersOverview", async () => {
        const { data: classes } = await supabase.from("classes").select("id, teacher_id");
        const classRows = (classes || []) as Array<{ id: string; teacher_id: string }>;
        if (classRows.length === 0) return new Map<string, AdminTeacherOverview>();

        const { data: members } = await supabase
            .from("class_members")
            .select("class_id, student_id")
            .in("class_id", classRows.map((c) => c.id));
        const memberRows = (members || []) as Array<{ class_id: string; student_id: string }>;
        const studentIds = Array.from(new Set(memberRows.map((m) => m.student_id)));

        // Пагинация обязательна: PostgREST обрезает выборку по max_rows молча,
        // без ошибки, и на большой платформе средний считался бы по случайному
        // куску результатов.
        const { data: results } = studentIds.length > 0
            ? await fetchAllRows<{ user_id: string; accuracy: number }>((from, to) =>
                supabase.from("mock_results").select("user_id, accuracy")
                    .in("user_id", studentIds).not("revealed_at", "is", null).order("id").range(from, to))
            : { data: [] as Array<{ user_id: string; accuracy: number }> };

        const scoresByStudent = new Map<string, number[]>();
        (results || []).forEach((r) => {
            const list = scoresByStudent.get(r.user_id) || [];
            list.push(r.accuracy);
            scoresByStudent.set(r.user_id, list);
        });

        const studentsByClass = new Map<string, string[]>();
        memberRows.forEach((m) => {
            const list = studentsByClass.get(m.class_id) || [];
            list.push(m.student_id);
            studentsByClass.set(m.class_id, list);
        });

        const overview = new Map<string, AdminTeacherOverview>();
        for (const cls of classRows) {
            const entry = overview.get(cls.teacher_id) || {
                teacherId: cls.teacher_id, classCount: 0, studentCount: 0, attemptCount: 0, avgAccuracy: null,
            };
            entry.classCount += 1;
            overview.set(cls.teacher_id, entry);
        }
        // Ученик может состоять в двух группах одного учителя — тогда его
        // результаты попали бы в средний дважды. Считаем по уникальным ученикам.
        const studentsByTeacher = new Map<string, Set<string>>();
        for (const cls of classRows) {
            const set = studentsByTeacher.get(cls.teacher_id) || new Set<string>();
            (studentsByClass.get(cls.id) || []).forEach((id) => set.add(id));
            studentsByTeacher.set(cls.teacher_id, set);
        }
        for (const [teacherId, students] of Array.from(studentsByTeacher.entries())) {
            const entry = overview.get(teacherId);
            if (!entry) continue;
            const scores = Array.from(students).flatMap((id) => scoresByStudent.get(id) || []);
            entry.studentCount = students.size;
            entry.attemptCount = scores.length;
            entry.avgAccuracy = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        }
        return overview;
    }, TEACHER_CACHE_TTL);
};

// --- Филиалы (§5 в design/FIX.md) ---

export type Branch = { id: string; name: string; createdAt: string };

export type BranchOverview = {
    branchId: string;
    branchName: string;
    classCount: number;
    teacherCount: number;
    studentCount: number;
    // Среднее из средних баллов групп филиала, в процентах — именно так его
    // определил владелец. Это НЕ то же самое, что среднее по всем попыткам:
    // большая группа здесь не перевешивает маленькую.
    avgAccuracy: number | null;
};

// Считается целиком в SQL (get_branch_overview, миграция 072), а не сборкой в
// браузере: клиентская выборка mock_results без пагинации молча обрезается по
// max_rows PostgREST, и средний по платформе считался бы по куску строк.
export const fetchBranchOverview = async (): Promise<BranchOverview[]> => {
    return pageCache.fetch("branchOverview", async () => {
        const { data, error } = await supabase.rpc("get_branch_overview");
        if (error) throw error;
        return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
            branchId: row.branch_id as string,
            branchName: row.branch_name as string,
            classCount: (row.class_count as number) ?? 0,
            teacherCount: (row.teacher_count as number) ?? 0,
            studentCount: (row.student_count as number) ?? 0,
            avgAccuracy: row.avg_accuracy !== null && row.avg_accuracy !== undefined ? Number(row.avg_accuracy) : null,
        }));
    }, TEACHER_CACHE_TTL);
};

export const fetchBranches = async (): Promise<Branch[]> => {
    const { data } = await supabase.from("branches").select("id, name, created_at").order("name");
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        createdAt: row.created_at as string,
    }));
};

export const createBranch = async (name: string): Promise<void> => {
    const { error } = await supabase.from("branches").insert({ name });
    if (error) throw error;
    pageCache.invalidate("branchOverview");
};

export const renameBranch = async (branchId: string, name: string): Promise<void> => {
    const { error } = await supabase.from("branches").update({ name }).eq("id", branchId);
    if (error) throw error;
    pageCache.invalidate("branchOverview");
};

// --- Рейтинг ученика (§7 в design/FIX.md) ---

export type RatingKind = "overall" | "oylik";
export type RatingScope = "class" | "branch" | "platform";

export type MyRating = {
    myRank: number;
    totalStudents: number;
    myAvgAccuracy: number;
    myAttempts: number;
};

// Через RPC, а не выборкой: get_my_rating (миграция 074) считает место на
// сервере и возвращает ТОЛЬКО собственную строку ученика. Чужие баллы наружу
// не уходят — тот же принцип, что у get_my_class_subject_ranking.
export const fetchMyRating = async (kind: RatingKind, scope: RatingScope): Promise<MyRating | null> => {
    const { data, error } = await supabase.rpc("get_my_rating", { p_kind: kind, p_scope: scope });
    if (error) throw error;
    const row = ((data || []) as Array<Record<string, unknown>>)[0];
    if (!row) return null;
    return {
        myRank: Number(row.my_rank),
        totalStudents: Number(row.total_students),
        myAvgAccuracy: Number(row.my_avg_accuracy),
        myAttempts: Number(row.my_attempts),
    };
};


// --- Комплекты «Ойлик тест» (§6 в design/FIX.md) ---

export type OylikSet = {
    id: string;
    title: string;
    createdAt: string;
    publishedAt: string | null;
    tests: Array<{ id: string; title: string; subjectId: string | null; closedAt: string | null; assignedCount: number }>;
};

export const fetchOylikSets = async (): Promise<OylikSet[]> => {
    const { data: sets } = await supabase
        .from("oylik_sets")
        .select("id, title, created_at, published_at")
        .order("created_at", { ascending: false });
    const setRows = (sets || []) as Array<Record<string, unknown>>;
    if (setRows.length === 0) return [];

    const setIds = setRows.map((row) => row.id as string);
    const { data: tests } = await supabase
        .from("mock_tests")
        .select("id, title, subject_id, closed_at, oylik_set_id")
        .in("oylik_set_id", setIds);
    const testRows = (tests || []) as Array<Record<string, unknown>>;

    // Сколько групп получили каждый тест — по нему видно, разослан комплект
    // или ещё нет.
    const { data: assignments } = testRows.length > 0
        ? await supabase.from("mock_class_assignments").select("mock_test_id").in("mock_test_id", testRows.map((r) => r.id as string))
        : { data: [] as Array<{ mock_test_id: string }> };
    const assignedByTest = new Map<string, number>();
    (assignments || []).forEach((row) => {
        const key = row.mock_test_id as string;
        assignedByTest.set(key, (assignedByTest.get(key) || 0) + 1);
    });

    return setRows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        createdAt: row.created_at as string,
        publishedAt: (row.published_at as string | null) ?? null,
        tests: testRows
            .filter((test) => test.oylik_set_id === row.id)
            .map((test) => ({
                id: test.id as string,
                title: test.title as string,
                subjectId: (test.subject_id as string | null) ?? null,
                closedAt: (test.closed_at as string | null) ?? null,
                assignedCount: assignedByTest.get(test.id as string) || 0,
            })),
    }));
};

export const createOylikSet = async (title: string, createdBy: string): Promise<string> => {
    const { data, error } = await supabase.from("oylik_sets").insert({ title, created_by: createdBy }).select("id").single();
    if (error) throw error;
    return data.id as string;
};

// Раздача идёт внутри RPC (publish_oylik_set, миграция 073): назначений может
// быть под сотню, и делать их по одному из браузера значит получить
// полураспределённый комплект при первом обрыве связи.
export const publishOylikSet = async (setId: string): Promise<{ testCount: number; assignedCount: number }> => {
    const { data, error } = await supabase.rpc("publish_oylik_set", { p_set_id: setId });
    if (error) throw error;
    const result = data as { testCount?: number; assignedCount?: number } | null;
    return { testCount: result?.testCount ?? 0, assignedCount: result?.assignedCount ?? 0 };
};

export const closeMockForAllClasses = async (mockTestId: string): Promise<number> => {
    const { data, error } = await supabase.rpc("close_mock_for_all_classes", { p_mock_test_id: mockTestId });
    if (error) throw error;
    return (data as { closedAssignments?: number } | null)?.closedAssignments ?? 0;
};

export type MockClassAssignmentRow = {
    id: string;
    classId: string;
    className: string;
    closedAt: string | null;
};

export const fetchMockClassAssignments = async (mockTestId: string): Promise<MockClassAssignmentRow[]> => {
    const { data } = await supabase
        .from("mock_class_assignments")
        .select("id, class_id, closed_at")
        .eq("mock_test_id", mockTestId);
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];
    const { data: classes } = await supabase.from("classes").select("id, name").in("id", rows.map((r) => r.class_id as string));
    const nameById = new Map(((classes || []) as Array<Record<string, unknown>>).map((c) => [c.id as string, c.name as string]));
    return rows.map((row) => ({
        id: row.id as string,
        classId: row.class_id as string,
        className: nameById.get(row.class_id as string) || "—",
        closedAt: (row.closed_at as string | null) ?? null,
    }));
};

// Закрытие одной группы — обычный UPDATE: политика
// mock_class_assignments_teacher_close (073) разрешает его учителю своей
// группы, а админу — уже существующая admin-политика.
export const setClassAssignmentClosed = async (assignmentId: string, closed: boolean): Promise<void> => {
    const { error } = await supabase
        .from("mock_class_assignments")
        .update({ closed_at: closed ? new Date().toISOString() : null })
        .eq("id", assignmentId);
    if (error) throw error;
};
