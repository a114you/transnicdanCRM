import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./auth";

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = new Set<string>([request.nextUrl.origin]);
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  const hosts = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ].filter(Boolean) as string[];

  hosts.forEach((host) => {
    allowedOrigins.add(`${protocol}://${host}`);
  });

  const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  allowedDevOrigins.forEach((value) => {
    allowedOrigins.add(value.startsWith("http://") || value.startsWith("https://") ? value : `http://${value}`);
  });

  return allowedOrigins.has(origin);
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
