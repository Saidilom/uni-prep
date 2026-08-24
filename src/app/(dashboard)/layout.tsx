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
    const isTestPage = pathname?.startsWith("/test/");

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="flex h-dvh items-center justify-center bg-neutral-50">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600" />
            </div>
        );
    }

    if (!user) return null;

    /* ── Test page: full screen, no sidebar/topbar ── */
    if (isTestPage) {
        return (
            <div className="h-dvh max-h-dvh min-h-0 overflow-hidden bg-background">
                <NavProgressBar />
                {children}
            </div>
        );
    }

    return (
        <div className="h-dvh max-h-dvh min-h-0 overflow-hidden bg-muted/50 dark:bg-black">
            <Sidebar />
            <NavProgressBar />
            <main className={`flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-muted/50 dark:bg-black transition-[margin] duration-300 ease-in-out ${isCollapsed ? "md:ml-16" : "md:ml-64"}`}>
                <Topbar />
                <div className="mx-3 mb-3 mt-2 flex min-h-0 flex-1 flex-col sm:mx-5 sm:mb-5 sm:mt-4">
                    <PageWrapper>{children}</PageWrapper>
                </div>
            </main>
        </div>
    );
}
