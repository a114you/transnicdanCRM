"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { getEmployees, getOrderById, getSuppliers, getWarehouseParts, getWorkTemplates, getReferrers } from "@/lib/supabase";
import type { Employee, OrderItemFormData, OrderStatus, OrderWithDetails, PaymentEntry, PaymentEntryMethod, PaymentMethod, Supplier, WarehousePart, WorkTemplate, Referrer } from "@/lib/types";
import { getDebtAmount, getPaidAmountFromEntries, calculateReferrerReward, money } from "@/lib/finance";
import { createId } from "@/lib/utils";
import { OrderItemsEditor } from "../../OrderItemsEditor";
import { OrderPaymentSection } from "../../OrderPaymentSection";
import { consumeCautpieseOrderItems, finalizeCautpieseAfterOrderSave } from "@/lib/parts/order-bridge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { tp } = useLanguage();
  const { showAlert } = useAppAlert();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [items, setItems] = useState<OrderItemFormData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouseParts, setWarehouseParts] = useState<WarehousePart[]>([]);
  const [workTemplates, setWorkTemplates] = useState<WorkTemplate[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>("");
  const [status, setStatus] = useState<OrderStatus>("Новый");
  const [carMileage, setCarMileage] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [debtStartedAt, setDebtStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  // Загрузка данных
  useEffect(() => {
    Promise.resolve().then(() => {
      setFetchError(false);
    });
    getOrderById(id)
      .then((data) => {
        if (data) {
          setOrder(data);
          setStatus(data.status as OrderStatus);
          setCarMileage(data.car_mileage || data.car.mileage || 0);
          setPaymentMethod(data.payment_method || "cash");
          setPaymentEntries(
            data.payment_entries?.length
              ? data.payment_entries
              : [{
                  id: "legacy",
                  method: data.payment_method === "mixed" ? "cash" : data.payment_method || "cash",
                  amount: data.paid_amount ?? data.total_amount,
                  paid_at: data.order_date.slice(0, 10),
                }]
          );
          setDebtStartedAt((data.debt_started_at || data.order_date).slice(0, 10));
          setNotes(data.notes || "");
          setSelectedReferrerId(data.referrer_id || "");
          const baseItems =
            data.items?.map((item) => ({
              type: item.type,
              mechanic_id: item.mechanic_id || "",
              mechanic_name: item.mechanic_name || "",
              source: item.source || "manual",
              warehouse_part_id: item.warehouse_part_id || "",
              supplier_id: item.supplier_id || "",
              supplier_name: item.supplier_name || "",
              name: item.name,
              code: item.type === "part" ? item.code || "" : "",
              brand: item.type === "part" ? item.brand || "" : "",
              quantity: item.quantity,
              selling_price: item.selling_price,
              cost_price: item.cost_price || 0,
              supplier_discount_percent: item.supplier_discount_percent || 0,
              tempId: item.id,
            })) || [];
          // CautPiese → this open order
          const fromParts = consumeCautpieseOrderItems({
            orderId: id,
            requireTargetMatch: true,
          });
          setItems(fromParts.length ? [...baseItems, ...fromParts] : baseItems);
          if (fromParts.length) {
            showAlert(
              `${tp("Добавлено из поиска запчастей")}: ${fromParts.length}. ${tp("Сохраните заказ.")}`,
              { variant: "success" }
            );
          }
        } else {
          setFetchError(true);
        }
      })
      .catch(() => setFetchError(true));

    Promise.all([getEmployees(true), getSuppliers(), getWarehouseParts(), getWorkTemplates(), getReferrers()]).then(([employeeData, supplierData, warehouseData, workData, referrerData]) => {
      setEmployees(employeeData);
      setSuppliers(supplierData);
      setWarehouseParts(warehouseData);
      setWorkTemplates(workData);
      setReferrers(referrerData.filter((r) => r.active));
    });
  }, [id]);

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.selling_price, 0);
  const paidAmount = getPaidAmountFromEntries(paymentEntries);
  const debtAmount = getDebtAmount(totalAmount, paidAmount);

  function handleStatusChange(newStatus: OrderStatus) {
    setStatus(newStatus);
    if (newStatus === "Готов" || newStatus === "Выдан") {
      if (totalAmount > 0) {
        setPaymentEntries([{
          id: createId(),
          method: "cash" as PaymentEntryMethod,
          amount: totalAmount,
          paid_at: new Date().toISOString().slice(0, 10),
        }]);
        setPaymentMethod("cash");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      showAlert(tp("Добавьте хотя бы одну позицию"), { variant: "warning" });
      return;
    }
    for (const item of items) {
      if (!item.name.trim()) {
        showAlert(tp("Все позиции должны иметь название"), { variant: "warning" });
        return;
      }
      if (item.quantity <= 0) {
        showAlert(tp("Количество должно быть больше 0"), { variant: "warning" });
        return;
      }
      if (item.selling_price <= 0) {
        showAlert(tp("Цена должна быть больше 0"), { variant: "warning" });
        return;
      }
      if (item.type === "work" && !item.mechanic_id) {
        showAlert(tp("Выберите исполнителя для каждой работы"), { variant: "warning" });
        return;
      }
      if (item.type === "part" && item.source === "warehouse") {
        const warehousePart = warehouseParts.find((part) => part.id === item.warehouse_part_id);
        if (!warehousePart) {
          showAlert(tp("Выберите запчасть со склада"), { variant: "warning" });
          return;
        }
        const originalQuantity = order?.items
          ?.filter((existing) => existing.warehouse_part_id === warehousePart.id)
          .reduce((sum, existing) => sum + existing.quantity, 0) || 0;
        if (item.quantity > warehousePart.quantity + originalQuantity) {
          showAlert(`${tp("На складе недостаточно запчасти")}: ${warehousePart.name}`, { variant: "warning" });
          return;
        }
      }
    }

    setLoading(true);
    try {
      const selectedReferrer = selectedReferrerId ? referrers.find((r) => r.id === selectedReferrerId) : null;
      const workRevenue = items.filter((i) => i.type === "work").reduce((sum, i) => sum + i.quantity * i.selling_price, 0);
      const referrerReward = calculateReferrerReward(workRevenue, selectedReferrer ? { reward_type: selectedReferrer.reward_type, reward_fixed: selectedReferrer.reward_fixed, reward_percent: selectedReferrer.reward_percent } : null);

      const response = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: {
          status,
          car_mileage: carMileage || undefined,
          payment_method: paymentMethod,
          payment_entries: paymentEntries,
          paid_amount: Math.min(paidAmount, totalAmount),
          debt_started_at: debtAmount > 0 ? debtStartedAt : null,
          notes: notes || undefined,
          referrer_id: selectedReferrer?.id || null,
          referrer_name: selectedReferrer?.full_name || null,
          referrer_reward: referrerReward.rewardAmount,
          referrer_reward_works: referrerReward.rewardBasis,
        },
          items,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || tp("Ошибка при обновлении заказа"));
      }

      finalizeCautpieseAfterOrderSave(items);
      router.push(`/orders/${id}`);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : tp("Ошибка при обновлении заказа"), { variant: "error" });
      setLoading(false);
    }
  }

  if (fetchError) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-red-500 font-semibold">{tp("Ошибка при обновлении заказа")}</p>
        <Link href="/orders">
          <Button variant="outline" className="h-11 px-5 text-sm rounded-xl">
            {tp("Отмена")}
          </Button>
        </Link>
      </div>
    );
  }

  if (!order) {
    return <div className="p-8 text-center min-h-[800px]">{tp("Загрузка...")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton href={`/orders/${id}`} label="Назад к заказу" ariaLabel="Назад к заказу" />
        <h1 className="text-3xl font-bold">{tp("Редактирование заказа")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Информация о заказе (только для чтения) */}
        <Card>
          <CardHeader>
            <CardTitle>{tp("Информация о заказе")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground text-sm">{tp("Клиент")}</div>
                <div className="font-medium">{order.client.full_name}</div>
                <div className="text-sm text-muted-foreground">{order.client.phone}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-sm">{tp("Автомобиль")}</div>
                <div className="font-medium">{order.car.brand} {order.car.model}</div>
                <div className="text-sm text-muted-foreground">{order.car.license_plate}</div>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-sm">{tp("Дата создания")}</div>
              <div>{format(new Date(order.order_date), "dd MMMM yyyy, HH:mm", { locale: ru })}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <OrderItemsEditor
              items={items}
              setItems={setItems}
              employees={employees}
              suppliers={suppliers}
              warehouseParts={warehouseParts}
              workTemplates={workTemplates}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tp("Данные ремонта")}</CardTitle>
          </CardHeader>
          <CardContent className="max-w-sm space-y-2">
            <Label htmlFor="car-mileage">{tp("Пробег на момент ремонта")}</Label>
            <NumberInput id="car-mileage" min="0" step="1" value={carMileage} onValueChange={setCarMileage} className="h-11" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <OrderPaymentSection
              totalAmount={totalAmount}
              paymentMethod={paymentMethod}
              paymentEntries={paymentEntries}
              debtStartedAt={debtStartedAt}
              setPaymentMethod={setPaymentMethod}
              setPaymentEntries={setPaymentEntries}
              setDebtStartedAt={setDebtStartedAt}
            />
          </CardContent>
        </Card>

        {/* Дополнительно */}
        <Card>
          <CardHeader>
            <CardTitle>{tp("Дополнительно")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order-status">{tp("Статус заказа")}</Label>
                <Select value={status} onValueChange={(value: string | null) => value && handleStatusChange(value as OrderStatus)}>
                  <SelectTrigger id="order-status" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Новый">{tp("Новый")}</SelectItem>
                    <SelectItem value="В работе">{tp("В работе")}</SelectItem>
                    <SelectItem value="Готов">{tp("Готов")}</SelectItem>
                    <SelectItem value="Выдан">{tp("Выдан")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-referrer">{tp("Реферал")}</Label>
                <Select
                  value={selectedReferrerId || "none"}
                  onValueChange={(v) => setSelectedReferrerId(v === "none" || !v ? "" : v)}
                >
                  <SelectTrigger id="order-referrer" className="h-11 w-full">
                    <SelectValue placeholder={tp("Выберите реферала")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tp("Без реферала")}</SelectItem>
                    {referrers.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name} —{" "}
                        {r.reward_type === "fixed"
                          ? `${money(r.reward_fixed)} MDL`
                          : `${r.reward_percent}%`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {referrers.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {tp("Нет активных рефералов — добавьте в разделе Рефералы")}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-notes">{tp("Примечания")}</Label>
              <Textarea
                id="order-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tp("Дополнительная информация о ремонте...")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button type="submit" disabled={loading} className="btn-garage h-11 px-5 text-sm flex-1">
            {loading ? tp("Сохранение...") : `${tp("Сохранить изменения")} (${totalAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL)`}
          </Button>
          <Link href={`/orders/${id}`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
              {tp("Отмена")}
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
