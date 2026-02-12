import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { Class, User } from "./firestore-schema";

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
            ratings[doc.id] = (doc.data() as any).stars || 0;
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
export const fetchUserBadges = async (userId: string): Promise<any[]> => {
    try {
        const badgesRef = collection(db, "users", userId, "badges");
        const querySnapshot = await getDocs(badgesRef);

        const badges: any[] = [];
        querySnapshot.forEach((doc) => {
            badges.push({ id: doc.id, ...doc.data() });
        });

        return badges;
    } catch (error) {
        console.error("Error fetching badges:", error);
        return [];
    }
};
