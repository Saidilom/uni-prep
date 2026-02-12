import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp,
    CountSnapshot,
    getCountFromServer
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Получение статистики для дашборда
 */
export const fetchAdminStats = async () => {
    try {
        const subjectsCount = await getCountFromServer(collection(db, "subjects"));
        const textbooksCount = await getCountFromServer(collection(db, "textbooks"));
        const topicsCount = await getCountFromServer(collection(db, "topics"));
        const questionsCount = await getCountFromServer(collection(db, "questions"));
        const studentsCount = await getCountFromServer(query(collection(db, "users"), where("role", "==", "student")));
        const teachersCount = await getCountFromServer(query(collection(db, "users"), where("role", "==", "teacher")));

        return {
            subjects: subjectsCount.data().count,
            textbooks: textbooksCount.data().count,
            topics: topicsCount.data().count,
            questions: questionsCount.data().count,
            students: studentsCount.data().count,
            teachers: teachersCount.data().count,
        };
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        return { subjects: 0, textbooks: 0, topics: 0, questions: 0, students: 0, teachers: 0 };
    }
};

/**
 * Универсальный CRUD: Добавление
 */
export const adminAddItem = async (collectionName: string, data: any) => {
    try {
        const docRef = await addDoc(collection(db, collectionName), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: docRef.id, ...data };
    } catch (error) {
        console.error(`Error adding to ${collectionName}:`, error);
        throw error;
    }
};

/**
 * Универсальный CRUD: Удаление
 */
export const adminDeleteItem = async (collectionName: string, id: string) => {
    try {
        await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
        console.error(`Error deleting from ${collectionName}:`, error);
        throw error;
    }
};

/**
 * Универсальный CRUD: Обновление
 */
export const adminUpdateItem = async (collectionName: string, id: string, data: any) => {
    try {
        const docRef = doc(db, collectionName, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error(`Error updating ${collectionName}:`, error);
        throw error;
    }
};

/**
 * Получение всех элементов коллекции с сортировкой
 */
export const adminFetchCollection = async (collectionName: string, sortField: string = "createdAt") => {
    try {
        const q = query(collection(db, collectionName), orderBy(sortField, "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        return [];
    }
};
