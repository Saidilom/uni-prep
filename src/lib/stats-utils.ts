import supabase from "./supabase/client";
import { UserProgress, SubjectRating } from "./firestore-schema";
import { pageCache } from "./page-cache";

const TTL_USER = 2 * 60 * 1000; // 2 min — user data changes more often

export interface GlobalStats {
    totalSolved: number;
    accuracy: number;
    medals: { green: number; grey: number; bronze: number };
}

// ─── Internal: read full collections once, cache per user ───────────────────

function fetchRawRatings(userId: string): Promise<Record<string, number>> {
    return pageCache.fetch(`ratings:${userId}`, async () => {
        const { data } = await supabase.from<SubjectRating>("ratings").select("*").eq("user_id", userId);
        const result: Record<string, number> = {};
        (data || []).forEach((entry) => {
            const rating = entry as SubjectRating & { subjectId?: string; stars?: number };
            if (rating.subjectId) result[rating.subjectId] = rating.stars || 0;
        });
        return result;
    }, TTL_USER);
}

function fetchRawProgress(userId: string): Promise<Map<string, UserProgress>> {
    return pageCache.fetch(`progress:${userId}`, async () => {
        const { data } = await supabase.from<UserProgress>("user_progress").select("*").eq("user_id", userId);
        const result = new Map<string, UserProgress>();
        (data || []).forEach((entry) => {
            const progress = entry as UserProgress & { topicId?: string };
            if (progress.topicId) result.set(progress.topicId, progress as UserProgress);
        });
        return result;
    }, TTL_USER);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Stars per subject — single Firestore read, cached */
export const fetchUserSubjectRatings = (userId: string): Promise<Record<string, number>> =>
    fetchRawRatings(userId);

/** Global stats — derived from cached ratings + progress, no extra reads */
export const fetchUserGlobalStats = async (userId: string): Promise<GlobalStats> => {
    try {
        const [ratings, progress] = await Promise.all([
            fetchRawRatings(userId),
            fetchRawProgress(userId),
        ]);

        const totalSolved = Object.values(ratings).reduce((s, v) => s + v, 0);

        let totalCorrect = 0;
        let totalAttempted = 0;
        const medals = { green: 0, grey: 0, bronze: 0 };

        progress.forEach((data) => {
            const solved = (data as UserProgress & { solvedQuestions?: number }).solvedQuestions ?? 0;
            const errors = (data as UserProgress & { errors?: number }).errors ?? 0;
            totalCorrect += solved;
            totalAttempted += solved + errors;
            if (data.medal === "green") medals.green++;
            if (data.medal === "grey") medals.grey++;
            if (data.medal === "bronze") medals.bronze++;
        });

        const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
        return { totalSolved, accuracy, medals };
    } catch {
        return { totalSolved: 0, accuracy: 0, medals: { green: 0, grey: 0, bronze: 0 } };
    }
};

/**
 * Progress for one subject — uses CACHED userProgress collection.
 * Previously this made 1 Firestore read per subject (n subjects = n reads of the same data).
 * Now it's 0 extra reads after the first call.
 */
export const fetchSubjectProgress = async (
    userId: string,
    subjectId: string,
    topicIds: string[]
): Promise<{ medals: { green: number; grey: number; bronze: number }; progress: number }> => {
    try {
        const progress = await fetchRawProgress(userId);
        const medals = { green: 0, grey: 0, bronze: 0 };
        let completed = 0;

        for (const topicId of topicIds) {
            const data = progress.get(topicId);
            if (!data) continue;
            if (data.medal === "green") { medals.green++; completed++; }
            else if (data.medal === "grey") { medals.grey++; completed++; }
            else if (data.medal === "bronze") { medals.bronze++; completed++; }
        }

        const pct = topicIds.length > 0 ? Math.round((completed / topicIds.length) * 100) : 0;
        return { medals, progress: pct };
    } catch {
        return { medals: { green: 0, grey: 0, bronze: 0 }, progress: 0 };
    }
};

/** Badges — cached */
export const fetchUserBadges = (userId: string) =>
    pageCache.fetch(`badges:${userId}`, async () => {
        const { data } = await supabase.from("badges").select("*").eq("user_id", userId);
        return (data || []) as Array<{
            id: string;
            name: string;
            description?: string;
            icon?: string;
            unlockedAt?: Date | string;
        }>;
    }, TTL_USER);

/** Invalidate all cached data for a user (call after writing progress) */
export const invalidateUserCache = (userId: string) => {
    pageCache.invalidate(`ratings:${userId}`);
    pageCache.invalidate(`progress:${userId}`);
    pageCache.invalidate(`badges:${userId}`);
};
