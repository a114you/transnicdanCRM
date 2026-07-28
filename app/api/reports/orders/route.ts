import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrdersByDateRange } from "@/lib/supabase";
import { requireApiUser } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const q = (searchParams.get("q")?.trim().toLowerCase() || "").slice(0, 120);
  const clientIds = (searchParams.get("clientIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

  const allTime = searchParams.get("all") === "1" || (!start && !end);

  if (!allTime && (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)))) {
    return NextResponse.json({ error: "Missing date range" }, { status: 400 });
  }

  try {
    let orders = allTime ? await getOrders(5000) : await getOrdersByDateRange(start!, end!);

    if (clientIds.length > 0) {
      const allowed = new Set(clientIds);
      orders = orders.filter((order) => allowed.has(order.client_id));
    }

    if (q) {
      orders = orders.filter((order) => {
        const searchable = [
          order.id,
          order.client.full_name,
          order.client.phone,
          order.car.brand,
          order.car.model,
          order.car.license_plate,
          order.car.vin,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(q);
      });
    }

    return NextResponse.json(orders, {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load report data" },
      { status: 500 }
    );
  }
}
