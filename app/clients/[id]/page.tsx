"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Phone, Mail, Car, FileText, Edit, User, Calendar, CreditCard, ChevronRight, Trash2, Search, X, Loader2, ArrowRightLeft } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { getClientById, getOrdersByClientId, deleteCar, deleteClient, transferCar, searchClients, deleteOrder } from "@/lib/supabase";
import type { ClientWithCars, OrderWithDetails, Car as CarType, Client } from "@/lib/types";
import { format } from "date-fns";
import { ru, ro } from "date-fns/locale";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { getPaymentStatusLabel } from "@/lib/finance";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { showAlert } = useAppAlert();
  const { tp, language } = useLanguage();
  const dateLocale = language === "ro" ? ro : ru;
  const [client, setClient] = useState<ClientWithCars | null>(null);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [carToDelete, setCarToDelete] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [clientDeleteOpen, setClientDeleteOpen] = useState(false);
  const [clientConfirmText, setClientConfirmText] = useState("");
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [orderConfirmText, setOrderConfirmText] = useState("");
  // Transfer car state
  const [transferCarId, setTransferCarId] = useState<string | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferResults, setTransferResults] = useState<Client[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [selectedTransferClient, setSelectedTransferClient] = useState<Client | null>(null);
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");

  useEffect(() => {
    Promise.all([getClientById(id), getOrdersByClientId(id)])
      .then(([clientData, ordersData]) => {
        if (!clientData) {
          router.push("/clients");
          return;
        }
        setClient(clientData);
        setOrders(ordersData);
      })
      .catch(() => {
        // Error loading client - will redirect in finally
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const statusColors: Record<string, string> = {
    "Новый": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "В работе": "bg-amber-500/10 text-amber-500 border-amber-500/20",
    "Готов": "bg-green-500/10 text-green-500 border-green-500/20",
    "Выдан": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };

  function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const term = query.trim();
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-green-200 dark:bg-green-900/40 text-foreground rounded px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  }

  function orderMatchesSearch(order: OrderWithDetails, q: string): { match: boolean; matchText: string } {
    if (!q.trim()) return { match: true, matchText: "" };
    const term = q.trim().toLowerCase();

    // Search in order ID
    if (order.id.toLowerCase().includes(term)) {
      return { match: true, matchText: `#${order.id.slice(0, 8)}` };
    }

    // Search in items
    for (const item of order.items || []) {
      const fields = [item.name, item.code, item.brand].filter(Boolean);
      for (const field of fields) {
        if (field!.toLowerCase().includes(term)) {
          return { match: true, matchText: field! };
        }
      }
    }

    // Search in car info
    const carStr = `${order.car?.brand || ""} ${order.car?.model || ""} ${order.car?.license_plate || ""}`;
    if (carStr.toLowerCase().includes(term)) {
      return { match: true, matchText: carStr.trim() };
    }

    return { match: false, matchText: "" };
  }

  const filteredOrders = useMemo(() => {
    if (!historyQuery.trim()) return orders;
    return orders.filter((order) => orderMatchesSearch(order, historyQuery).match);
  }, [orders, historyQuery]);

  function openDeleteDialog(carId: string) {
    setCarToDelete(carId);
    setConfirmText("");
  }

  async function handleDeleteCar() {
    if (!carToDelete || !client) return;
    try {
      await deleteCar(carToDelete);
      setClient({ ...client, cars: client.cars.filter((c: CarType) => c.id !== carToDelete) });
      const updatedOrders = await getOrdersByClientId(id);
      setOrders(updatedOrders);
      setCarToDelete(null);
    } catch {
      showAlert(tp("Ошибка при удалении автомобиля"), { variant: "error" });
    }
  }

  function openDeleteOrderDialog(orderId: string) {
    setOrderToDelete(orderId);
    setOrderConfirmText("");
  }

  async function handleDeleteOrder() {
    if (!orderToDelete || !client) return;
    try {
      await deleteOrder(orderToDelete);
      setOrders(orders.filter((o) => o.id !== orderToDelete));
      setOrderToDelete(null);
    } catch {
      showAlert(tp("Ошибка при удалении заказа"), { variant: "error" });
    }
  }

  async function handleDeleteClient() {
    if (!client) return;
    try {
      await deleteClient(client.id);
      router.push("/clients");
    } catch {
      showAlert(tp("Ошибка при удалении клиента"), { variant: "error" });
    }
  }

  // Debounced search for transfer target client
  useEffect(() => {
    if (!transferSearch.trim()) return;
    if (transferTimeoutRef.current) clearTimeout(transferTimeoutRef.current);
    transferTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchClients(transferSearch);
        // Exclude current client
        setTransferResults(results.filter((c) => c.id !== id));
      } catch {
        setTransferResults([]);
      } finally {
        setTransferLoading(false);
      }
    }, 300);
    return () => {
      if (transferTimeoutRef.current) clearTimeout(transferTimeoutRef.current);
    };
  }, [transferSearch, id]);

  async function handleTransferCar() {
    if (!transferCarId || !selectedTransferClient || !client) return;
    try {
      await transferCar(transferCarId, selectedTransferClient.id);
      setClient({ ...client, cars: client.cars.filter((c: CarType) => c.id !== transferCarId) });
      const updatedOrders = await getOrdersByClientId(id);
      setOrders(updatedOrders);
      setTransferCarId(null);
      setTransferSearch("");
      setTransferResults([]);
      setSelectedTransferClient(null);
    } catch {
      showAlert(tp("Ошибка при передаче автомобиля"), { variant: "error" });
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse min-h-[800px]">
        {tp("Загрузка...")}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {tp("Клиент не найден")}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* HEADER SECTION with back navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-6 glass-card bg-secondary/5 border-white/5">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton href="/clients" label={tp("Назад к списку клиентов")} ariaLabel={tp("Назад к списку клиентов")} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 flex-shrink-0 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{tp("Карточка клиента")}</span>
            </div>
            <h1 className="mt-0.5 break-words text-xl min-[390px]:text-2xl font-extrabold uppercase tracking-wider text-foreground sm:text-3xl">
              {client.full_name}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{client.cars?.length || 0} {tp("авто")}</span>
              <span>·</span>
              <span>{orders.length} {tp("ремонтов")}</span>
              {orders.length > 0 && (
                <>
                  <span>·</span>
                  <span className="tabular-nums font-semibold text-foreground/80">
                    {orders.reduce((s, o) => s + (o.total_amount || 0), 0).toLocaleString("ro-MD", { maximumFractionDigits: 0 })} MDL
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto sm:items-center">
          <Link href={`/clients/${id}/edit`} className="min-w-0">
            <Button variant="outline" className="h-11 w-full rounded-xl border-border/60 px-5 text-sm font-semibold uppercase tracking-wider transition-colors duration-150 hover:bg-primary/5 hover:text-primary" style={{ fontFamily: 'var(--font-oswald)' }}>
              <Edit className="h-4 w-4 mr-2" />
              {tp("Редактировать")}
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => { setClientDeleteOpen(true); setClientConfirmText(""); }}
            className="h-11 w-11 p-0 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={tp("Удалить клиента")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick stats — mobile-friendly summary */}
      {orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border/60 bg-secondary/5 p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-muted-foreground">{tp("Ремонтов")}</div>
            <div className="text-xl sm:text-2xl font-extrabold tabular-nums mt-0.5">{orders.length}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/5 p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-muted-foreground">{tp("Оборот")}</div>
            <div className="text-lg sm:text-xl font-extrabold tabular-nums mt-0.5 truncate">
              {orders.reduce((s, o) => s + (o.total_amount || 0), 0).toLocaleString("ro-MD", { maximumFractionDigits: 0 })}
              <span className="text-xs font-semibold text-muted-foreground ml-1">MDL</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/5 p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-muted-foreground">{tp("Долг")}</div>
            <div className={`text-lg sm:text-xl font-extrabold tabular-nums mt-0.5 ${orders.reduce((s, o) => s + (o.debt_amount || 0), 0) > 0 ? "text-amber-600" : ""}`}>
              {orders.reduce((s, o) => s + (o.debt_amount || 0), 0).toLocaleString("ro-MD", { maximumFractionDigits: 0 })}
              <span className="text-xs font-semibold text-muted-foreground ml-1">MDL</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/5 p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-muted-foreground">{tp("Гараж")}</div>
            <div className="text-xl sm:text-2xl font-extrabold tabular-nums mt-0.5">{client.cars?.length || 0}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Contact Info (Left pane) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="glass-card border-border/80">
            <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80" style={{ fontFamily: 'var(--font-oswald)' }}>
                {tp("Контактные данные")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Телефон")}</div>
                  <a href={`tel:${client.phone}`} className="block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary">
                    {client.phone}
                  </a>
                </div>
              </div>

              {client.email && (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Email</div>
                    <a href={`mailto:${client.email}`} className="block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary">
                      {client.email}
                    </a>
                  </div>
                </div>
              )}

              {client.notes && (
                <div className="pt-4 border-t border-border/40">
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("Заметки к клиенту")}</div>
                  <p className="break-words rounded-xl border border-border/30 bg-secondary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    {client.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cars list */}
          <Card className="glass-card border-border/80">
            <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
                <Car className="h-5 w-5 text-primary" />
                {tp("Гараж")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {client.cars && client.cars.length > 0 ? (
                <div className="space-y-3">
                  {client.cars.map((car) => (
                    <div
                      key={car.id}
                      className="relative p-5 bg-card hover:bg-primary/[0.03] border border-border/70 hover:border-primary/30 rounded-2xl transition-colors duration-150 space-y-4 overflow-hidden"
                    >
                      {/* Left accent bar */}
                      <div className="absolute left-0 top-4 bottom-4 w-1 bg-gradient-to-b from-primary to-[#ff8533] rounded-r-full opacity-60" />

                      {/* Car title */}
                      <div className="pl-3">
                        <div className="font-extrabold text-base uppercase text-foreground tracking-wide leading-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
                          <span className="break-words">{car.brand} {car.model}</span>
                        </div>
                        {car.year && (
                          <div className="text-xs text-muted-foreground font-semibold mt-1">
                            {tp("Год выпуска")}: {car.year}
                          </div>
                        )}
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-3 pt-3 border-t border-border/30">
                        <div>
                          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("Госномер")}</div>
                          <div className="w-fit max-w-full break-all rounded-md border border-border/40 bg-secondary/20 px-2 py-1 font-mono text-sm text-foreground">
                            {car.license_plate || "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("Пробег")}</div>
                          <div className="text-sm font-bold text-foreground">
                            {car.mileage ? `${car.mileage.toLocaleString()} ${tp("км")}` : "—"}
                          </div>
                        </div>
                      </div>

                      {car.vin && (
                        <div className="pl-3 pt-1">
                          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("VIN код")}</div>
                          <div className="w-fit max-w-full break-all rounded-md border border-border/40 bg-secondary/15 px-2.5 py-1.5 font-mono text-sm text-foreground/90">
                            {car.vin}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 pl-3 pt-1">
                        <Link href={`/orders/new?clientId=${id}&carId=${car.id}`} className="min-w-0">
                          <Button className="btn-garage h-11 px-5 text-sm w-full">
                            <Plus className="h-4 w-4 mr-1.5" />
                            {tp("Начать ремонт")}
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { setTransferCarId(car.id); setTransferSearch(""); setTransferResults([]); setSelectedTransferClient(null); }}
                          className="h-11 w-11 p-0 rounded-xl border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                          title={tp("Передать другому клиенту")}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openDeleteDialog(car.id)}
                          className="h-11 w-11 p-0 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={tp("Удалить автомобиль")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs italic">
                  {tp("Нет добавленных автомобилей")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Repair History (Right Pane) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-border/80">
            <CardHeader className="rounded-t-2xl border-b border-border/40 bg-secondary/5 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2 flex-shrink-0" style={{ fontFamily: 'var(--font-oswald)' }}>
                  <FileText className="h-5 w-5 text-primary" />
                  {tp("История обслуживания")} ({filteredOrders.length})
                </CardTitle>
                {orders.length > 0 && (
                  <div className="relative flex-1 max-w-md mx-auto w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      placeholder={tp("Поиск по запчастям, работам, номеру заказа...")}
                      className="h-10 pl-9 pr-9 w-full text-sm"
                    />
                    {historyQuery && (
                      <button type="button" onClick={() => setHistoryQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
                {client.cars && client.cars.length > 0 && (
                  <Link href={`/orders/new?clientId=${id}`} className="flex-shrink-0">
                    <Button className="btn-garage h-10 w-full sm:w-auto px-5 text-sm">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {tp("Добавить ремонт")}
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {orders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{tp("У клиента пока нет заказов на ремонт")}</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    const searchResult = orderMatchesSearch(order, historyQuery);
                    const matchedItems = historyQuery.trim()
                      ? (order.items || []).filter((item) => {
                          const term = historyQuery.trim().toLowerCase();
                          return [item.name, item.code, item.brand].filter(Boolean).some((f) => f!.toLowerCase().includes(term));
                        })
                      : [];

                    return (
                      <Link
                        key={order.id}
                        href={`/orders/${order.id}`}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 border border-border/60 hover:border-primary/25 bg-secondary/5 hover:bg-primary/5 rounded-2xl transition-colors duration-150 gap-4"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            <Calendar className="h-3.5 w-3.5 text-primary/80" />
                            {format(new Date(order.order_date), "dd MMMM yyyy, HH:mm", { locale: dateLocale })}
                            <span className="font-mono text-foreground/60 normal-case">#{order.id.slice(0, 8)}</span>
                          </div>
                          <div className="break-words text-sm sm:text-base font-extrabold uppercase tracking-wide text-foreground">
                            {highlightText(`${order.car.brand} ${order.car.model}`, historyQuery)}
                            {order.car.license_plate && (
                              <span className="ml-2 font-mono text-xs font-semibold normal-case tracking-normal text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded">
                                {order.car.license_plate}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <CreditCard className="h-3.5 w-3.5" />
                              {order.items?.length || 0} {tp("поз.")}
                            </span>
                            <span>
                              {(order.items || []).filter((i) => i.type === "work").length} {tp("раб.")}
                              {" · "}
                              {(order.items || []).filter((i) => i.type === "part").length} {tp("запч.")}
                            </span>
                            {order.payment_status && (
                              <span className="text-muted-foreground/90 font-medium normal-case">
                                {getPaymentStatusLabel(order.payment_status, language)}
                              </span>
                            )}
                            {(order.debt_amount || 0) > 0 && (
                              <span className="text-amber-600 font-bold normal-case">
                                {tp("долг")} {order.debt_amount!.toLocaleString("ro-MD")} MDL
                              </span>
                            )}
                          </div>
                          {matchedItems.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {matchedItems.slice(0, 5).map((item) => (
                                <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800/30 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium">
                                  <span className="font-bold">{highlightText(item.name, historyQuery)}</span>
                                  {item.quantity > 1 && <span className="text-muted-foreground">×{item.quantity}</span>}
                                </span>
                              ))}
                              {matchedItems.length > 5 && (
                                <span className="text-xs text-muted-foreground">+{matchedItems.length - 5}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-3 sm:border-t-0 sm:justify-end sm:pt-0">
                          <Badge
                            variant="outline"
                            className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                              statusColors[order.status] || "bg-muted"
                            }`}
                          >
                            {tp(order.status)}
                          </Badge>
                          <div className="text-right">
                            <div className="break-words text-base font-extrabold text-foreground tabular-nums" style={{ fontFamily: 'var(--font-oswald)' }}>
                              {order.total_amount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openDeleteOrderDialog(order.id);
                            }}
                            className="h-8 w-8 p-0 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                            title={tp("Удалить заказ")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Car Confirmation Dialog */}
      <Dialog open={!!carToDelete} onOpenChange={(open) => !open && setCarToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {tp("Удалить автомобиль")}
            </DialogTitle>
            <DialogDescription>
              {tp("Это действие нельзя отменить. Все заказы, связанные с этим автомобилем, будут удалены.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="confirm-delete-car">{tp("Для подтверждения введите слово")} <span className="font-bold text-foreground">{tp("удалить")}</span>:</Label>
            <Input
              id="confirm-delete-car"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={tp("Введите «удалить»...")}
              className="text-center"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCarToDelete(null)}
              className="rounded-xl"
            >
              {tp("Отмена")}
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim().toLowerCase() !== tp("удалить")}
              onClick={handleDeleteCar}
              className="rounded-xl"
            >
              {tp("Удалить автомобиль")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Order Confirmation Dialog */}
      <Dialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {tp("Удалить заказ")}
            </DialogTitle>
            <DialogDescription>
              {tp("Это действие нельзя отменить. Вся информация о заказе и его позициях будет безвозвратно удалена.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="confirm-delete-order">{tp("Для подтверждения введите слово")} <span className="font-bold text-foreground">{tp("удалить")}</span>:</Label>
            <Input
              id="confirm-delete-order"
              value={orderConfirmText}
              onChange={(e) => setOrderConfirmText(e.target.value)}
              placeholder={tp("Введите «удалить»...")}
              className="text-center"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setOrderToDelete(null)}
              className="rounded-xl"
            >
              {tp("Отмена")}
            </Button>
            <Button
              variant="destructive"
              disabled={orderConfirmText.trim().toLowerCase() !== tp("удалить")}
              onClick={handleDeleteOrder}
              className="rounded-xl"
            >
              {tp("Удалить заказ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Client Confirmation Dialog */}
      <Dialog open={clientDeleteOpen} onOpenChange={(open) => { setClientDeleteOpen(open); if (!open) setClientConfirmText(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {tp("Удалить клиента")}
            </DialogTitle>
            <DialogDescription>
              {tp("Это действие нельзя отменить. Клиент, все его автомобили и заказы будут удалены.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="confirm-delete-client">{tp("Для подтверждения введите слово")} <span className="font-bold text-foreground">{tp("удалить")}</span>:</Label>
            <Input
              id="confirm-delete-client"
              value={clientConfirmText}
              onChange={(e) => setClientConfirmText(e.target.value)}
              placeholder={tp("Введите «удалить»...")}
              className="text-center"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setClientDeleteOpen(false)}
              className="rounded-xl"
            >
              {tp("Отмена")}
            </Button>
            <Button
              variant="destructive"
              disabled={clientConfirmText.trim().toLowerCase() !== tp("удалить")}
              onClick={handleDeleteClient}
              className="rounded-xl"
            >
              {tp("Удалить клиента")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Car Dialog */}
      <Dialog open={!!transferCarId} onOpenChange={(open) => { if (!open) setTransferCarId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              {tp("Передать автомобиль")}
            </DialogTitle>
            <DialogDescription>
              {tp("Выберите клиента, которому хотите передать этот автомобиль. Вся история обслуживания будет сохранена.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="transfer-search">{tp("Поиск клиента для передачи автомобиля")}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                id="transfer-search"
                value={transferSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setTransferSearch(value);
                  setSelectedTransferClient(null);
                  if (value.trim()) {
                    setTransferLoading(true);
                  } else {
                    setTransferResults([]);
                    setTransferLoading(false);
                  }
                }}
                placeholder={tp("Поиск клиента по имени или телефону...")}
                className="pl-9"
              />
              {transferLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
              )}
            </div>

            {selectedTransferClient ? (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="text-sm font-semibold">{selectedTransferClient.full_name}</div>
                <div className="text-xs text-muted-foreground">{selectedTransferClient.phone}</div>
              </div>
            ) : (
              transferResults.length > 0 && (
                <div className="border border-border/80 rounded-xl overflow-hidden">
                  {transferResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedTransferClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-border/20 last:border-0 transition-colors"
                    >
                      <div className="font-semibold text-sm">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setTransferCarId(null)}
              className="rounded-xl"
            >
              {tp("Отмена")}
            </Button>
            <Button
              variant="default"
              disabled={!selectedTransferClient}
              onClick={handleTransferCar}
              className="rounded-xl"
            >
              {tp("Передать автомобиль")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
