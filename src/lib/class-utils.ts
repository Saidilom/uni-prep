import supabase from "./supabase/client";
import { User, Class, MockTest } from "./firestore-schema";

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
};

export const fetchClassById = async (classId: string): Promise<Class | null> => {
    const { data } = await supabase.from("classes").select("*").eq("id", classId).single();
    return data ? toClass(data) : null;
};

export const createClass = async (teacherId: string, name: string): Promise<Class> => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("classes").insert({ id, teacher_id: teacherId, name });
    if (error) throw error;
    return { id, teacherId, name, createdAt: new Date().toISOString() };
};

export const deleteClass = async (classId: string): Promise<void> => {
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    if (error) throw error;
};

export const fetchClassMembers = async (classId: string): Promise<User[]> => {
    const { data: members } = await supabase.from("class_members").select("student_id").eq("class_id", classId);
    const studentIds = (members || []).map((m) => m.student_id as string);
    if (studentIds.length === 0) return [];
    const { data: users } = await supabase.from("users").select("*").in("id", studentIds);
    return (users || []).map(toUser);
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
};

export const removeStudentFromClass = async (classId: string, studentId: string): Promise<void> => {
    const { error } = await supabase.from("class_members").delete().eq("class_id", classId).eq("student_id", studentId);
    if (error) throw error;
};

export type ClassMockAssignment = {
    id: string;
    mockTestId: string;
    title: string;
    durationMinutes: number;
    completedCount: number;
};

export const fetchAssignableMockTests = async (): Promise<MockTest[]> => {
    const { data } = await supabase.from("mock_tests").select("*").eq("type", "class_only").order("created_at", { ascending: false });
    return (data || []) as MockTest[];
};

export const fetchClassMockAssignments = async (classId: string): Promise<ClassMockAssignment[]> => {
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
};

export const assignMockToClass = async (mockTestId: string, classId: string): Promise<void> => {
    const { error } = await supabase.from("mock_class_assignments").insert({ id: crypto.randomUUID(), mock_test_id: mockTestId, class_id: classId });
    if (error) throw error;
};

export const unassignMockFromClass = async (assignmentId: string): Promise<void> => {
    const { error } = await supabase.from("mock_class_assignments").delete().eq("id", assignmentId);
    if (error) throw error;
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

export const assignPlacementToStudent = async (test: AssignablePlacementTest, studentId: string, assignedBy: string): Promise<void> => {
    const { error } = await supabase.from("placement_assignments").insert({
        id: crypto.randomUUID(),
        user_id: studentId,
        test_id: test.id,
        test_title: test.title,
        status: "assigned",
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
    });
    if (error) throw error;
};

export type StudentMockResult = {
    student: User;
    resultId: string | null;
    score: number | null;
    correctAnswers: number | null;
    totalQuestions: number | null;
    raschScore: number | null;
    completedAt: string | null;
};

export type ClassMockResultsSummary = {
    mockTitle: string;
    students: StudentMockResult[];
    completedCount: number;
    totalCount: number;
    avgScore: number | null;
    maxScore: number | null;
    minScore: number | null;
};

export const fetchClassMockResults = async (classId: string, mockTestId: string): Promise<ClassMockResultsSummary> => {
    const [members, { data: test }, { data: results }] = await Promise.all([
        fetchClassMembers(classId),
        supabase.from("mock_tests").select("title").eq("id", mockTestId).single(),
        supabase.from("mock_results").select("id, user_id, score, correct_answers, total_questions, rasch_score, completed_at").eq("mock_test_id", mockTestId),
    ]);

    const resultByStudent = new Map((results || []).map((r) => [r.user_id as string, r]));
    const students: StudentMockResult[] = members
        .map((student) => {
            const r = resultByStudent.get(student.id);
            return {
                student,
                resultId: r ? (r.id as string) : null,
                score: r ? (r.score as number) : null,
                correctAnswers: r ? (r.correct_answers as number) : null,
                totalQuestions: r ? (r.total_questions as number) : null,
                raschScore: r && r.rasch_score !== null ? (r.rasch_score as number) : null,
                completedAt: r ? (r.completed_at as string) : null,
            };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const scores = students.map((s) => s.score).filter((s): s is number => s !== null);

    return {
        mockTitle: test?.title || "—",
        students,
        completedCount: scores.length,
        totalCount: members.length,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        maxScore: scores.length > 0 ? Math.max(...scores) : null,
        minScore: scores.length > 0 ? Math.min(...scores) : null,
    };
};

export type MockAnswerDetail = {
    id: string;
    questionText: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    pointsEarned: number;
};

export const fetchMockAnswerDetails = async (resultId: string): Promise<MockAnswerDetail[]> => {
    const { data } = await supabase
        .from("mock_answer_details")
        .select("id, question_text, selected_answer, correct_answer, is_correct, points_earned")
        .eq("result_id", resultId);
    return (data || []).map((d) => ({
        id: d.id as string,
        questionText: d.question_text as string,
        selectedAnswer: d.selected_answer as string,
        correctAnswer: d.correct_answer as string,
        isCorrect: d.is_correct as boolean,
        pointsEarned: d.points_earned as number,
    }));
};
