import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isSameOriginRequest } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      userId: currentUser.userId,
      username: currentUser.username,
      role: currentUser.role,
    },
  });
}
