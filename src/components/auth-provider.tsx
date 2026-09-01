"use client";

import { useEffect, useRef } from "react";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "../store/useAuthStore";
import { getUserProfile } from "../lib/auth-utils";
import { pageCache } from "@/lib/page-cache";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/locale-provider";
import { isLocale } from "@/lib/i18n/config";
import { sanitizeRedirectTarget } from "@/lib/redirect-safety";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// This subscription fires once per tab lifetime (see the comment on the
// effect below) — if the very first profile fetch after a real sign-in
// gives up too early, `user` is stuck at null for the rest of the session,
// even though the underlying Supabase session is perfectly valid. That
// showed up as a real production bug: a brand-new signup on Vercel would
// bounce home -> /login -> home in a fast loop (home's layout guard sees
// user=null and pushes to /login; /login sees a real session via its own
// getSession() call and bounces straight back), because Vercel's cold
// serverless start + first Supabase connection can easily take longer than
// a single 500ms retry. Retrying several times with backoff covers that
// cold-start window instead of permanently giving up on one bad attempt.
async function fetchProfileWithRetry(userId: string) {
    // getUserProfile is wrapped in pageCache (5 min TTL, survives client-side
    // navigation) — great for avoiding redundant fetches while browsing, but
    // wrong here: this runs on every auth-state-change event (a real sign-in,
    // a tab regaining a session, a token refresh), which is exactly when a
    // role/permission change made elsewhere (e.g. an admin promoting this
    // user in a different tab/session) needs to actually take effect. Without
    // this, a user already signed in when their role changes keeps seeing
    // their old role/permissions until the in-memory cache happens to expire
    // or they hard-refresh — confirmed as a real, confusing bug: promoting an
    // account to a new role and switching to it in the same browser session
    // still showed the old role.
    pageCache.invalidate(`userProfile:${userId}`);
    const delaysMs = [0, 600, 1500, 3000];
    let lastError: unknown;
    for (const delay of delaysMs) {
        if (delay > 0) await sleep(delay);
        try {
            return await getUserProfile(userId);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setLoading } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { locale, setLocale } = useLocale();

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
    const localeRef = useRef(locale);
    localeRef.current = locale;
    const setLocaleRef = useRef(setLocale);
    setLocaleRef.current = setLocale;

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
                    profile = await fetchProfileWithRetry(user.id);
                } catch {
                    // Infrastructure error fetching the profile even after
                    // several retries (network down, DB genuinely
                    // unreachable) — not proof the account is gone. Leave
                    // the store untouched rather than setting user to null,
                    // since that gets treated as "not logged in" by every
                    // protected layout downstream.
                    setLoading(false);
                    return;
                }
                if (profile) {
                    setUser(profile);
                    if (isLocale(profile.locale) && profile.locale !== localeRef.current) {
                        setLocaleRef.current(profile.locale);
                    }
                    if (profile.phone && (currentPathname === "/login" || currentPathname === "/onboarding")) {
                        router.replace(sanitizeRedirectTarget(redirectTarget ? decodeURIComponent(redirectTarget) : null));
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
