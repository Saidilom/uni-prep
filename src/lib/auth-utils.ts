import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { User, UserRole } from "./firestore-schema";

const googleProvider = new GoogleAuthProvider();

/**
 * Вход через Google
 */
export const signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Error signing in with Google:", error);
        throw error;
    }
};

/**
 * Выход из системы
 */
export const logOut = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
};

/**
 * Получение профиля пользователя из Firestore
 */
export const getUserProfile = async (uid: string): Promise<User | null> => {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as User;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
};

/**
 * Генерация короткого ID (только англ буквы и цифры)
 */
const generateShortId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/**
 * Создание или обновление профиля пользователя
 */
export const createUserProfile = async (
    firebaseUser: FirebaseUser,
    role?: UserRole,
    subjects: string[] = [],
    name?: string,
    surname?: string
) => {
    try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const docSnap = await getDoc(userRef);

        // Если профиль уже есть, проверяем shortId
        let shortId = docSnap.exists() ? (docSnap.data() as User).shortId : "";
        if (!shortId) {
            shortId = generateShortId();
        }

        const userData: Partial<User> = {
            id: firebaseUser.uid,
            shortId,
            email: firebaseUser.email || "",
            name: name || firebaseUser.displayName || "Ученик",
            surname: surname || "",
            avatar: firebaseUser.photoURL || "",
            createdAt: docSnap.exists() ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (role) {
            userData.role = role;
            userData.subjects = subjects;
        }

        await setDoc(userRef, userData, { merge: true });

        // Get full updated data
        const finalSnap = await getDoc(userRef);
        return { id: firebaseUser.uid, ...finalSnap.data() } as User;
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
};

/**
 * Редактирование профиля пользователя
 */
export const updateUserProfile = async (uid: string, data: { name: string; surname?: string }) => {
    try {
        const userRef = doc(db, "users", uid);
        const updateData = {
            ...data,
            updatedAt: new Date().toISOString()
        };
        await setDoc(userRef, updateData, { merge: true });

        const finalSnap = await getDoc(userRef);
        return { id: uid, ...finalSnap.data() } as User;
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
};
