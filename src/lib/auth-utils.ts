import supabase from "./supabase/client";
import { User, UserRole, RegisteredVia } from "./firestore-schema";
import { pageCache } from "./page-cache";
import { normalizePhone } from "./phone-utils";

export interface CreateUserProfileInput {
    role?: UserRole;
    subjects?: string[];
    name?: string;
    surname?: string;
    phone?: string;
    registeredVia?: RegisteredVia;
    isRegistanStudent?: boolean;
}

export const signInWithGoogle = async () => {
    try {
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        return supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    } catch (error) {
        console.error("Error signing in with Google:", error);
        throw error;
    }
};

export const logOut = async () => {
    try {
        await supabase.auth.signOut();
        pageCache.clear();
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
};

type SupabaseUserProfile = {
    id: string;
    email?: string | null;
    user_metadata?: {
        full_name?: string | null;
        avatar_url?: string | null;
    } | null;
};

const normalizeUserRow = (data: Record<string, unknown> | null): Partial<User> => {
    if (!data) return {};
    const row = data as Partial<User> & Record<string, unknown>;
    return {
        ...row,
        subjects: (row.subjects as string[] | undefined) ?? [],
        phone: (row.phone as string | undefined) ?? "",
        isRegistanStudent: Boolean(row.isRegistanStudent ?? row.isregistanstudent ?? false),
        registeredVia: (row.registeredVia as RegisteredVia | undefined) ?? (row.registeredvia as RegisteredVia | undefined) ?? "google",
        createdAt: (row.createdAt as string | undefined) ?? (row.createdat as string | undefined) ?? "",
        updatedAt: (row.updatedAt as string | undefined) ?? (row.updatedat as string | undefined) ?? "",
        shortId: (row.shortId as string | undefined) ?? (row.shortid as string | undefined) ?? "",
    } as Partial<User>;
};

export const getUserProfile = (uid: string): Promise<User | null> =>
    pageCache.fetch(`userProfile:${uid}`, async () => {
        const { data, error } = await supabase.from("users").select("*").eq("id", uid).single();
        if (error) {
            if (error.code === "PGRST205") {
                throw new Error("Supabase table public.users не найдена. Создайте таблицу users в Supabase.");
            }
            return null;
        }
        const d = normalizeUserRow(data);
        return {
            subjects: [],
            phone: "",
            isRegistanStudent: false,
            registeredVia: "google",
            ...d,
            id: uid,
        } as User;
    }, 5 * 60 * 1000);

const generateShortId = () => `STU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

const UNIQUE_VIOLATION = "23505";
const MAX_SHORT_ID_ATTEMPTS = 5;

export const createUserProfile = async (supabaseUser: SupabaseUserProfile, input: CreateUserProfileInput = {}) => {
    const {
        role = "student",
        subjects = [],
        name,
        surname,
        phone,
        registeredVia = "google",
        isRegistanStudent = false,
    } = input;

    const uid = supabaseUser.id;
    try {
        const resolvedPhone = phone || "";
        const now = new Date().toISOString();
        const baseUserData = {
            id: uid,
            email: supabaseUser.email || "",
            phone: resolvedPhone,
            name: name || supabaseUser.user_metadata?.full_name || "Ученик",
            surname: surname || "",
            avatar: supabaseUser.user_metadata?.avatar_url || "",
            role,
            subjects,
            isregistanstudent: isRegistanStudent,
            registeredvia: registeredVia,
            createdAt: now,
            updatedAt: now,
        };

        let userData: typeof baseUserData & { shortid: string } = { ...baseUserData, shortid: generateShortId() };
        for (let attempt = 1; attempt <= MAX_SHORT_ID_ATTEMPTS; attempt++) {
            const { error: upsertError } = await supabase.from("users").upsert(userData);
            if (!upsertError) break;
            const isShortIdConflict = upsertError.code === UNIQUE_VIOLATION && upsertError.message.includes("shortid");
            if (!isShortIdConflict || attempt === MAX_SHORT_ID_ATTEMPTS) {
                console.error("Error upserting user profile:", upsertError);
                throw upsertError;
            }
            userData = { ...userData, shortid: generateShortId() };
        }

        pageCache.invalidate(`userProfile:${uid}`);
        return {
            ...userData,
            shortId: userData.shortid,
            isRegistanStudent: userData.isregistanstudent,
            registeredVia: userData.registeredvia,
        } as User;
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
};

export const updateUserProfile = async (uid: string, data: { name: string; surname?: string; phone?: string }) => {
    try {
        const updateData: Record<string, unknown> = { name: data.name, updatedAt: new Date().toISOString() };
        if (data.surname !== undefined) updateData.surname = data.surname;
        if (data.phone) updateData.phone = normalizePhone(data.phone);

        await supabase.from("users").update(updateData).eq("id", uid);
        pageCache.invalidate(`userProfile:${uid}`);

        const { data: final } = await supabase.from("users").select("*").eq("id", uid).single();
        return final as User;
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
};

export const setRegistanStudentStatus = async (uid: string, isRegistanStudent: boolean) => {
    await supabase.from("users").update({ isRegistanStudent, updatedAt: new Date().toISOString() }).eq("id", uid);
    pageCache.invalidate(`userProfile:${uid}`);
    const { data: snap } = await supabase.from("users").select("*").eq("id", uid).single();
    return snap as User;
};
