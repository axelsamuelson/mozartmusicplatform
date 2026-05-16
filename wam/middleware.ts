import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/search",
  "/item",
  "/playlists",
  "/profile",
];

/**
 * Supabase SSR stores session in cookies named like `sb-<project-ref>-auth-token`
 * (possibly chunked as `...auth-token.0`). No Supabase SDK here — avoids Edge bundles
 * that reference `__dirname` (ReferenceError on Vercel middleware).
 */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => {
    if (!name.startsWith("sb-")) return false;
    return name.includes("auth-token");
  });
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (!isProtected) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!hasSupabaseSessionCookie(request)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
