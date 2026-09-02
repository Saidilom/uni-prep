import supabase from "./supabase/client";
import { User, Class, MockTest } from "./firestore-schema";
import { pageCache } from "./page-cache";

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

export const createClass = async (teacherId: string, name: string): Promise<Class> => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("classes").insert({ id, teacher_id: teacherId, name });
    if (error) throw error;
    pageCache.invalidate(`teacherClasses:${teacherId}`);
    return { id, teacherId, name, createdAt: new Date().toISOString() };
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

export const fetchClassMockAssignments = async (classId: string): Promise<ClassMockAssignment[]> => {
    return pageCache.fetch(`classMockAssignments:${classId}`, async () => {
        const { data: assignments } = await supabase
            .from("mock_class_assignments")
            .select("id, mock_test_id")
            .eq("class_id", classId);
        if (!assignments || assignments.length === 0) return [];

        const mockTestIds = assignments.map((a) => a.mock_test_id as string);
        const [{ data: tests }, { data: members }] = await Promise.all([
            supabase.from("mock_tests").select("id, title, duration_minutes").in("id", mockTestIds),
            supabase.from("class_members").select("student_id").eq("class_id", classId),
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
    raschScore: number | null;
    completedAt: string | null;
    // Official CEFR scoring — only populated for English mocks (see
    // src/lib/english-cefr.ts) — null for every other subject.
    cefrBand: string | null;
    cefrScore: number | null;
    // Generic A+..C level (src/lib/mock-grade-level.ts) — populated for
    // every subject once a real cohort exists to standardize against.
    gradeLevel: string | null;
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
};

export const fetchClassMockResults = async (classId: string, mockTestId: string): Promise<ClassMockResultsSummary> => {
    const [members, { data: test }, { data: results }] = await Promise.all([
        fetchClassMembers(classId),
        supabase.from("mock_tests").select("title").eq("id", mockTestId).single(),
        supabase.from("mock_results").select("id, user_id, score, max_score, accuracy, correct_answers, total_questions, rasch_score, cefr_band, cefr_score, grade_level, completed_at").eq("mock_test_id", mockTestId),
    ]);

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
                raschScore: r && r.rasch_score !== null ? (r.rasch_score as number) : null,
                cefrBand: r ? (r.cefr_band as string | null) : null,
                cefrScore: r && r.cefr_score !== null ? (r.cefr_score as number) : null,
                gradeLevel: r ? (r.grade_level as string | null) : null,
                completedAt: r ? (r.completed_at as string) : null,
            };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const scores = students.map((s) => s.score).filter((s): s is number => s !== null);
    const mockMaxScore = students.find((s) => s.maxScore !== null)?.maxScore ?? null;

    return {
        mockTitle: test?.title || "—",
        students,
        completedCount: scores.length,
        totalCount: members.length,
        mockMaxScore,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        topScore: scores.length > 0 ? Math.max(...scores) : null,
        lowScore: scores.length > 0 ? Math.min(...scores) : null,
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
    myResult: { score: number; maxScore: number; accuracy: number; gradeLevel: string | null; revealed: boolean } | null;
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
        supabase.from("mock_results").select("mock_test_id, score, max_score, accuracy, grade_level, revealed_at").eq("user_id", studentId).in("mock_test_id", mockTestIds),
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
export const fetchMockQuestionErrorStats = async (classId: string, mockTestId: string): Promise<QuestionErrorStat[]> => {
    const members = await fetchClassMembers(classId);
    if (members.length === 0) return [];

    const { data: results } = await supabase
        .from("mock_results")
        .select("id")
        .eq("mock_test_id", mockTestId)
        .in("user_id", members.map((m) => m.id));
    const resultIds = (results || []).map((r) => r.id as string);
    if (resultIds.length === 0) return [];

    const { data: details } = await supabase
        .from("mock_answer_details")
        .select("question_id, question_text, is_correct")
        .in("result_id", resultIds);

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
    // Official grading-rubric summary for essay/writing questions (English/
    // Russian/Uzbek) — set at import time (see mock-import-prompt.ts), shown
    // next to the manual-scoring input so the teacher isn't grading blind.
    rubricNote?: string | null;
};

export const fetchMockAnswerDetails = async (resultId: string): Promise<MockAnswerDetail[]> => {
    const { data } = await supabase
        .from("mock_answer_details")
        .select("id, question_id, question_text, selected_answer, correct_answer, is_correct, points_earned, max_points, review_status, review_feedback")
        .eq("result_id", resultId);
    const rows = data || [];

    const questionIds = Array.from(new Set(rows.map((d) => d.question_id as string).filter(Boolean)));
    const rubricByQuestion = new Map<string, string | null>();
    if (questionIds.length > 0) {
        const { data: questions } = await supabase.from("mock_questions").select("id, content").in("id", questionIds);
        (questions || []).forEach((q) => {
            const content = q.content as { rubricNote?: string | null } | null;
            rubricByQuestion.set(q.id as string, content?.rubricNote ?? null);
        });
    }

    return rows.map((d) => ({
        id: d.id as string,
        questionText: d.question_text as string,
        selectedAnswer: d.selected_answer as string,
        correctAnswer: d.correct_answer as string,
        isCorrect: d.is_correct as boolean,
        pointsEarned: d.points_earned as number,
        maxPoints: (d.max_points as number) ?? 1,
        reviewStatus: d.review_status as MockAnswerDetail["reviewStatus"],
        reviewFeedback: d.review_feedback as string | null,
        rubricNote: rubricByQuestion.get(d.question_id as string) ?? null,
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

export type TeacherClassSummary = ClassWithCount & { avgAccuracy: number | null; attemptCount: number };
export type TeacherTopStudent = { student: User; className: string; avgAccuracy: number; attemptCount: number };
export type TeacherResultsOverview = {
    classes: TeacherClassSummary[];
    topClass: TeacherClassSummary | null;
    topStudent: TeacherTopStudent | null;
};

// One pass across every class the teacher owns: per-class average accuracy
// (mean of every completed attempt by that class's students) plus whichever
// single student has the highest average across their own attempts — powers
// the "Топ класс" / "Топ ученик" cards on the teacher results page.
export const fetchTeacherResultsOverview = async (teacherId: string): Promise<TeacherResultsOverview> => {
    return pageCache.fetch(`teacherResultsOverview:${teacherId}`, async () => {
        const classes = await fetchTeacherClasses(teacherId);
        if (classes.length === 0) return { classes: [], topClass: null, topStudent: null };

        const { data: memberships } = await supabase
            .from("class_members")
            .select("class_id, student_id")
            .in("class_id", classes.map((c) => c.id));
        const studentIds = Array.from(new Set((memberships || []).map((m) => m.student_id as string)));
        if (studentIds.length === 0) {
            return { classes: classes.map((c) => ({ ...c, avgAccuracy: null, attemptCount: 0 })), topClass: null, topStudent: null };
        }

        const [{ data: results }, { data: users }] = await Promise.all([
            supabase.from("mock_results").select("user_id, accuracy").in("user_id", studentIds),
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

        return { classes: classSummaries, topClass, topStudent };
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
