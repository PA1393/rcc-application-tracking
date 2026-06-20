import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const { pathname } = req.nextUrl;

  // Unauthenticated users cannot access /admin
  if (pathname.startsWith("/admin") && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Authenticated users don't need to see /login
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
});

export const config = {
  // Run on /admin/** and /login only — skip everything else
  matcher: ["/admin/:path*", "/login"],
};
