import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { forbiddenResponse, isSameOriginRequest } from "@/lib/api-security";

function isHttpsRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isHttpsRequest(request),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
