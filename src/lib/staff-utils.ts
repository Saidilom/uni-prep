import supabase from "./supabase/client";
import { User } from "./firestore-schema";

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

// Backed by the users_staff_read_students RLS policy (049_staff_role.sql) —
// a staff account can only ever see role='student' rows through this query.
export const searchStudentsForStaff = async (query: string): Promise<User[]> => {
    // PostgREST builds the filter from this raw string — a query containing
    // ",", "(", ")" could otherwise reshape the .or() expression itself
    // (e.g. inject an always-true clause), not just the %...% search value.
    const q = query.trim().replace(/[,()%*]/g, "");
    if (q.length < 2) return [];
    const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "student")
        .or(`name.ilike.%${q}%,surname.ilike.%${q}%,shortid.ilike.%${q}%`)
        .limit(20);
    return (data || []).map(toUser);
};

// Backed by promote_student_to_teacher (049/050) — refuses anyone whose
// current role isn't exactly 'student', server-side.
export const promoteStudentToTeacher = async (studentId: string): Promise<void> => {
    const { error } = await supabase.rpc("promote_student_to_teacher", { p_student_id: studentId });
    if (error) throw error;
};

// Backed by the users_staff_read_teachers RLS policy.
export const fetchAllTeachersForStaff = async (): Promise<User[]> => {
    const { data } = await supabase.from("users").select("*").eq("role", "teacher");
    return (data || []).map(toUser);
};

export type StaffPlacementResult = {
    id: string;
    userName: string;
    userPhone: string | null;
    testTitle: string;
    accuracy: number;
    correctAnswers: number;
    totalQuestions: number;
    completedAt: string;
};

// Backed by the placement_results_staff RLS policy (051_staff_read_placement_results.sql).
export const fetchPlacementResultsForStaff = async (): Promise<StaffPlacementResult[]> => {
    const { data } = await supabase
        .from("placement_results")
        .select("id, user_name, user_surname, user_phone, test_title, accuracy, correct_answers, total_questions, completed_at")
        .order("completed_at", { ascending: false });
    return (data || []).map((r) => ({
        id: r.id as string,
        userName: `${r.user_name as string} ${(r.user_surname as string) || ""}`.trim(),
        userPhone: (r.user_phone as string) || null,
        testTitle: r.test_title as string,
        accuracy: r.accuracy as number,
        correctAnswers: r.correct_answers as number,
        totalQuestions: r.total_questions as number,
        completedAt: r.completed_at as string,
    }));
};
