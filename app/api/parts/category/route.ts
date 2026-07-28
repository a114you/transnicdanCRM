import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { compareCategory } from "@/lib/parts/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const id = request.nextUrl.searchParams.get("id") || "";
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  if (!id) {
    return NextResponse.json({ error: "id категории обязателен" }, { status: 400 });
  }

  try {
    const data = await compareCategory(id, { skipCache: fresh });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[parts/category]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка категории" },
      { status: 500 }
    );
  }
}
