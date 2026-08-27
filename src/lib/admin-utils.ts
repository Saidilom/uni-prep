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

export const fetchAdminOverview = async () => {
    const [usersRes, paymentsRes, resultsRes, recentPaymentsRes] = await Promise.all([
        supabase.from("users").select("id, role"),
        // Only successful payments carry real access grants — pending/failed
        // rows must not count toward revenue or the "waiting for their test" set.
        supabase.from("payments").select("user_id, mock_test_id, amount").eq("status", "success"),
        supabase.from("mock_results").select("user_id, mock_test_id"),
        supabase
            .from("payments")
            .select("id, user_name, mock_test_title, amount, currency, status, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
    ]);

    throwIfError(usersRes.error, "fetch overview users");
    throwIfError(paymentsRes.error, "fetch overview payments");
    throwIfError(resultsRes.error, "fetch overview results");
    throwIfError(recentPaymentsRes.error, "fetch overview recent payments");

    const users = (usersRes.data ?? []) as Array<Record<string, unknown>>;
    const students = users.filter((user) => String(user.role ?? "").toLowerCase() === "student").length;

    const successfulPayments = (paymentsRes.data ?? []) as Array<{ user_id: string; mock_test_id: string; amount: number }>;
    const revenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

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

    return {
        students,
        revenue,
        waitingForMock: waitingStudentIds.size,
        recentTransactions,
    };
};
