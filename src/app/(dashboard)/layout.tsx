"use client";

import Sidebar from "@/components/sidebar";
import NavProgressBar from "@/components/nav-progress-bar";
import PageWrapper from "@/components/page-wrapper";
import Topbar from "@/components/topbar";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading } = useAuthStore();
    const { isCollapsed } = useSidebarStore();
    const router = useRouter();
    const pathname = usePathname();
    // "/" doubles as the public landing page for logged-out visitors (see
    // middleware.ts and auth-provider.tsx, which already exempt "/" from
    // their own anonymous-redirect-to-/login logic) — every other dashboard
    // route stays guarded exactly as before.
    const isPublicHome = pathname === "/";

    useEffect(() => {
        if (!isLoading && !user && !isPublicHome) {
            router.push("/login");
        }
    }, [user, isLoading, router, isPublicHome]);

    if (isLoading) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
            </div>
        );
    }

    if (!user) {
        // No sidebar/topbar chrome for the anonymous landing page.
        if (isPublicHome) return <>{children}</>;
        return null;
    }

    return (
        <div className="h-dvh max-h-dvh min-h-0 overflow-hidden bg-background">
            <Sidebar />
            <NavProgressBar />
            <main className={`flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background transition-[margin] duration-300 ease-in-out ${isCollapsed ? "md:ml-16" : "md:ml-64"}`}>
                <Topbar />
                <PageWrapper>{children}</PageWrapper>
            </main>
        </div>
    );
}
