import supabase from "./supabase/client";

const throwIfError = (error: { message?: string } | null | undefined, context: string) => {
    if (error) {
        console.error(`[admin-utils] ${context}:`, error);
        throw error;
    }
};

export type RecentTransaction = {
    id: string;
    userName: string;
    mockTestTitle: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
};

export type MockRevenue = {
    mockTestId: string;
    mockTestTitle: string;
    revenue: number;
    paymentsCount: number;
};

export type RecentPlacementResult = {
    id: string;
    testId: string;
    userName: string;
    testTitle: string;
    accuracy: number;
    correctAnswers: number;
    totalQuestions: number;
    completedAt: string;
};

export const fetchAdminOverview = async () => {
    const [usersRes, paymentsRes, resultsRes, recentPaymentsRes, recentPlacementRes] = await Promise.all([
        supabase.from("users").select("id, role"),
        // Only successful payments carry real access grants — pending/failed
        // rows must not count toward revenue or the "waiting for their test" set.
        supabase.from("payments").select("user_id, mock_test_id, mock_test_title, amount").eq("status", "success"),
        supabase.from("mock_results").select("user_id, mock_test_id"),
        supabase
            .from("payments")
            .select("id, user_name, mock_test_title, amount, currency, status, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
        supabase
            .from("placement_results")
            .select("id, test_id, user_name, user_surname, test_title, accuracy, correct_answers, total_questions, completed_at")
            .order("completed_at", { ascending: false })
            .limit(8),
    ]);

    throwIfError(usersRes.error, "fetch overview users");
    throwIfError(paymentsRes.error, "fetch overview payments");
    throwIfError(resultsRes.error, "fetch overview results");
    throwIfError(recentPaymentsRes.error, "fetch overview recent payments");
    throwIfError(recentPlacementRes.error, "fetch overview recent placement results");

    const users = (usersRes.data ?? []) as Array<Record<string, unknown>>;
    const students = users.filter((user) => String(user.role ?? "").toLowerCase() === "student").length;

    const successfulPayments = (paymentsRes.data ?? []) as Array<{ user_id: string; mock_test_id: string; mock_test_title: string; amount: number }>;
    const revenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const revenueByMockMap = new Map<string, MockRevenue>();
    for (const p of successfulPayments) {
        const existing = revenueByMockMap.get(p.mock_test_id);
        if (existing) {
            existing.revenue += Number(p.amount || 0);
            existing.paymentsCount += 1;
        } else {
            revenueByMockMap.set(p.mock_test_id, {
                mockTestId: p.mock_test_id,
                mockTestTitle: p.mock_test_title,
                revenue: Number(p.amount || 0),
                paymentsCount: 1,
            });
        }
    }
    const revenueByMock = Array.from(revenueByMockMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // A student who paid for a Mock but hasn't submitted a result for that
    // exact test yet is still "waiting" on it — this is what the dashboard
    // means by paid students waiting for their test.
    const completedPairs = new Set(
        ((resultsRes.data ?? []) as Array<{ user_id: string; mock_test_id: string }>).map((r) => `${r.user_id}:${r.mock_test_id}`),
    );
    const waitingStudentIds = new Set(
        successfulPayments
            .filter((p) => !completedPairs.has(`${p.user_id}:${p.mock_test_id}`))
            .map((p) => p.user_id),
    );

    const recentTransactions: RecentTransaction[] = ((recentPaymentsRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: p.id as string,
        userName: p.user_name as string,
        mockTestTitle: p.mock_test_title as string,
        amount: p.amount as number,
        currency: p.currency as string,
        status: p.status as string,
        createdAt: p.created_at as string,
    }));

    const recentPlacementResults: RecentPlacementResult[] = ((recentPlacementRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        testId: r.test_id as string,
        userName: `${r.user_name as string} ${(r.user_surname as string) || ""}`.trim(),
        testTitle: r.test_title as string,
        accuracy: r.accuracy as number,
        correctAnswers: r.correct_answers as number,
        totalQuestions: r.total_questions as number,
        completedAt: r.completed_at as string,
    }));

    return {
        students,
        revenue,
        waitingForMock: waitingStudentIds.size,
        recentTransactions,
        revenueByMock,
        recentPlacementResults,
    };
};
