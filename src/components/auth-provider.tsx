"use client";

import { useEffect, useRef } from "react";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "../store/useAuthStore";
import { getUserProfile } from "../lib/auth-utils";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setLoading } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Read via refs inside the auth-event handler below instead of listing
    // pathname/searchParams as effect deps. Supabase fires INITIAL_SESSION
    // once on subscribe (covering the old separate getSession() call), so
    // this effect only needs to run once per app lifetime — not once per
    // navigation. Re-running it on every route change was tearing down and
    // rebuilding the whole auth subscription (+ re-fetching the profile, +
    // toggling isLoading true/false) on every sidebar click, which is what
    // made the dashboard flash its loading skeleton on every navigation.
    const pathnameRef = useRef(pathname);
    const searchParamsRef = useRef(searchParams);
    pathnameRef.current = pathname;
    searchParamsRef.current = searchParams;

    useEffect(() => {
        setLoading(true);

        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentPathname = pathnameRef.current;
            const redirectTarget = searchParamsRef.current?.get("redirectTo") ?? null;
            const user = session?.user ?? null;
            if (user) {
                const profile = await getUserProfile(user.id);
                if (profile) {
                    setUser(profile);
                    if (profile.phone && (currentPathname === "/login" || currentPathname === "/onboarding")) {
                        router.replace(redirectTarget ? decodeURIComponent(redirectTarget) : "/");
                    } else if (!profile.phone && currentPathname !== "/onboarding") {
                        router.replace(`/onboarding${redirectTarget ? `?redirectTo=${encodeURIComponent(redirectTarget)}` : ""}`);
                    }
                } else {
                    setUser(null);
                    if (currentPathname !== "/onboarding") router.replace(`/onboarding${redirectTarget ? `?redirectTo=${encodeURIComponent(redirectTarget)}` : ""}`);
                }
            } else {
                setUser(null);
                if (currentPathname !== "/login" && currentPathname !== "/") router.replace(`/login?redirectTo=${encodeURIComponent(currentPathname)}`);
            }
            setLoading(false);
        });

        return () => listener?.subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <>{children}</>;
}
