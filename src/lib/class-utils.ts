import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    arrayUnion,
    arrayRemove,
    deleteDoc,
    serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import { Class, User } from "./firestore-schema";

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
            createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, "classes"), classData);
        return { id: docRef.id, ...classData };
    } catch (error) {
        console.error("Error creating class:", error);
        throw error;
    }
};

/**
 * Получение всех классов конкретного учителя
 */
export const fetchTeacherClasses = async (teacherId: string): Promise<Class[]> => {
    try {
        const q = query(collection(db, "classes"), where("teacherId", "==", teacherId));
        const querySnapshot = await getDocs(q);
        const classes: Class[] = [];
        querySnapshot.forEach((doc) => {
            classes.push({ id: doc.id, ...doc.data() } as Class);
        });
        return classes;
    } catch (error) {
        console.error("Error fetching classes:", error);
        return [];
    }
};

/**
 * Поиск ученика по короткому ID
 */
export const findStudentById = async (shortId: string): Promise<User | null> => {
    try {
        const q = query(
            collection(db, "users"),
            where("shortId", "==", shortId.toUpperCase()),
            where("role", "==", "student")
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() } as User;
        }
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
        const classRef = doc(db, "classes", classId);
        await updateDoc(classRef, {
            students: arrayUnion(studentId),
        });
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
        const students: User[] = [];
        // Firestore 'in' query has a limit of 10 IDs. For simplicity, we fetch individually if small.
        // In production, you'd chunk this.
        for (const id of studentIds) {
            const userRef = doc(db, "users", id);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                students.push({ id: userSnap.id, ...userSnap.data() } as User);
            }
        }
        return students;
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
        const classRef = doc(db, "classes", classId);
        await updateDoc(classRef, {
            students: arrayRemove(studentId),
        });
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
        await deleteDoc(doc(db, "classes", classId));
    } catch (error) {
        console.error("Error deleting class:", error);
        throw error;
    }
};
