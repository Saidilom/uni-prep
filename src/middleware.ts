import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function resolveRedirectTarget(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const target = `${pathname}${search}`;
  return target === "/" ? null : target;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/onboarding" ||
    request.nextUrl.pathname === "/join";

  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");

  if (!user && !isAuthPage && request.nextUrl.pathname !== "/") {
    const target = resolveRedirectTarget(request);
    const loginUrl = new URL("/login", request.url);
    if (target) {
      loginUrl.searchParams.set("redirectTo", target);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Only worth the extra DB round-trip when the role actually gates
  // something (auth pages / admin routes) — every other navigation used to
  // pay for this query and throw the result away.
  if (user && (isAuthPage || isAdminPage)) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (isAuthPage && profile?.role) {
      const redirectTo = request.nextUrl.searchParams.get("redirectTo");
      const target = redirectTo ? decodeURIComponent(redirectTo) : "/";
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (isAdminPage && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
