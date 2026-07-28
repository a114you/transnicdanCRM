import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, isSameOriginRequest, requireApiUser } from "@/lib/api-security";
import * as db from "@/lib/supabase";

export const dynamic = "force-dynamic";

const actions = {
  getClients: db.getClients,
  getClientsList: db.getClientsList,
  getClientsCount: db.getClientsCount,
  getDashboardCounts: db.getDashboardCounts,
  searchClients: db.searchClients,
  getClientById: db.getClientById,
  createClient: db.createClient,
  updateClient: db.updateClient,
  deleteClient: db.deleteClient,
  getCarsByClientId: db.getCarsByClientId,
  getCarById: db.getCarById,
  createCar: db.createCar,
  updateCar: db.updateCar,
  deleteCar: db.deleteCar,
  transferCar: db.transferCar,
  getOrders: db.getOrders,
  getOrdersByClientId: db.getOrdersByClientId,
  getOrderById: db.getOrderById,
  getTodaysOrders: db.getTodaysOrders,
  getOrdersByDateRange: db.getOrdersByDateRange,
  createOrder: db.createOrder,
  updateOrder: db.updateOrder,
  deleteOrder: db.deleteOrder,
  getEmployees: db.getEmployees,
  createEmployee: db.createEmployee,
  updateEmployee: db.updateEmployee,
  deleteEmployee: db.deleteEmployee,
  getSuppliers: db.getSuppliers,
  createSupplier: db.createSupplier,
  updateSupplier: db.updateSupplier,
  deleteSupplier: db.deleteSupplier,
  getReferrers: db.getReferrers,
  createReferrer: db.createReferrer,
  updateReferrer: db.updateReferrer,
  deleteReferrer: db.deleteReferrer,
  getCompanyInfo: db.getCompanyInfo,
  getRawCompanyInfo: db.getRawCompanyInfo,
  updateCompanyInfo: db.updateCompanyInfo,
  getWarehouseParts: db.getWarehouseParts,
  createWarehousePart: db.createWarehousePart,
  updateWarehousePart: db.updateWarehousePart,
  deleteWarehousePart: db.deleteWarehousePart,
  getWorkTemplates: db.getWorkTemplates,
  createWorkTemplate: db.createWorkTemplate,
  updateWorkTemplate: db.updateWorkTemplate,
  deleteWorkTemplate: db.deleteWorkTemplate,
  getWarehouseMovements: db.getWarehouseMovements,
  createWarehouseMovement: db.createWarehouseMovement,
  globalSearch: db.globalSearch,
} as const;

type ActionName = keyof typeof actions;

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const payload = await request.json().catch(() => null) as { action?: string; args?: unknown[] } | null;
  const action = payload?.action as ActionName | undefined;
  if (!action || !(action in actions)) {
    return NextResponse.json({ error: "Unknown database action" }, { status: 400 });
  }

  try {
    const result = await (actions[action] as (...args: unknown[]) => Promise<unknown>)(...(payload?.args || []));
    return NextResponse.json(result ?? null, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(`[api/db] ${action} failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database action failed" },
      { status: 500 }
    );
  }
}
