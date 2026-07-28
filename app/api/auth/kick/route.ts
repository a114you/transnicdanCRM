import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { forbiddenResponse, isSameOriginRequest } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextVersion = currentUser.version + 1;

  // 1. Update the token version in the database (runs on server with service role key)
  const { error } = await supabase
    .from("crm_users")
    .update({ token_version: nextVersion })
    .eq("id", currentUser.userId);

  if (error) {
    console.error("[auth/kick] failed to update token version:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // 2. Broadcast the WebSocket kick event to all other tabs/devices and await completion
  const channel = supabase.channel(`user_sessions_${currentUser.userId}`, {
    config: {
      broadcast: { self: true },
    },
  });

  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.send({
            type: "broadcast",
            event: "kick",
            payload: { newVersion: nextVersion },
          });
        } catch (err) {
          console.error("[auth/kick] failed to send broadcast:", err);
        } finally {
          await supabase.removeChannel(channel);
          resolve();
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[auth/kick] subscription failed with status: ${status}`);
        resolve(); // resolve anyway so we don't hang the API request
      }
    });
  });

  // 3. Re-issue the session token for the current device with the new version
  const maxAge = 60 * 60 * 24 * 30; // Default to 30 days
  const token = await createSessionToken({
    userId: currentUser.userId,
    username: currentUser.username,
    role: currentUser.role,
    version: nextVersion,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}
