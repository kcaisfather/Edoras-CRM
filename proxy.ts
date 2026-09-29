import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isPublicPath } from "@/lib/permissions";
import { SERVER_REALTIME } from "@/lib/supabase/realtime";

/**
 * Oturum çerezini tazeler ve oturumsuz isteği /login'e yollar (Next 16: middleware → proxy).
 * Yetki (crm_staff) burada DEĞİL, /api uçlarında `requireStaff()` ile denetlenir; proxy yalnız
 * "oturum var mı" bakar. /api istekleri yönlendirilmez — uç 401 döner, istemci girişe atar.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    realtime: SERVER_REALTIME,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user && !pathname.startsWith("/api") && !isPublicPath(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    // _next, statik dosyalar ve uzantılı yollar (favicon, logo…) hariç her şey.
    "/((?!_next/static|_next/image|.*\\..*).*)",
  ],
};
