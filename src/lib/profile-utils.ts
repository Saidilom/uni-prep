import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { Class, SubjectRating } from "./firestore-schema";

/**
 * Получение списка классов, в которых состоит ученик
 */
export const fetchStudentClasses = async (studentId: string): Promise<Class[]> => {
    try {
        const classesRef = collection(db, "classes");
        const q = query(classesRef, where("students", "array-contains", studentId));
        const querySnapshot = await getDocs(q);

        const classes: Class[] = [];
        querySnapshot.forEach((doc) => {
            classes.push({ id: doc.id, ...doc.data() } as Class);
        });

        return classes;
    } catch (error) {
        console.error("Error fetching student classes:", error);
        return [];
    }
};

/**
 * Получение рейтингов (звезд) пользователя по предметам
 */
export const fetchUserRatings = async (userId: string): Promise<Record<string, number>> => {
    try {
        const ratingsRef = collection(db, "users", userId, "ratings");
        const ratingsSnap = await getDocs(ratingsRef);
        const ratings: Record<string, number> = {};

        ratingsSnap.forEach((doc) => {
            const ratingData = doc.data() as SubjectRating;
            ratings[doc.id] = ratingData.stars || 0;
        });

        return ratings;
    } catch (error) {
        console.error("Error fetching user ratings:", error);
        return {};
    }
};

/**
 * Получение бейджей (достижений) пользователя
 */
export const fetchUserBadges = async (userId: string): Promise<Array<{ id: string; name: string; description?: string; icon?: string; unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number } }>> => {
    try {
        const badgesRef = collection(db, "users", userId, "badges");
        const querySnapshot = await getDocs(badgesRef);

        const badges: Array<{ id: string; name: string; description?: string; icon?: string; unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number } }> = [];
        querySnapshot.forEach((doc) => {
            badges.push({ id: doc.id, ...doc.data() } as { id: string; name: string; description?: string; icon?: string; unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number } });
        });

        return badges;
    } catch (error) {
        console.error("Error fetching badges:", error);
        return [];
    }
};
