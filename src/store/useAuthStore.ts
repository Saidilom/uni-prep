import { create } from "zustand";
import { User } from "../lib/firestore-schema";

interface AuthState {
    user: User | null;
    isLoading: boolean;
    error: string | null;
    setUser: (user: User | null) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    error: null,
    setUser: (user) => set({ user, isLoading: false, error: null }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error, isLoading: false }),
    logout: () => set({ user: null, isLoading: false, error: null }),
}));
