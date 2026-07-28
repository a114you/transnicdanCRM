import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { forbiddenResponse, isSameOriginRequest } from "@/lib/api-security";

export const dynamic = "force-dynamic";

type LoginResult = {
  id: string;
  username: string;
  role: string;
  token_version: number;
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const windowMs = 10 * 60 * 1000;
const maxAttempts = 8;

function clientKey(request: NextRequest, username: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return `${ip}:${username.toLowerCase()}`;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > maxAttempts;
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpsRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const body = await request.json().catch(() => null) as { username?: string; password?: string; remember?: boolean } | null;
  const username = body?.username?.trim() || "";
  const password = body?.password || "";
  const remember = Boolean(body?.remember);
  const key = clientKey(request, username);

  if (username.length < 2 || username.length > 80 || password.length < 1 || password.length > 256) {
    await delay(350);
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("verify_crm_user", {
    p_username: username,
    p_password: password,
  });

  const user = Array.isArray(data) ? data[0] as LoginResult | undefined : data as LoginResult | null;
  if (error || !user?.id) {
    if (error) console.error("[auth/login] verify_crm_user failed:", error);
    await delay(500);
    if (recordFailedAttempt(key)) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  clearAttempts(key);

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role || "user",
    version: user.token_version ?? 1,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttpsRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
