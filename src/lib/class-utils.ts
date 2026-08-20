import supabase from "./supabase/client";
import { Class, User } from "./firestore-schema";
import { pageCache } from "./page-cache";

/**
 * Создание нового класса учителем
 */
export const createClass = async (teacherId: string, name: string, subjectId: string) => {
    try {
        const classData = {
            teacherId,
            name,
            subjectId,
            students: [],
            createdAt: new Date().toISOString(),
        };
        const { data } = await supabase.from("classes").insert(classData).select("id").single();
        pageCache.invalidatePrefix(`teacherClasses:${teacherId}`);
        return { id: data?.id, ...classData };
    } catch (error) {
        console.error("Error creating class:", error);
        throw error;
    }
};

/**
 * Получение всех классов конкретного учителя
 */
export const fetchTeacherClasses = (teacherId: string): Promise<Class[]> =>
    pageCache.fetch(`teacherClasses:${teacherId}`, async () => {
        const { data } = await supabase.from<Class>("classes").select("*").eq("teacherId", teacherId);
        return (data || []) as Class[];
    }, 2 * 60 * 1000);

/**
 * Поиск ученика по короткому ID
 */
export const findStudentById = async (shortId: string): Promise<User | null> => {
    try {
        const { data } = await supabase.from<User>("users").select("*").eq("shortId", shortId.toUpperCase()).eq("role", "student").limit(1);
        if (data && data.length > 0) return data[0] as User;
        return null;
    } catch (error) {
        console.error("Error finding student by shortID:", error);
        return null;
    }
};

/**
 * Добавление ученика в класс
 */
export const addStudentToClass = async (classId: string, studentId: string) => {
    try {
        const { data } = await supabase.from<Class>("classes").select("students").eq("id", classId).single();
        const students = (data?.students || []) as string[];
        if (!students.includes(studentId)) students.push(studentId);
        await supabase.from("classes").update({ students }).eq("id", classId);
    } catch (error) {
        console.error("Error adding student to class:", error);
        throw error;
    }
};

/**
 * Получение данных о студентах класса
 */
export const fetchClassStudents = async (studentIds: string[]): Promise<User[]> => {
    if (studentIds.length === 0) return [];
    try {
        const { data } = await supabase.from<User>("users").select("*").in("id", studentIds);
        return (data || []) as User[];
    } catch (error) {
        console.error("Error fetching class students:", error);
        return [];
    }
};

/**
 * Удаление ученика из класса
 */
export const deleteStudentFromClass = async (classId: string, studentId: string) => {
    try {
        const { data } = await supabase.from<Class>("classes").select("students").eq("id", classId).single();
        const students = (data?.students || []) as string[];
        const filtered = students.filter((s) => s !== studentId);
        await supabase.from("classes").update({ students: filtered }).eq("id", classId);
    } catch (error) {
        console.error("Error deleting student from class:", error);
        throw error;
    }
};

/**
 * Удаление класса целиком
 */
export const deleteClass = async (classId: string) => {
    try {
        await supabase.from("classes").delete().eq("id", classId);
    } catch (error) {
        console.error("Error deleting class:", error);
        throw error;
    }
};
