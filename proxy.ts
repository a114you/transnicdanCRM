import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const publicPaths = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/spark.svg",
  "/next.svg",
  "/vercel.svg",
  "/globe.svg",
  "/file.svg",
  "/window.svg",
];

function securityHeaders(response: NextResponse, pathname?: string) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Embed proxy must be frameable by same origin (cautpiese iframe)
  if (pathname?.startsWith("/api/parts/elcats-embed")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  }
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return response;
}

function isPublic(pathname: string, searchParams?: URLSearchParams) {
  if (publicPaths.includes(pathname) || pathname.startsWith("/_next/") || pathname.startsWith("/assets/")) return true;
  // Sharry short link redirects
  if (pathname.startsWith("/s/")) return true;
  // PDF share links with a valid share token
  if (pathname.match(/^\/orders\/[^/]+\/pdf$/) && searchParams?.has("share")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname, request.nextUrl.searchParams)) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (pathname === "/login" && session) {
      return securityHeaders(NextResponse.redirect(new URL("/", request.url)), pathname);
    }
    return securityHeaders(NextResponse.next(), pathname);
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return securityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), pathname);
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return securityHeaders(NextResponse.redirect(loginUrl), pathname);
  }

  return securityHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
