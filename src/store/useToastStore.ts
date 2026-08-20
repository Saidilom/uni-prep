import { create } from "zustand";

export type ToastType = "success" | "warning" | "error" | "info";

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    description?: string;
    duration?: number;
}

interface ToastState {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, "id"> & { id?: string }) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    addToast: (toast) =>
        set((s) => ({
            toasts: [...s.toasts, { ...toast, id: toast.id || crypto.randomUUID() }],
        })),
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
