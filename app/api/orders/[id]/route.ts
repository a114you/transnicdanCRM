import { NextRequest, NextResponse } from "next/server";
import { updateOrder } from "@/lib/supabase";
import { forbiddenResponse, isSameOriginRequest, requireApiUser } from "@/lib/api-security";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const { id } = await params;

  try {
    const body = await request.json();
    const order = await updateOrder(id, body.order, body.items);
    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка при обновлении заказа";
    console.error("[API PUT /orders/:id] error:", error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
