import { NextRequest, NextResponse } from "next/server";
import { searchClients } from "@/lib/supabase";
import { requireApiUser } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const query = (request.nextUrl.searchParams.get("q")?.trim() || "").slice(0, 80);

  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const clients = await searchClients(query);

  return NextResponse.json(clients.slice(0, 8), {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
    },
  });
}
