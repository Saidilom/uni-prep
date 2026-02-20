import { collection, query, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { UserProgress, SubjectRating, Medal } from "./firestore-schema";

export interface GlobalStats {
    totalSolved: number;
    accuracy: number;
    medals: {
        green: number;
        grey: number;
        bronze: number;
    };
}

/**
 * Загрузка общей статистики пользователя
 */
export const fetchUserGlobalStats = async (userId: string): Promise<GlobalStats> => {
    try {
        // 1. Получаем общее кол-во решенных вопросов (звезды из ratings)
        const ratingsRef = collection(db, "users", userId, "ratings");
        const ratingsSnap = await getDocs(ratingsRef);
        let totalSolved = 0;
        ratingsSnap.forEach((doc) => {
            const data = doc.data() as SubjectRating;
            totalSolved += data.stars || 0;
        });

        // 2. Получаем прогресс по темам для расчета точности и медалей
        const progressRef = collection(db, "users", userId, "userProgress");
        const progressSnap = await getDocs(progressRef);

        let totalCorrect = 0;
        let totalAttempted = 0;
        const medalsCount = { green: 0, grey: 0, bronze: 0 };

        progressSnap.forEach((doc) => {
            const data = doc.data() as UserProgress;
            // В userProgress поля называются по-другому в ТЗ (solvedQuestions, errors)
            // В схеме: correctAnswers, mistakes
            // Будем использовать поля из ТЗ: solvedQuestions, errors
            const solved = (data as any).solvedQuestions || 0;
            const errors = (data as any).errors || 0;

            totalCorrect += solved;
            totalAttempted += (solved + errors);

            if (data.medal === "green") medalsCount.green++;
            if (data.medal === "grey") medalsCount.grey++;
            if (data.medal === "bronze") medalsCount.bronze++;
        });

        const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

        return {
            totalSolved,
            accuracy,
            medals: medalsCount,
        };
    } catch (error) {
        console.error("Error fetching global stats:", error);
        return {
            totalSolved: 0,
            accuracy: 0,
            medals: { green: 0, grey: 0, bronze: 0 },
        };
    }
};
/**
 * Получение рейтингов по предметам (звезды)
 */
export const fetchUserSubjectRatings = async (userId: string): Promise<Record<string, number>> => {
    try {
        const ratingsRef = collection(db, "users", userId, "ratings");
        const ratingsSnap = await getDocs(ratingsRef);
        const ratings: Record<string, number> = {};
        ratingsSnap.forEach((doc) => {
            const data = doc.data() as SubjectRating;
            ratings[doc.id] = data.stars || 0;
        });
        return ratings;
    } catch (error) {
        console.error("Error fetching subject ratings:", error);
        return {};
    }
};

/**
 * Получение всех бейджей пользователя
 */
export const fetchUserBadges = async (userId: string) => {
    try {
        const badgesRef = collection(db, "users", userId, "badges");
        const badgesSnap = await getDocs(badgesRef);
        return badgesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching user badges:", error);
        return [];
    }
};

/**
 * Получение прогресса по предмету (медали и прогресс)
 */
export const fetchSubjectProgress = async (
    userId: string, 
    subjectId: string,
    topicIds: string[]
): Promise<{ medals: { green: number; grey: number; bronze: number }; progress: number }> => {
    try {
        const progressRef = collection(db, "users", userId, "userProgress");
        const progressSnap = await getDocs(progressRef);
        
        const medals = { green: 0, grey: 0, bronze: 0 };
        let completedTopics = 0;
        
        progressSnap.forEach((doc) => {
            const data = doc.data() as UserProgress;
            // Проверяем, относится ли прогресс к теме этого предмета
            if (topicIds.includes(doc.id)) {
                if (data.medal === "green") medals.green++;
                if (data.medal === "grey") medals.grey++;
                if (data.medal === "bronze") medals.bronze++;
                if (data.medal !== "none") completedTopics++;
            }
        });
        
        const progress = topicIds.length > 0 
            ? Math.round((completedTopics / topicIds.length) * 100) 
            : 0;
        
        return { medals, progress };
    } catch (error) {
        console.error("Error fetching subject progress:", error);
        return { medals: { green: 0, grey: 0, bronze: 0 }, progress: 0 };
    }
};