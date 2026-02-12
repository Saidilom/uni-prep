"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../store/useAuthStore";
import { getUserProfile } from "../lib/auth-utils";
import { useRouter, usePathname } from "next/navigation";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setLoading, user, isLoading } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setLoading(true);
            if (firebaseUser) {
                const profile = await getUserProfile(firebaseUser.uid);
                if (profile) {
                    setUser(profile);
                    // Если профиль есть и роль выбрана, но мы на логине или онбординге - в дашборд
                    if (profile.role && (pathname === "/login" || pathname === "/onboarding")) {
                        router.push("/");
                    } else if (!profile.role && pathname !== "/onboarding") {
                        // Если роль не выбрана - на онбординг
                        router.push("/onboarding");
                    }
                } else {
                    // Если профиля в БД нет - на онбординг для создания
                    setUser(null);
                    if (pathname !== "/onboarding") {
                        router.push("/onboarding");
                    }
                }
            } else {
                setUser(null);
                if (pathname !== "/login" && pathname !== "/") {
                    router.push("/login");
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUser, setLoading, router, pathname]);

    return <>{children}</>;
}
