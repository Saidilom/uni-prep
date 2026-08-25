import supabase from "./supabase/client";

const getTableName = (collection: string) => collection;

const throwIfError = (error: { message?: string } | null | undefined, context: string) => {
    if (error) {
        console.error(`[admin-utils] ${context}:`, error);
        throw error;
    }
};

export const adminFetchCollection = async (collection: string, sortBy?: string) => {
    const query = supabase.from(getTableName(collection)).select("*");
    const { data, error } = sortBy
        ? await query.order(sortBy, { ascending: true })
        : await query;

    throwIfError(error, `fetch ${collection}`);
    return (data ?? []) as Record<string, unknown>[];
};

export const adminAddItem = async (collection: string, item: Record<string, unknown>) => {
    const { data, error } = await supabase
        .from(getTableName(collection))
        .insert([item])
        .select()
        .single();

    throwIfError(error, `add ${collection}`);
    return data as Record<string, unknown>;
};

export const adminDeleteItem = async (collection: string, id: string) => {
    const { error } = await supabase.from(getTableName(collection)).delete().eq("id", id);
    throwIfError(error, `delete ${collection}`);
};

export const adminUpdateItem = async (collection: string, id: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase
        .from(getTableName(collection))
        .update(payload)
        .eq("id", id)
        .select()
        .single();

    throwIfError(error, `update ${collection}`);
    return data as Record<string, unknown>;
};

export const adminIncrementField = async (collection: string, id: string, field: string, amount: number) => {
    const { data: currentRow, error: fetchError } = await supabase
        .from(getTableName(collection))
        .select(field)
        .eq("id", id)
        .single();

    throwIfError(fetchError, `increment fetch ${collection}`);

    const currentValue = Number((currentRow as Record<string, unknown> | null)?.[field] ?? 0);
    const nextValue = currentValue + amount;

    const { data, error } = await supabase
        .from(getTableName(collection))
        .update({ [field]: nextValue })
        .eq("id", id)
        .select()
        .single();

    throwIfError(error, `increment ${collection}`);
    return data as Record<string, unknown>;
};

export const fetchAdminStats = async () => {
    const [
        subjectsRes,
        textbooksRes,
        topicsRes,
        questionsRes,
        usersRes,
        classesRes,
        mocksRes,
        mockAttemptsRes,
        placementAttemptsRes,
        paymentsRes,
    ] = await Promise.all([
        supabase.from("subjects").select("id"),
        supabase.from("textbooks").select("id"),
        supabase.from("topics").select("id"),
        supabase.from("questions").select("id"),
        supabase.from("users").select("id, role"),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("mock_tests").select("id", { count: "exact", head: true }),
        supabase.from("mock_results").select("id", { count: "exact", head: true }),
        supabase.from("placement_results").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount").eq("status", "success"),
    ]);

    throwIfError(subjectsRes.error, "fetch stats subjects");
    throwIfError(textbooksRes.error, "fetch stats textbooks");
    throwIfError(topicsRes.error, "fetch stats topics");
    throwIfError(questionsRes.error, "fetch stats questions");
    throwIfError(usersRes.error, "fetch stats users");
    throwIfError(classesRes.error, "fetch stats classes");
    throwIfError(mocksRes.error, "fetch stats mocks");
    throwIfError(mockAttemptsRes.error, "fetch stats mock attempts");
    throwIfError(placementAttemptsRes.error, "fetch stats placement attempts");
    throwIfError(paymentsRes.error, "fetch stats payments");

    const users = (usersRes.data ?? []) as Array<Record<string, unknown>>;
    const students = users.filter((user) => String(user.role ?? "").toLowerCase() === "student").length;
    const teachers = users.filter((user) => String(user.role ?? "").toLowerCase() === "teacher").length;
    const revenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number((p as { amount: number }).amount || 0), 0);

    return {
        subjects: (subjectsRes.data ?? []).length,
        textbooks: (textbooksRes.data ?? []).length,
        topics: (topicsRes.data ?? []).length,
        questions: (questionsRes.data ?? []).length,
        students,
        teachers,
        classes: classesRes.count ?? 0,
        mocks: mocksRes.count ?? 0,
        attempts: (mockAttemptsRes.count ?? 0) + (placementAttemptsRes.count ?? 0),
        revenue,
    };
};
