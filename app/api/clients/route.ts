import { NextRequest, NextResponse } from "next/server";
import { getClientsCount, getClientsList } from "@/lib/supabase";
import { requireApiUser } from "@/lib/api-security";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 40, 1), 80);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);
  const [clients, total] = await Promise.all([
    getClientsList(limit, offset),
    getClientsCount(),
  ]);

  return NextResponse.json({
    clients,
    total,
    nextOffset: offset + clients.length,
    hasMore: offset + clients.length < total,
  });
}
