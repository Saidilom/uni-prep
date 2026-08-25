import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { usePlacementStore } from "@/store/usePlacementStore";
import supabase from "@/lib/supabase/client";
import { pageCache } from "@/lib/page-cache";
import { fetchUserPlacementAssignments } from "@/lib/registan-utils";
import type { PlacementAssignment } from "@/lib/firestore-schema";

const SEEN_KEY = "registan:placement-notified";

function getSeenIds(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

function markSeen(id: string) {
    const seen = getSeenIds();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
}

export function usePlacementNotifications() {
    const { user } = useAuthStore();
    const toast = useToast();
    const { setAssignments, setUnreadCount, incrementUnread } = usePlacementStore();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        if (!user) return;

        const notifyIfNew = (a: PlacementAssignment) => {
            if (a.status !== "assigned") return;
            const seen = getSeenIds();
            if (seen.has(a.id)) return;
            markSeen(a.id);
            toast.success("Новый Placement-тест назначен", {
                description: `${a.testTitle ?? "Placement-тест"} — нажмите «Placement» в меню, чтобы начать.`,
            });
            incrementUnread();
        };

        const load = async () => {
            const data = await fetchUserPlacementAssignments(user.id);
            setAssignments(data);
            const seen = getSeenIds();
            const unread = data.filter((a) => a.status === "assigned" && !seen.has(a.id)).length;
            setUnreadCount(unread);
        };

        load();

        const channel = supabase
            .channel(`placement_assignments:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "placement_assignments",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    pageCache.invalidatePrefix("placementAssignments:");
                    if (payload.eventType === "INSERT") {
                        const a = payload.new as PlacementAssignment;
                        notifyIfNew(a);
                        const current = usePlacementStore.getState().assignments;
                        setAssignments([a, ...current.filter((x) => x.id !== a.id)]);
                        return;
                    }
                    load();
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user, toast, setAssignments, setUnreadCount, incrementUnread]);
}

export function markPlacementAssignmentsSeen(assignmentIds: string[]) {
    const seen = getSeenIds();
    for (const id of assignmentIds) seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
    usePlacementStore.getState().markAllRead();
}
