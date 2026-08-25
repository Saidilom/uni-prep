import supabase from "./supabase/client";
import { Class, SubjectRating } from "./firestore-schema";
import { pageCache } from "./page-cache";

const TTL = 2 * 60 * 1000; // 2 min

export const fetchStudentClasses = (studentId: string): Promise<Class[]> =>
    pageCache.fetch(`studentClasses:${studentId}`, async () => {
        const { data: memberships } = await supabase.from("class_members").select("class_id").eq("student_id", studentId);
        const classIds = (memberships || []).map((m) => m.class_id as string);
        if (classIds.length === 0) return [];
        const { data } = await supabase.from("classes").select("*").in("id", classIds);
        return (data || []).map((c) => ({
            id: c.id,
            teacherId: c.teacher_id,
            name: c.name,
            createdAt: c.created_at,
        })) as Class[];
    }, TTL);

// Shares cache key with stats-utils fetchUserSubjectRatings — same data, one read
export const fetchUserRatings = (userId: string): Promise<Record<string, number>> =>
    pageCache.fetch(`ratings:${userId}`, async () => {
        const { data } = await supabase.from("ratings").select("*").eq("user_id", userId);
        const result: Record<string, number> = {};
        (data || []).forEach((entry) => {
            const rating = entry as SubjectRating & { subjectId?: string; stars?: number };
            if (rating.subjectId) result[rating.subjectId] = rating.stars || 0;
        });
        return result;
    }, TTL);

// Shares cache key with stats-utils fetchUserBadges
export const fetchUserBadges = (userId: string) =>
    pageCache.fetch(`badges:${userId}`, async () => {
        const { data } = await supabase.from("badges").select("*").eq("user_id", userId);
        return (data || []) as Array<{
            id: string; name: string; description?: string; icon?: string;
            unlockedAt?: Date | string;
        }>;
    }, TTL);
