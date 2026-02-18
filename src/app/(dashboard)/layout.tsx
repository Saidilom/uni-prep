"use client";

import Navbar from "@/components/navbar";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-transparent">
                <div className="w-8 h-1 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-900 animate-[loading_1.5s_infinite_ease-in-out]"></div>
                </div>
                <style jsx>{`
          @keyframes loading {
            0% { width: 0%; transform: translateX(-100%); }
            50% { width: 100%; transform: translateX(0%); }
            100% { width: 0%; transform: translateX(100%); }
          }
        `}</style>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-transparent selection:bg-neutral-900 selection:text-white">
            <Navbar />
            <main className="max-w-6xl mx-auto px-6 py-24">
                {children}
            </main>
        </div>
    );
}
