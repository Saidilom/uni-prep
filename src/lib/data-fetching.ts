import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { Textbook, Topic, Subject, Question } from "./firestore-schema";

/**
 * Получение списка всех предметов
 */
export const fetchSubjects = async (): Promise<Subject[]> => {
    try {
        const subjectsRef = collection(db, "subjects");
        const q = query(subjectsRef, orderBy("order", "asc"));
        const querySnapshot = await getDocs(q);

        const subjects: Subject[] = [];
        querySnapshot.forEach((doc) => {
            subjects.push({ id: doc.id, ...doc.data() } as Subject);
        });

        return subjects;
    } catch (error) {
        console.error("Error fetching subjects:", error);
        return [];
    }
};

/**
 * Получение данных конкретного предмета
 */
export const fetchSubjectById = async (id: string): Promise<Subject | null> => {
    try {
        const docRef = doc(db, "subjects", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Subject;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching subject:", error);
        return null;
    }
};

/**
 * Получение данных конкретного учебника
 */
export const fetchTextbookById = async (id: string): Promise<Textbook | null> => {
    try {
        const docRef = doc(db, "textbooks", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Textbook;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching textbook:", error);
        return null;
    }
};

/**
 * Получение списка учебников для конкретного предмета
 */
export const fetchTextbooksBySubject = async (subjectId: string): Promise<Textbook[]> => {
    try {
        const textbooksRef = collection(db, "textbooks");
        const q = query(
            textbooksRef,
            where("subjectId", "==", subjectId)
        );
        const querySnapshot = await getDocs(q);

        const textbooks: Textbook[] = [];
        querySnapshot.forEach((doc) => {
            textbooks.push({ id: doc.id, ...doc.data() } as Textbook);
        });

        // Сортируем в памяти по классам (п. 2.5 ТЗ)
        return textbooks.sort((a, b) => {
            const gradeA = parseInt(String(a.grade)) || 0;
            const gradeB = parseInt(String(b.grade)) || 0;
            return gradeA - gradeB;
        });
    } catch (error) {
        console.error("Error fetching textbooks:", error);
        return [];
    }
};

/**
 * Получение данных конкретной темы
 */
export const fetchTopicById = async (id: string): Promise<Topic | null> => {
    try {
        const docRef = doc(db, "topics", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Topic;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching topic:", error);
        return null;
    }
};

/**
 * Получение списка тем для конкретного учебника
 */
export const fetchTopicsByTextbook = async (textbookId: string): Promise<Topic[]> => {
    try {
        const topicsRef = collection(db, "topics");
        const q = query(
            topicsRef,
            where("textbookId", "==", textbookId)
        );
        const querySnapshot = await getDocs(q);

        const topics: Topic[] = [];
        querySnapshot.forEach((doc) => {
            topics.push({ id: doc.id, ...doc.data() } as Topic);
        });

        // Сортируем по порядку (order) в памяти
        return topics.sort((a, b) => a.order - b.order);
    } catch (error) {
        console.error("Error fetching topics:", error);
        return [];
    }
};
/**
 * Получение списка вопросов для конкретной темы
 */
export const fetchQuestionsByTopic = async (topicId: string): Promise<Question[]> => {
    try {
        const questionsRef = collection(db, "questions");
        const q = query(
            questionsRef,
            where("topicId", "==", topicId)
        );
        const querySnapshot = await getDocs(q);

        const questions: Question[] = [];
        querySnapshot.forEach((doc) => {
            questions.push({ id: doc.id, ...doc.data() } as Question);
        });

        // Перемешиваем вопросы
        return questions.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error("Error fetching questions:", error);
        return [];
    }
};
