"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getWarehouseMovements, getWarehouseParts } from "@/lib/supabase";
import type { WarehouseMovement, WarehousePart } from "@/lib/types";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Calendar, Package, Search, X } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

type DateRange = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

const movementTypeLabels: Record<string, { ru: string; ro: string; en: string }> = {
  order_consume: { ru: "Списание в заказ", ro: "Consum comandă", en: "Order consume" },
  order_return: { ru: "Возврат из заказа", ro: "Retur din comandă", en: "Order return" },
  manual_add: { ru: "Ручное добавление", ro: "Adăugare manuală", en: "Manual add" },
  manual_remove: { ru: "Ручное списание", ro: "Scoaternere manuală", en: "Manual remove" },
  manual_adjust: { ru: "Корректировка", ro: "Ajustare", en: "Adjust" },
  initial: { ru: "Первичное добавление", ro: "Adăugare inițială", en: "Initial" },
};

const listPageSize = 50;

function getDateRangeDates(dateRange: DateRange) {
  const today = new Date();
  let start: Date;
  let end: Date;

  switch (dateRange) {
    case "today":
      start = today;
      end = today;
      break;
    case "week":
      start = subDays(today, 7);
      end = today;
      break;
    case "month":
      start = startOfMonth(today);
      end = endOfMonth(today);
      break;
    case "quarter":
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      start = lastMonth;
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case "year":
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
      break;
    case "all":
      return { startDate: "", endDate: "" };
    default:
      return null;
  }

  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
  };
}

export default function WarehouseHistoryPage() {
  const { language, tp } = useLanguage();
  const [movements, setMovements] = useState<WarehouseMovement[]>([]);
  const [parts, setParts] = useState<WarehousePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedPartId, setSelectedPartId] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(listPageSize);
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [movs, pts] = await Promise.all([getWarehouseMovements(undefined, 2000), getWarehouseParts()]);
    setMovements(movs);
    setParts(pts);
    setLoading(false);
  }

  function handleDateRangeChange(range: DateRange) {
    setDateRange(range);
    setVisibleCount(listPageSize);
    const dates = getDateRangeDates(range);
    if (dates) {
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  }

  const filtered = useMemo(() => {
    let result = movements;

    // Date filter
    if (dateRange !== "all" && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter((m) => {
        const d = new Date(m.created_at);
        return d >= start && d <= end;
      });
    }

    // Part filter
    if (selectedPartId !== "all") {
      result = result.filter((m) => m.warehouse_part_id === selectedPartId);
    }

    // Text search
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((m) =>
        [m.part_name, m.part_code, m.part_brand, m.client_name, m.order_number, m.note, m.car_info]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return result;
  }, [movements, selectedPartId, query, dateRange, startDate, endDate]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const summary = useMemo(() => {
    const added = filtered.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
    const removed = filtered.filter((m) => m.delta < 0).reduce((s, m) => s + Math.abs(m.delta), 0);
    return { added, removed, total: filtered.length };
  }, [filtered]);

  function movementLabel(type: string) {
    const labels = movementTypeLabels[type];
    if (!labels) return type;
    return labels[language] || labels.ru;
  }

  function movementBadgeClass(type: string) {
    if (type === "order_consume" || type === "manual_remove") return "bg-red-100 text-red-800 border-red-200";
    if (type === "order_return" || type === "manual_add" || type === "initial") return "bg-green-100 text-green-800 border-green-200";
    return "bg-amber-100 text-amber-800 border-amber-200";
  }

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "today", label: tp("Сегодня") },
    { value: "week", label: tp("Последние 7 дней") },
    { value: "month", label: tp("Этот месяц") },
    { value: "quarter", label: tp("Прошлый месяц") },
    { value: "year", label: tp("Этот год") },
    { value: "all", label: tp("За все время") },
    { value: "custom", label: tp("Произвольный период") },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:p-6 glass-card bg-secondary/5 border-white/5">
        <div className="flex items-start gap-3">
          <BackButton href="/warehouse" label={tp("Назад к складу")} ariaLabel={tp("Назад к складу")} />
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl min-[390px]:text-3xl sm:text-4xl font-extrabold tracking-tight">{tp("Движение запчастей")}</h1>
              <p className="text-sm text-muted-foreground">{tp("История поступлений и списаний запчастей со склада")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card border-border/60">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Всего записей")}</p>
            <p className="text-3xl font-extrabold mt-1" style={{ fontFamily: "var(--font-bebas)" }}>{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/60">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Поступило")}</p>
            <p className="text-3xl font-extrabold mt-1 text-green-600" style={{ fontFamily: "var(--font-bebas)" }}>{summary.added.toLocaleString("ro-MD")}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/60">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Списано")}</p>
            <p className="text-3xl font-extrabold mt-1 text-red-600" style={{ fontFamily: "var(--font-bebas)" }}>{summary.removed.toLocaleString("ro-MD")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/80">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Движение запчастей")} ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-5 border-b border-border/40 space-y-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label className="label-garage flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {tp("Период")}
              </Label>
              <div className="flex flex-wrap gap-2">
                {dateRangeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleDateRangeChange(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dateRange === opt.value ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dateRange === "custom" && (
                <div className="flex flex-col sm:flex-row gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{tp("С даты")}</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setVisibleCount(listPageSize); }}
                      className="h-10 w-full sm:w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tp("По дату")}</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setVisibleCount(listPageSize); }}
                      className="h-10 w-full sm:w-40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setVisibleCount(listPageSize); }}
                placeholder={tp("Поиск по названию, коду, клиенту, заказу...")}
                className="h-11 pl-9 pr-10"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Part Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setSelectedPartId("all"); setVisibleCount(listPageSize); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedPartId === "all" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {tp("Все запчасти")}
              </button>
              {parts.filter((p) => movements.some((m) => m.warehouse_part_id === p.id)).slice(0, 20).map((part) => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => { setSelectedPartId(part.id); setVisibleCount(listPageSize); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedPartId === part.id ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {part.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-14 text-muted-foreground">
              <p className="text-sm">{tp("Загрузка...")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold">{tp("Нет записей о движении запчастей")}</p>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-border/40">
                {visible.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">
                          {m.part_name}
                          {m.part_code && <span className="text-muted-foreground ml-2 font-mono text-xs">{m.part_code}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(m.created_at), "dd.MM.yyyy HH:mm")}
                        </div>
                      </div>
                      <Badge variant="outline" className={movementBadgeClass(m.movement_type)}>
                        {movementLabel(m.movement_type)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.delta > 0 ? (
                        <ArrowDownCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className={`text-sm font-bold ${m.delta > 0 ? "text-green-600" : "text-red-600"}`}>
                        {m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("ro-MD")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({m.quantity_before.toLocaleString("ro-MD")} → {m.quantity_after.toLocaleString("ro-MD")})
                      </span>
                    </div>
                    {m.client_name && (
                      <div className="text-xs text-muted-foreground">
                        {tp("Клиент")}: {m.client_name} {m.car_info && `· ${m.car_info}`}
                      </div>
                    )}
                    {m.order_number && (
                      <div className="text-xs text-muted-foreground">
                        {tp("Заказ")}: #{m.order_number}
                      </div>
                    )}
                    {m.note && (
                      <div className="text-xs text-muted-foreground italic whitespace-pre-wrap">{m.note}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-secondary/5">
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Дата")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Запчасть")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Тип")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Приход")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Расход")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Остаток")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Клиент")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Авто")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Заказ")}</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[250px]">{tp("Примечание")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {visible.map((m) => (
                      <tr key={m.id} className="hover:bg-primary/5 transition-colors align-top">
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{format(new Date(m.created_at), "dd.MM.yyyy HH:mm")}</td>
                        <td className="p-3">
                          <div className="font-semibold">{m.part_name}</div>
                          <div className="text-xs text-muted-foreground flex gap-2">
                            {m.part_code && <span className="font-mono">{m.part_code}</span>}
                            {m.part_brand && <span>{m.part_brand}</span>}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={movementBadgeClass(m.movement_type)}>
                            {movementLabel(m.movement_type)}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-bold text-green-600">{m.delta > 0 ? `+${m.delta.toLocaleString("ro-MD")}` : "—"}</td>
                        <td className="p-3 text-right font-bold text-red-600">{m.delta < 0 ? m.delta.toLocaleString("ro-MD") : "—"}</td>
                        <td className="p-3 text-right font-medium">{m.quantity_after.toLocaleString("ro-MD")}</td>
                        <td className="p-3 text-muted-foreground">{m.client_name || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{m.car_info || "—"}</td>
                        <td className="p-3 text-muted-foreground">{m.order_number ? `#${m.order_number}` : "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-pre-wrap">{m.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="border-t border-border/40 p-4 sm:p-5 text-center">
                  <Button type="button" variant="outline" onClick={() => setVisibleCount((c) => c + listPageSize)} className="h-10 w-full rounded-xl px-5 text-sm sm:w-auto">
                    {tp("Показать еще")} {Math.min(listPageSize, filtered.length - visibleCount)}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
