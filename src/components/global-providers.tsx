"use client";

import { Toaster } from "@/components/toaster";
import { usePlacementNotifications } from "@/hooks/usePlacementNotifications";

export function GlobalProviders({ children }: { children: React.ReactNode }) {
    usePlacementNotifications();
    return (
        <>
            {children}
            <Toaster />
        </>
    );
}
