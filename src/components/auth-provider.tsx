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

        const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
            const currentPathname = pathnameRef.current;
            const redirectTarget = searchParamsRef.current?.get("redirectTo") ?? null;
            const user = session?.user ?? null;
            // INITIAL_SESSION fires on every fresh page load/hard refresh where a
            // session already existed — that's normal browsing, not a new login,
            // and used to force-redirect anyone without a phone number to
            // /onboarding on every single reload, discarding whatever they were
            // doing (an in-progress exam, a form, scroll position). Only a real
            // SIGNED_IN event (actually logging in) should trigger that nag.
            const isFreshSignIn = event === "SIGNED_IN";
            if (user) {
                let profile;
                try {
                    profile = await getUserProfile(user.id);
                } catch {
                    // Infrastructure error fetching the profile (network hiccup,
                    // transient RLS/auth error while a token is still settling,
                    // most common right after a hard reload) — not proof the
                    // account is gone. Retry once before giving up, since giving
                    // up looks identical to "not this role" downstream and that
                    // gets treated as a hard redirect on role-gated pages.
                    try {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        profile = await getUserProfile(user.id);
                    } catch {
                        setLoading(false);
                        return;
                    }
                }
                if (profile) {
                    setUser(profile);
                    if (profile.phone && (currentPathname === "/login" || currentPathname === "/onboarding")) {
                        router.replace(redirectTarget ? decodeURIComponent(redirectTarget) : "/");
                    } else if (!profile.phone && currentPathname !== "/onboarding" && isFreshSignIn) {
                        router.replace(`/onboarding${redirectTarget ? `?redirectTo=${encodeURIComponent(redirectTarget)}` : ""}`);
                    }
                } else if (isFreshSignIn) {
                    setUser(null);
                    if (currentPathname !== "/onboarding") router.replace(`/onboarding${redirectTarget ? `?redirectTo=${encodeURIComponent(redirectTarget)}` : ""}`);
                } else {
                    // A non-fresh-sign-in event (e.g. a token refresh after the tab
                    // regained focus, or the profile cache expiring) that failed to
                    // re-fetch the profile is most likely a transient hiccup, not
                    // proof the account vanished — clearing `user` here would wipe
                    // out an already-known-good session and bounce role-gated pages
                    // (like /teacher/mock-tests) back to "/" for no real reason.
                    setLoading(false);
                    return;
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
