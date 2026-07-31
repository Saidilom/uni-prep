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

const normalizeUserRow = (data: any): Partial<User> => {
    if (!data) return {};
    return {
        ...data,
        subjects: data.subjects ?? [],
        phone: data.phone ?? "",
        isRegistanStudent: data.isRegistanStudent ?? data.isregistanstudent ?? false,
        registeredVia: data.registeredVia ?? data.registeredvia ?? "google",
        createdAt: data.createdAt ?? data.createdat ?? "",
        updatedAt: data.updatedAt ?? data.updatedat ?? "",
        shortId: data.shortId ?? data.shortid ?? "",
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

const generateShortId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export const createUserProfile = async (supabaseUser: any, input: CreateUserProfileInput = {}) => {
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
        const shortId = generateShortId();
        const resolvedPhone = phone || "";

        const userData = {
            id: uid,
            shortid: shortId,
            email: supabaseUser.email || "",
            phone: resolvedPhone,
            name: name || supabaseUser.user_metadata?.full_name || "Ученик",
            surname: surname || "",
            avatar: supabaseUser.user_metadata?.avatar_url || "",
            role,
            subjects,
            isregistanstudent: isRegistanStudent,
            registeredvia: registeredVia,
            createdat: new Date().toISOString(),
            updatedat: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase.from("users").upsert(userData);
        if (upsertError) {
            console.error("Error upserting user profile:", upsertError);
            throw upsertError;
        }

        pageCache.invalidate(`userProfile:${uid}`);
        return userData as User;
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
};

export const updateUserProfile = async (uid: string, data: { name: string; surname?: string; phone?: string }) => {
    try {
        const updateData: any = { name: data.name, updatedAt: new Date().toISOString() };
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
