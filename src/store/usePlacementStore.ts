import { create } from "zustand";
import type { PlacementAssignment } from "@/lib/firestore-schema";

interface PlacementState {
    assignments: PlacementAssignment[];
    unreadCount: number;
    setAssignments: (assignments: PlacementAssignment[]) => void;
    setUnreadCount: (count: number) => void;
    incrementUnread: () => void;
    markAllRead: () => void;
}

export const usePlacementStore = create<PlacementState>((set) => ({
    assignments: [],
    unreadCount: 0,
    setAssignments: (assignments) => set({ assignments }),
    setUnreadCount: (count) => set({ unreadCount: count }),
    incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
    markAllRead: () => set({ unreadCount: 0 }),
}));
