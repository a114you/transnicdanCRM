"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ru, ro } from "date-fns/locale";
import { AlertTriangle, Eye, Phone, Search, Wrench, Package, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPaymentMethodLabel, getPaymentStatusLabel } from "@/lib/finance";
import { tr, type Language } from "@/lib/i18n";
import type { OrderWithDetails } from "@/lib/types";

interface OrdersListProps {
  orders: OrderWithDetails[];
  language: Language;
}

const pageSize = 40;

const statusColors: Record<string, string> = {
  "Новый": "bg-blue-100 text-blue-800 border-blue-200",
  "В работе": "bg-amber-100 text-amber-800 border-amber-200",
  "Готов": "bg-green-100 text-green-800 border-green-200",
  "Выдан": "bg-zinc-200 text-zinc-700 border-zinc-300",
};

const paymentStatusColors: Record<string, string> = {
  paid: "bg-green-100 text-green-800 border-green-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  unpaid: "bg-red-100 text-red-800 border-red-200",
};

export function OrdersList({ orders, language }: OrdersListProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const dateLocale = language === "ro" ? ro : ru;

  function highlightText(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const term = q.trim();
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

  function getMatchedItems(order: OrderWithDetails): { name: string; quantity: number }[] {
    if (!normalizedQuery) return [];
    return (order.items || []).filter((item) =>
      [item.name, item.code, item.brand].filter(Boolean).some((f) => f!.toLowerCase().includes(normalizedQuery))
    ).map((item) => ({ name: item.name, quantity: item.quantity }));
  }

  const filteredOrders = useMemo(() => normalizedQuery
    ? orders.filter((order) => [
        order.id,
        order.status,
        order.client.full_name,
        order.client.phone,
        order.client.email,
        order.car.brand,
        order.car.model,
        order.car.license_plate,
        order.car.vin,
        order.notes,
        ...(order.items || []).flatMap((item) => [item.name, item.code, item.brand, item.supplier_name, item.mechanic_name]),
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
    : orders, [orders, normalizedQuery]);
  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = visibleCount < filteredOrders.length;

  return (
    <div>
      <div className="p-3 sm:p-4 md:p-6 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(pageSize);
            }}
            placeholder={tr("Поиск заказа, клиента, авто, работы, исполнителя...", language)}
            className="h-11 pl-9 pr-10 text-sm sm:text-base"
          />
          {query && (
            <button type="button" aria-label={tr("Очистить поиск", language)} onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {normalizedQuery && (
          <p className="mt-2 text-xs text-muted-foreground">{tr("Найдено", language)}: {filteredOrders.length}</p>
        )}
      </div>
      <div className="divide-y divide-border/40">
        {visibleOrders.map((order) => {
          const matchedItems = getMatchedItems(order);
          const works = (order.items || []).filter((i) => i.type === "work").length;
          const parts = (order.items || []).filter((i) => i.type === "part").length;
          const itemCount = order.items?.length || 0;
          return (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 md:p-6 hover:bg-primary/5 transition-colors duration-100 gap-3 sm:gap-4 [content-visibility:auto] [contain-intrinsic-size:0_128px] [contain:layout_style_paint]"
            >
              <div className="min-w-0 flex-1 space-y-1.5 sm:pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-mono text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="font-bold text-base sm:text-lg text-foreground truncate max-w-full">
                    {highlightText(order.client.full_name, query)}
                  </span>
                </div>
                {order.client.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 text-primary flex-shrink-0" />
                    <span className="font-medium tabular-nums">{highlightText(order.client.phone, query)}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  <span className="text-foreground/80">
                    {highlightText(`${order.car.brand} ${order.car.model}`, query)}
                    {order.car.year ? ` · ${order.car.year}` : ""}
                  </span>
                  {order.car.license_plate && (
                    <span className="px-2 py-0.5 bg-secondary/15 border border-border text-xs rounded font-mono normal-case tracking-normal">
                      {highlightText(order.car.license_plate, query)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground/80 font-semibold uppercase tracking-wider">
                  {format(new Date(order.order_date), "dd MMMM yyyy, HH:mm", { locale: dateLocale })}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="font-semibold text-foreground/70">{itemCount}</span>
                    {tr("поз.", language)}
                  </span>
                  {works > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-primary/80" />
                      {works} {tr("раб.", language)}
                    </span>
                  )}
                  {parts > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3 w-3 text-primary/80" />
                      {parts} {tr("запч.", language)}
                    </span>
                  )}
                </div>
                {order.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">
                    {order.notes}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${paymentStatusColors[order.payment_status || "paid"]}`}>
                    {getPaymentStatusLabel(order.payment_status || "paid", language)}
                  </Badge>
                  <span className="text-xs text-muted-foreground self-center">
                    {getPaymentMethodLabel(order.payment_method || "cash", language)}
                  </span>
                  {(order.debt_amount || 0) > 0 && (
                    <span className="text-xs font-semibold text-amber-600 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {tr("долг", language)} {order.debt_amount?.toLocaleString("ro-MD")} MDL
                    </span>
                  )}
                </div>
                {matchedItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {matchedItems.slice(0, 5).map((item, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800/30 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium">
                        <span className="font-bold">{highlightText(item.name, query)}</span>
                        {item.quantity > 1 && <span className="text-muted-foreground">×{item.quantity}</span>}
                      </span>
                    ))}
                    {matchedItems.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{matchedItems.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:flex-shrink-0 sm:justify-end sm:gap-4 border-t border-border/30 pt-3 sm:border-0 sm:pt-0">
                <Badge
                  variant="outline"
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                    statusColors[order.status] || "bg-muted border-border"
                  }`}
                >
                  {tr(order.status, language)}
                </Badge>
                <div className="min-w-0 text-right">
                  <div className="break-words text-base font-extrabold text-foreground sm:text-lg tabular-nums" style={{ fontFamily: "var(--font-oswald)" }}>
                    {order.total_amount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL
                  </div>
                </div>
                <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-100 flex-shrink-0">
                  <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {tr("Ничего не найдено", language)}
        </div>
      )}

      {hasMore && (
        <div className="border-t border-border/40 p-4 sm:p-6 text-center">
          <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + pageSize)} className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
            {tr("Показать еще", language)} {Math.min(pageSize, filteredOrders.length - visibleCount)}
          </Button>
        </div>
      )}
    </div>
  );
}
