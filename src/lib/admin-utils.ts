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
    const [subjectsRes, textbooksRes, topicsRes, questionsRes, usersRes] = await Promise.all([
        supabase.from("subjects").select("id"),
        supabase.from("textbooks").select("id"),
        supabase.from("topics").select("id"),
        supabase.from("questions").select("id"),
        supabase.from("users").select("id, role"),
    ]);

    throwIfError(subjectsRes.error, "fetch stats subjects");
    throwIfError(textbooksRes.error, "fetch stats textbooks");
    throwIfError(topicsRes.error, "fetch stats topics");
    throwIfError(questionsRes.error, "fetch stats questions");
    throwIfError(usersRes.error, "fetch stats users");

    const users = (usersRes.data ?? []) as Array<Record<string, unknown>>;
    const students = users.filter((user) => String(user.role ?? "").toLowerCase() === "student").length;
    const teachers = users.filter((user) => String(user.role ?? "").toLowerCase() === "teacher").length;

    return {
        subjects: (subjectsRes.data ?? []).length,
        textbooks: (textbooksRes.data ?? []).length,
        topics: (topicsRes.data ?? []).length,
        questions: (questionsRes.data ?? []).length,
        students,
        teachers,
    };
};
