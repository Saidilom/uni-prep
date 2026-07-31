"use client";

import { useEffect } from "react";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "../store/useAuthStore";
import { getUserProfile } from "../lib/auth-utils";
import { useRouter, usePathname } from "next/navigation";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setLoading } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const initializeAuth = async () => {
            setLoading(true);
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("Error fetching Supabase session:", sessionError);
                setUser(null);
                if (pathname !== "/login" && pathname !== "/") router.push("/login");
                setLoading(false);
                return;
            }

            const currentUser = sessionData?.session?.user ?? null;
            if (currentUser) {
                const profile = await getUserProfile(currentUser.id);
                if (profile) {
                    setUser(profile);
                    if (profile.role && (pathname === "/login" || pathname === "/onboarding")) {
                        router.push("/");
                    } else if (!profile.role && pathname !== "/onboarding") {
                        router.push("/onboarding");
                    }
                } else {
                    setUser(null);
                    if (pathname !== "/onboarding") router.push("/onboarding");
                }
            } else {
                setUser(null);
                if (pathname !== "/login" && pathname !== "/") router.push("/login");
            }
            setLoading(false);
        };

        initializeAuth();

        const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
            const user = session?.user ?? null;
            if (user) {
                const profile = await getUserProfile(user.id);
                if (profile) {
                    setUser(profile);
                    if (profile.role && (pathname === "/login" || pathname === "/onboarding")) {
                        router.push("/");
                    } else if (!profile.role && pathname !== "/onboarding") {
                        router.push("/onboarding");
                    }
                } else {
                    setUser(null);
                    if (pathname !== "/onboarding") router.push("/onboarding");
                }
            } else {
                setUser(null);
                if (pathname !== "/login" && pathname !== "/") router.push("/login");
            }
            setLoading(false);
        });

        return () => listener?.subscription.unsubscribe();
    }, [setUser, setLoading, router, pathname]);

    return <>{children}</>;
}
