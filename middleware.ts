import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";
  const isApi = path.startsWith("/api/");
  const isProtected =
    path === "/" ||
    path.startsWith("/passwords") ||
    path.startsWith("/documents") ||
    path.startsWith("/audit") ||
    isApi;

  if (!user && isProtected && !isLogin) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const role = user.app_metadata?.role;
    const allowed = role === "vault" || role === "super_admin";
    if (!allowed && isProtected) {
      await supabase.auth.signOut();
      if (isApi) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "forbidden");
      return NextResponse.redirect(url);
    }
    if (isLogin && allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/",
    "/passwords/:path*",
    "/documents/:path*",
    "/audit/:path*",
    "/api/:path*",
  ],
};
