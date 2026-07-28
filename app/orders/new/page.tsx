"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { CarAutocompleteInput } from "@/components/fields/CarAutocompleteInput";
import { YearInput } from "@/components/fields/YearInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, ReceiptText, Search } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { searchClients, createOrder, getClientById, getEmployees, getSuppliers, getWarehouseParts, createClient, createCar, getWorkTemplates, getReferrers } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClientWithCars, Car, Employee, OrderItemFormData, OrderStatus, PaymentEntry, PaymentEntryMethod, PaymentMethod, Supplier, WarehousePart, WorkTemplate, Referrer } from "@/lib/types";
import { getDebtAmount, getPaidAmountFromEntries, calculateReferrerReward, money } from "@/lib/finance";
import { createId } from "@/lib/utils";
import { OrderItemsEditor } from "../OrderItemsEditor";
import { OrderPaymentSection } from "../OrderPaymentSection";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { consumeCautpieseOrderItems, finalizeCautpieseAfterOrderSave } from "@/lib/parts/order-bridge";

const ORDER_DRAFT_KEY = "crm:new-order-draft";
const CLIENT_LIST_PAGE_SIZE = 40;

interface NewOrderDraft {
  selectedClientId: string;
  selectedCarId: string;
  status: OrderStatus;
  items: OrderItemFormData[];
  carMileage: number;
  paymentMethod: PaymentMethod;
  paidAmountEdited: boolean;
  paymentEntries: PaymentEntry[];
  debtStartedAt: string;
  notes: string;
  savedAt?: string;
}

function NewOrderForm() {
  const router = useRouter();
  const { tp } = useLanguage();
  const { showAlert } = useAppAlert();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId");
  const preselectedCarId = searchParams.get("carId");

  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ClientWithCars[]>([]);
  const [searching, setSearching] = useState(false);
  const [clientList, setClientList] = useState<ClientWithCars[]>([]);
  const [clientListTotal, setClientListTotal] = useState(0);
  const [clientListLoading, setClientListLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithCars | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [status, setStatus] = useState<OrderStatus>("Новый");
  const [items, setItems] = useState<OrderItemFormData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouseParts, setWarehouseParts] = useState<WarehousePart[]>([]);
  const [workTemplates, setWorkTemplates] = useState<WorkTemplate[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>("");
  const [carMileage, setCarMileage] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paidAmountEdited, setPaidAmountEdited] = useState(false);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [debtStartedAt, setDebtStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const restoringDraftRef = useRef(true);
  const [isDirty, setIsDirty] = useState(false);

  // Quick Client/Car Creation Modal
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickCarBrand, setQuickCarBrand] = useState("");
  const [quickCarModel, setQuickCarModel] = useState("");
  const [quickCarYear, setQuickCarYear] = useState<number | undefined>(undefined);
  const [quickCarPlate, setQuickCarPlate] = useState("");
  const [quickCarVin, setQuickCarVin] = useState("");
  const [quickCarMileage, setQuickCarMileage] = useState<number | undefined>(undefined);
  const [quickLoading, setQuickLoading] = useState(false);

  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!quickName.trim() || !quickPhone.trim() || !quickCarBrand.trim() || !quickCarModel.trim()) {
      showAlert(tp("Заполните обязательные поля (ФИО, Телефон, Марка, Модель)"), { variant: "warning" });
      return;
    }
    setQuickLoading(true);
    try {
      const client = await createClient({
        full_name: quickName.trim(),
        phone: quickPhone.trim(),
      });
      const car = await createCar({
        client_id: client.id,
        brand: quickCarBrand.trim(),
        model: quickCarModel.trim(),
        year: quickCarYear || undefined,
        license_plate: quickCarPlate.trim().toUpperCase() || undefined,
        vin: quickCarVin.trim().toUpperCase() || undefined,
        mileage: quickCarMileage || undefined,
      });

      const clientWithCars: ClientWithCars = {
        ...client,
        cars: [car],
      };

      setSelectedClient(clientWithCars);
      setCars([car]);
      setSelectedCarId(car.id);
      setCarMileage(car.mileage || 0);
      setQuickClientOpen(false);
      setIsDirty(true);

      // Reset form
      setQuickName("");
      setQuickPhone("");
      setQuickCarBrand("");
      setQuickCarModel("");
      setQuickCarYear(undefined);
      setQuickCarPlate("");
      setQuickCarVin("");
      setQuickCarMileage(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : tp("Ошибка при быстром создании клиента");
      showAlert(message, { variant: "error" });
    } finally {
      setQuickLoading(false);
    }
  }

  // Unified initialization and draft restoring logic
  useEffect(() => {
    let active = true;
    restoringDraftRef.current = true;

    const initialize = async () => {
      const rawDraft = window.localStorage.getItem(ORDER_DRAFT_KEY);
      let draft: NewOrderDraft | null = null;
      if (rawDraft) {
        try {
          draft = JSON.parse(rawDraft) as NewOrderDraft;
        } catch {
          window.localStorage.removeItem(ORDER_DRAFT_KEY);
        }
      }

      // Determine if we should restore the draft
      const shouldRestore =
        draft &&
        draft.selectedClientId &&
        (!preselectedClientId || draft.selectedClientId === preselectedClientId);

      if (shouldRestore && draft) {
        try {
          const client = await getClientById(draft.selectedClientId);
          if (!active) return;

          if (client) {
            setSelectedClient(client);
            setCars(client.cars || []);
            setSelectedCarId(draft.selectedCarId || "");
            setStatus(draft.status || "Новый");
            setItems(draft.items || []);
            setCarMileage(Number(draft.carMileage) || 0);
            setPaymentMethod(draft.paymentMethod || "cash");
            setPaidAmountEdited(Boolean(draft.paidAmountEdited));
            setPaymentEntries(draft.paymentEntries || []);
            setDebtStartedAt(draft.debtStartedAt || new Date().toISOString().slice(0, 10));
            setNotes(draft.notes || "");
            setDraftRestored(true);
          } else {
            if (preselectedClientId) {
              const freshClient = await getClientById(preselectedClientId);
              if (active && freshClient) {
                setSelectedClient(freshClient);
                setCars(freshClient.cars || []);
                if (preselectedCarId) {
                  setSelectedCarId(preselectedCarId);
                  const preselectedCar = freshClient.cars?.find((car) => car.id === preselectedCarId);
                  setCarMileage(preselectedCar?.mileage || 0);
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to restore draft:", error);
        }
      } else {
        if (preselectedClientId) {
          try {
            const client = await getClientById(preselectedClientId);
            if (!active) return;

            if (client) {
              setSelectedClient(client);
              setCars(client.cars || []);
              if (preselectedCarId) {
                setSelectedCarId(preselectedCarId);
                const preselectedCar = client.cars?.find((car) => car.id === preselectedCarId);
                setCarMileage(preselectedCar?.mileage || 0);
              }
            }
          } catch (error) {
            console.error("Failed to load preselected client:", error);
          }
        }
      }

      // CautPiese → order bridge (only when no existing-order target)
      if (active) {
        const fromParts = consumeCautpieseOrderItems({ requireTargetMatch: true });
        if (fromParts.length) {
          setItems((prev) => [...prev, ...fromParts]);
          setIsDirty(true);
          showAlert(
            `${tp("Добавлено из поиска запчастей")}: ${fromParts.length}`,
            { variant: "success" }
          );
        }
        restoringDraftRef.current = false;
      }
    };

    initialize();

    return () => {
      active = false;
    };
  }, [preselectedClientId, preselectedCarId]);

  useEffect(() => {
    Promise.all([getEmployees(), getSuppliers(), getWarehouseParts(), getWorkTemplates(), getReferrers()]).then(([employeeData, supplierData, warehouseData, workData, referrerData]) => {
      setEmployees(employeeData);
      setSuppliers(supplierData);
      setWarehouseParts(warehouseData);
      setWorkTemplates(workData);
      setReferrers(referrerData.filter((r) => r.active));
    });
  }, []);

  async function loadClientList(offset = 0) {
    setClientListLoading(true);
    try {
      const response = await fetch(`/api/clients?limit=${CLIENT_LIST_PAGE_SIZE}&offset=${offset}`);
      if (!response.ok) throw new Error("Failed to load clients");
      const payload = await response.json() as { clients: ClientWithCars[]; total: number };
      setClientList((current) => offset === 0 ? payload.clients : [...current, ...payload.clients]);
      setClientListTotal(payload.total || 0);
    } catch {
      if (offset === 0) {
        setClientList([]);
        setClientListTotal(0);
      }
    } finally {
      setClientListLoading(false);
    }
  }

  useEffect(() => {
    if (selectedClient || clientList.length > 0 || clientListLoading) return;
    loadClientList();
  }, [selectedClient, clientList.length, clientListLoading]);

  // Debounced client search
  useEffect(() => {
    if (!clientSearch.trim()) {
      const timeout = setTimeout(() => {
        setSearchResults([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(timeout);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchClients(clientSearch);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [clientSearch]);

  function selectClient(client: ClientWithCars) {
    setSelectedClient(client);
    const clientCars = client.cars || [];
    setCars(clientCars);
    if (clientCars.length === 1) {
      setSelectedCarId(clientCars[0].id);
      setCarMileage(clientCars[0].mileage || 0);
    } else {
      setSelectedCarId("");
    }
    setSearchResults([]);
    setClientSearch("");
    setIsDirty(true);
  }

  const hasMoreClients = clientList.length < clientListTotal;

  function selectCar(carId: string) {
    setSelectedCarId(carId);
    const car = cars.find((candidate) => candidate.id === carId);
    setCarMileage(car?.mileage || 0);
    setIsDirty(true);
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);
  const effectivePaymentEntries = paidAmountEdited ? paymentEntries : [];
  const effectivePaidAmount = getPaidAmountFromEntries(effectivePaymentEntries);
  const debtAmount = getDebtAmount(totalAmount, effectivePaidAmount);

  // User-initiated change handlers to track dirty state
  const handleSetItems = (newItems: React.SetStateAction<OrderItemFormData[]>) => {
    setItems(newItems);
    setIsDirty(true);
  };

  const handleSetCarMileage = (mileage: number) => {
    setCarMileage(mileage);
    setIsDirty(true);
  };

  const handleSetPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setIsDirty(true);
  };

  const handleSetPaymentEntries = (entries: PaymentEntry[]) => {
    setPaidAmountEdited(true);
    setPaymentEntries(entries);
    setIsDirty(true);
  };

  const handleSetDebtStartedAt = (date: string) => {
    setDebtStartedAt(date);
    setIsDirty(true);
  };

  function handleStatusChange(newStatus: OrderStatus) {
    setStatus(newStatus);
    setIsDirty(true);
    if (newStatus === "Готов" || newStatus === "Выдан") {
      if (totalAmount > 0) {
        setPaymentEntries([{
          id: createId(),
          method: "cash" as PaymentEntryMethod,
          amount: totalAmount,
          paid_at: new Date().toISOString().slice(0, 10),
        }]);
        setPaymentMethod("cash");
        setPaidAmountEdited(true);
      }
    }
  }

  useEffect(() => {
    if (restoringDraftRef.current || !selectedClient || !isDirty) return;

    const timer = window.setTimeout(() => {
      const savedAt = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const draft: NewOrderDraft = {
        selectedClientId: selectedClient.id,
        selectedCarId,
        status,
        items,
        carMileage,
        paymentMethod,
        paidAmountEdited,
        paymentEntries,
        debtStartedAt,
        notes,
        savedAt,
      };

      window.localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(savedAt);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [selectedClient, selectedCarId, status, items, carMileage, paymentMethod, paidAmountEdited, paymentEntries, debtStartedAt, notes, isDirty]);

  function clearDraft() {
    window.localStorage.removeItem(ORDER_DRAFT_KEY);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setIsDirty(false);

    // Reset all form states to initial values
    setSelectedClient(null);
    setCars([]);
    setSelectedCarId("");
    setStatus("Новый");
    setItems([]);
    setCarMileage(0);
    setPaymentMethod("cash");
    setPaidAmountEdited(false);
    setPaymentEntries([]);
    setDebtStartedAt(new Date().toISOString().slice(0, 10));
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient || !selectedCarId) {
      showAlert(tp("Выберите клиента и автомобиль"), { variant: "warning" });
      return;
    }
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
        if (item.quantity > warehousePart.quantity) {
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

      const order = await createOrder(
        {
          client_id: selectedClient.id,
          car_id: selectedCarId,
          car_mileage: carMileage || undefined,
          status,
          order_date: new Date().toISOString(),
          payment_method: paymentMethod,
          payment_entries: effectivePaymentEntries,
          paid_amount: Math.min(effectivePaidAmount, totalAmount),
          debt_started_at: debtAmount > 0 ? debtStartedAt : null,
          notes: notes || undefined,
          referrer_id: selectedReferrer?.id || null,
          referrer_name: selectedReferrer?.full_name || null,
          referrer_reward: referrerReward.rewardAmount,
          referrer_reward_works: referrerReward.rewardBasis,
        },
        items
      );
      clearDraft();
      // Basket / transfer fully done after save
      finalizeCautpieseAfterOrderSave(items);
      router.push(`/orders/${order.id}`);
    } catch {
      showAlert(tp("Ошибка при создании заказа"), { variant: "error" });
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3 sm:gap-4">
        <BackButton href="/orders" label="Назад к списку ремонтов" ariaLabel="Назад к списку ремонтов" />
        <h1 className="min-w-0 text-2xl font-bold sm:text-3xl">{tp("Новый ремонт")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {(draftRestored || draftSavedAt) && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="flex items-start gap-3">
              <ReceiptText className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <div className="font-bold text-foreground">
                  {draftRestored ? tp("Черновик заказа восстановлен") : tp("Черновик заказа сохранен")}
                </div>
                <div className="text-muted-foreground">
                  {draftSavedAt ? `${tp("Последнее сохранение:")} ${draftSavedAt}` : tp("Данные сохраняются автоматически при заполнении")}
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={clearDraft} className="h-9 w-full rounded-lg px-4 text-xs sm:w-auto">
              {tp("Очистить черновик")}
            </Button>
          </div>
        )}

        {/* Выбор клиента */}
        <Card>
          <CardHeader>
            <CardTitle>{tp("Клиент")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedClient ? (
              <div className="space-y-4">
                <Label htmlFor="client-search">{tp("Выберите клиента из списка или найдите по ФИО/телефону")}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="client-search"
                    placeholder={tp("Поиск по ФИО или телефону...")}
                    value={clientSearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClientSearch(value);
                      if (value.trim()) {
                        setSearching(true);
                      } else {
                        setSearchResults([]);
                        setSearching(false);
                      }
                    }}
                    className="h-11 pl-9 pr-10"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />}
                </div>
                {clientSearch.trim() ? (
                  searching ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tp("Загрузка...")}
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="border rounded-lg divide-y">
                      {searchResults.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => selectClient(client)}
                          className="w-full text-left p-3 hover:bg-primary/5 transition"
                        >
                          <div className="font-medium">{client.full_name}</div>
                          <div className="text-sm text-muted-foreground">{client.phone}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                      {tp("Ничего не найдено")}
                    </div>
                  )
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
                      <div className="text-xs font-bold uppercase text-muted-foreground">{tp("Список клиентов")}</div>
                      {clientListTotal > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {clientList.length} / {clientListTotal}
                        </div>
                      )}
                    </div>
                    <div className="styled-scrollbar max-h-[52vh] min-h-80 overflow-y-auto divide-y divide-border/60">
                      {clientList.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => selectClient(client)}
                          className="group flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 focus-visible:bg-primary/5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{client.full_name}</div>
                            <div className="mt-0.5 text-sm text-muted-foreground">{client.phone}</div>
                            {client.cars && client.cars.length > 0 && (
                              <div className="mt-1 truncate text-xs text-muted-foreground">
                                {client.cars.map((car) => `${car.brand} ${car.model}${car.license_plate ? ` - ${car.license_plate}` : ""}`).join(", ")}
                              </div>
                            )}
                          </div>
                          <div className="mt-0.5 rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground group-hover:border-primary/40 group-hover:text-primary">
                            {tp("Выбрать")}
                          </div>
                        </button>
                      ))}
                      {clientListLoading && clientList.length === 0 && (
                        <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {tp("Загрузка...")}
                        </div>
                      )}
                      {clientList.length === 0 && !clientListLoading && (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          {tp("Пока нет клиентов в базе")}
                        </div>
                      )}
                      {hasMoreClients && (
                        <div className="p-3 text-center">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => loadClientList(clientList.length)}
                            disabled={clientListLoading}
                            className="h-9 w-full rounded-lg px-4 text-xs sm:w-auto"
                          >
                            {clientListLoading ? tp("Загрузка...") : `${tp("Показать еще")} ${Math.min(CLIENT_LIST_PAGE_SIZE, clientListTotal - clientList.length)}`}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {tp("Нет клиента в базе?")}{" "}
                  <Button
  type="button"
  variant="link"
  className="text-primary hover:underline p-0 h-auto font-normal text-sm"
  onClick={() => setQuickClientOpen(true)}
>
  {tp("Создать нового")}
</Button>
{/* Quick Create Client Modal */}
<Dialog open={quickClientOpen} onOpenChange={setQuickClientOpen}>
                  <DialogContent className="glass-card sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{tp("Быстрое создание клиента")}</DialogTitle>
      <DialogDescription>{tp("Заполните поля ниже для создания клиента и его автомобиля.")}</DialogDescription>
    </DialogHeader>
    <form onSubmit={handleQuickCreate} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="quick-name">{tp("ФИО клиента")}</Label>
        <Input id="quick-name" autoComplete="name" value={quickName} onChange={e => setQuickName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-phone">{tp("Телефон")}</Label>
        <Input id="quick-phone" type="tel" autoComplete="tel" value={quickPhone} onChange={e => setQuickPhone(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-brand">{tp("Марка автомобиля")}</Label>
        <CarAutocompleteInput id="quick-car-brand" type="make" value={quickCarBrand} onChange={setQuickCarBrand} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-model">{tp("Модель автомобиля")}</Label>
        <CarAutocompleteInput id="quick-car-model" type="model" make={quickCarBrand} value={quickCarModel} onChange={setQuickCarModel} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-year">{tp("Год выпуска")}</Label>
        <YearInput id="quick-car-year" value={quickCarYear} onValueChange={setQuickCarYear} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-plate">{tp("Госномер")}</Label>
        <Input id="quick-car-plate" value={quickCarPlate} onChange={e => setQuickCarPlate(e.target.value.toUpperCase())} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-vin">{tp("VIN")}</Label>
        <Input id="quick-car-vin" value={quickCarVin} maxLength={17} onChange={e => setQuickCarVin(e.target.value.toUpperCase())} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-car-mileage">{tp("Пробег")}</Label>
        <NumberInput id="quick-car-mileage" value={quickCarMileage} onValueChange={v => setQuickCarMileage(v)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setQuickClientOpen(false)} disabled={quickLoading}>
          {tp("Отмена")}
        </Button>
        <Button type="submit" disabled={quickLoading}>
          {quickLoading ? tp("Сохранение...") : tp("Создать")}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg bg-secondary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{selectedClient.full_name}</div>
                  <div className="text-sm text-muted-foreground">{selectedClient.phone}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedClient(null); setSelectedCarId(""); }} className="h-9 w-full rounded-lg px-4 text-xs sm:w-auto">
                  {tp("Изменить")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Выбор автомобиля */}
        {selectedClient && (
          <Card>
            <CardHeader>
              <CardTitle>{tp("Автомобиль")}</CardTitle>
            </CardHeader>
            <CardContent>
              {cars.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-2">{tp("У клиента нет добавленных автомобилей")}</p>
                  <Link href={`/clients/${selectedClient.id}`}>
                    <Button type="button" variant="outline" className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
                      <Plus className="h-4 w-4 mr-2" />
                      {tp("Добавить автомобиль")}
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="car-select">{tp("Выберите автомобиль")}</Label>
                  <Select value={selectedCarId} onValueChange={(value) => value && selectCar(value)}>
                    <SelectTrigger id="car-select" className="h-11 w-full">
                      <SelectValue placeholder={tp("Выберите автомобиль")} />
                    </SelectTrigger>
                  <SelectContent>
                    {cars.map((car) => (
                      <SelectItem key={car.id} value={car.id}>
                        {car.brand} {car.model} {car.year && `(${car.year})`} {car.license_plate && `- ${car.license_plate}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Статус и примечания */}
        {selectedClient && selectedCarId && (
          <>
            <Card>
              <CardContent className="pt-6">
                <OrderItemsEditor
                  items={items}
                  setItems={handleSetItems}
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
                <NumberInput id="car-mileage" min="0" step="1" value={carMileage} onValueChange={handleSetCarMileage} className="h-11" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <OrderPaymentSection
                  totalAmount={totalAmount}
                  paymentMethod={paymentMethod}
                  paymentEntries={effectivePaymentEntries}
                  debtStartedAt={debtStartedAt}
                  setPaymentMethod={handleSetPaymentMethod}
                  setPaymentEntries={handleSetPaymentEntries}
                  setDebtStartedAt={handleSetDebtStartedAt}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{tp("Дополнительно")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="order-status">{tp("Статус заказа")}</Label>
                    <Select value={status} onValueChange={(value) => {
                      if (value) {
                        handleStatusChange(value as OrderStatus);
                      }
                    }}>
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
                      onValueChange={(v) => {
                        setSelectedReferrerId(v === "none" || !v ? "" : v);
                        setIsDirty(true);
                      }}
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
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={tp("Дополнительная информация о ремонте...")}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Button type="submit" disabled={loading} className="btn-garage h-11 flex-1 px-5 text-sm">
                {loading ? tp("Сохранение...") : `${tp("Сохранить заказ")} (${totalAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL)`}
              </Button>
              <Link href="/orders" className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
                  {tp("Отмена")}
                </Button>
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center min-h-[800px]">Загрузка...</div>}>
      <NewOrderForm />
    </Suspense>
  );
}
