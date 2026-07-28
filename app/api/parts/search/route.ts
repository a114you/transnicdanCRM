import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { searchPartsByCode } from "@/lib/parts/search";
import type { SearchPhase } from "@/lib/parts/suppliers/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const q = request.nextUrl.searchParams.get("q") || request.nextUrl.searchParams.get("code") || "";
  const skipCache = request.nextUrl.searchParams.get("fresh") === "1";
  const phaseRaw = (request.nextUrl.searchParams.get("phase") || "all").toLowerCase();
  const phase: SearchPhase =
    phaseRaw === "core" ||
    phaseRaw === "secondary" ||
    phaseRaw === "waf" ||
    phaseRaw === "all"
      ? (phaseRaw as SearchPhase)
      : "all";
  const suppliersParam = request.nextUrl.searchParams.get("suppliers");
  const suppliers = suppliersParam
    ? suppliersParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : undefined;

  if (q.trim().length < 3) {
    return NextResponse.json({ error: "Введите артикул (минимум 3 символа)" }, { status: 400 });
  }

  try {
    const data = await searchPartsByCode(q, { suppliers, skipCache, phase });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[parts/search]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка поиска" },
      { status: 500 }
    );
  }
}
