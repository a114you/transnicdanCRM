"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/fields/DatePickerInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderWithDetails, ClientWithCars, OrderStatus } from "@/lib/types";
import {
  FileText,
  TrendingUp,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  Loader2,
  X,
  Printer,
  FileSpreadsheet,
  Plus,
  Eye,
  Settings2,
  Landmark,
  Package,
  AlertCircle,
  Languages,
  UserRoundCog,
  BarChart3,
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { getDebtAgeDays, getOrderEconomy } from "@/lib/finance";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Language } from "@/lib/i18n";
import { formatMileage } from "@/lib/act-report";

// Types
type DateRange = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";
type TabType = "finance" | "history" | "mechanics" | "debtors";
type SortDirection = "asc" | "desc";
type ReportSortKey = "date" | "client" | "car" | "status" | "total" | "debt" | "profit" | "paid" | "debtAge";

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface ReportFilters {
  dateRange: DateRange;
  startDate: string;
  endDate: string;
  clientIds: string[]; // Support multi-client filtering
  searchQuery: string;
}

interface ReportSummary {
  totalOrders: number;
  totalRevenue: number;
  totalPaid: number;
  totalDebt: number;
  averageOrderValue: number;
  workRevenue: number;
  partsRevenue: number;
  partsCost: number;
  partsProfit: number;
  grossProfit: number;
  uniqueClients: number;
}

interface DebtorRow {
  order: OrderWithDetails;
  debtAmount: number;
  paidAmount: number;
  debtAgeDays: number;
}

interface MechanicReportRow {
  key: string;
  mechanicName: string;
  worksCount: number;
  quantity: number;
  totalAmount: number;
  works: {
    order: OrderWithDetails;
    itemId: string;
    name: string;
    quantity: number;
    sellingPrice: number;
    totalPrice: number;
  }[];
}

interface ReportSort {
  key: ReportSortKey;
  direction: SortDirection;
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: ReportSortKey;
  sort: ReportSort;
  onSort: (key: ReportSortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sort.key === sortKey;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`w-full ${alignClass} hover:text-foreground transition-colors`}
    >
      {label}{active ? (sort.direction === "desc" ? " ↓" : " ↑") : ""}
    </button>
  );
}

interface VisibleColumns {
  date: boolean;
  client: boolean;
  phone: boolean;
  car: boolean;
  plate: boolean;
  mileage: boolean;
  vin: boolean;
  notes: boolean;
  items: boolean;
  status: boolean;
  amount: boolean;
}

export default function ReportsPage() {
  const { language, tp } = useLanguage();
  const [tab, setTab] = useState<TabType>("finance");
  const [sort, setSort] = useState<ReportSort>({ key: "date", direction: "desc" });
  const [exportLang, setExportLang] = useState<Language>(language);

  const statusOptions = useMemo(() => [
    { value: "Новый" as OrderStatus, label: tp("Новый"), color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "В работе" as OrderStatus, label: tp("В работе"), color: "bg-amber-100 text-amber-800 border-amber-200" },
    { value: "Готов" as OrderStatus, label: tp("Готов"), color: "bg-green-100 text-green-800 border-green-200" },
    { value: "Выдан" as OrderStatus, label: tp("Выдан"), color: "bg-zinc-200 text-zinc-700 border-zinc-300" },
  ], [tp]);

  const dateRangeOptions = useMemo(() => [
    { value: "today" as DateRange, label: tp("Сегодня") },
    { value: "week" as DateRange, label: tp("Последние 7 дней") },
    { value: "month" as DateRange, label: tp("Этот месяц") },
    { value: "quarter" as DateRange, label: tp("Прошлый месяц") },
    { value: "year" as DateRange, label: tp("Этот год") },
    { value: "all" as DateRange, label: tp("За все время") },
    { value: "custom" as DateRange, label: tp("Произвольный период") },
  ], [tp]);

  // Filters state
  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: "month",
    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    clientIds: [],
    searchQuery: "",
  });

  // Columns visibility constructor (Tab 2)
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    date: true,
    client: true,
    phone: true,
    car: true,
    plate: true,
    mileage: true,
    vin: false,
    notes: false,
    items: true,
    status: true,
    amount: true,
  });

  // Data state
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<ClientWithCars[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [selectedClients, setSelectedClients] = useState<ClientWithCars[]>([]);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const clientSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const clientSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [clientDropdownStyle, setClientDropdownStyle] = useState<React.CSSProperties>({});
  const [selectedMechanicKeys, setSelectedMechanicKeys] = useState<string[]>([]);
  const [mechanicSearchQuery, setMechanicSearchQuery] = useState("");

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

  // Debounced client search
  useEffect(() => {
    if (!clientSearchQuery.trim() || clientSearchQuery.trim().length < 2) {
      Promise.resolve().then(() => {
        setClientSearchResults([]);
        setSearchingClients(false);
      });
      return;
    }

    if (clientSearchTimeout.current) {
      clearTimeout(clientSearchTimeout.current);
    }

    const controller = new AbortController();

    clientSearchTimeout.current = setTimeout(async () => {
      try {
        const url = `/api/reports/client-search?q=${encodeURIComponent(clientSearchQuery.trim())}`;
        const results = await fetchJson<ClientWithCars[]>(url, controller.signal);
        // Exclude already selected
        const selectedIds = selectedClients.map(c => c.id);
        const filtered = results.filter(r => !selectedIds.includes(r.id));
        setClientSearchResults(filtered.slice(0, 5));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setClientSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchingClients(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      if (clientSearchTimeout.current) {
        clearTimeout(clientSearchTimeout.current);
      }
    };
  }, [clientSearchQuery, selectedClients]);

  useEffect(() => {
    if (clientSearchResults.length === 0) return;

    function updateDropdownPosition() {
      const rect = clientSearchInputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - 16);
      const left = Math.min(Math.max(rect.left, 8), viewportWidth - width - 8);
      setClientDropdownStyle({
        position: "fixed",
        left,
        top: rect.bottom + 6,
        width,
        zIndex: 2147483000,
      });
    }

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [clientSearchResults.length]);

  // Fetch orders when report filters change
  useEffect(() => {
    if (filters.dateRange !== "all" && (!filters.startDate || !filters.endDate)) return;

    Promise.resolve().then(() => {
      setLoading(true);
      setFetchError(null);
    });

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.dateRange !== "all") {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
    } else {
      params.set("all", "1");
    }
    if (filters.clientIds.length > 0) params.set("clientIds", filters.clientIds.join(","));
    if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());

    fetchJson<OrderWithDetails[]>(`/api/reports/orders?${params.toString()}`, controller.signal)
      .then((data) => setOrders(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOrders([]);
        setFetchError(err instanceof Error ? err.message : tp("Ошибка загрузки данных"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters.dateRange, filters.startDate, filters.endDate, filters.clientIds, filters.searchQuery, tp]);

  const filteredOrders = orders;

  function sortOrders(data: OrderWithDetails[], currentSort: ReportSort) {
    const direction = currentSort.direction === "asc" ? 1 : -1;

    return [...data].sort((a, b) => {
      const aEconomy = currentSort.key === "profit" ? getOrderEconomy(a.items || []) : null;
      const bEconomy = currentSort.key === "profit" ? getOrderEconomy(b.items || []) : null;

      const getValue = (order: OrderWithDetails) => {
        switch (currentSort.key) {
          case "date":
            return new Date(order.order_date).getTime();
          case "client":
            return order.client.full_name.toLowerCase();
          case "car":
            return `${order.car.brand} ${order.car.model}`.toLowerCase();
          case "status":
            return order.status;
          case "total":
            return order.total_amount;
          case "paid":
            return order.paid_amount ?? order.total_amount;
          case "debt":
            return order.debt_amount || 0;
          case "profit":
            return order === a ? aEconomy?.grossProfit || 0 : bEconomy?.grossProfit || 0;
          case "debtAge":
            return getDebtAgeDays(order.debt_started_at);
          default:
            return 0;
        }
      };

      const aValue = getValue(a);
      const bValue = getValue(b);
      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue, "ru") * direction;
      }
      return (Number(aValue) - Number(bValue)) * direction;
    });
  }

  const sortedOrders = useMemo(() => sortOrders(filteredOrders, sort), [filteredOrders, sort]);

  function toggleSort(key: ReportSortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  const debtorRows: DebtorRow[] = useMemo(() => {
    return sortedOrders
      .filter((order) => (order.debt_amount || 0) > 0)
      .map((order) => ({
        order,
        debtAmount: order.debt_amount || 0,
        paidAmount: order.paid_amount ?? 0,
        debtAgeDays: getDebtAgeDays(order.debt_started_at),
      }))
      .sort((a, b) => {
        if (sort.key === "debtAge") return sort.direction === "asc" ? a.debtAgeDays - b.debtAgeDays : b.debtAgeDays - a.debtAgeDays;
        if (sort.key === "debt") return sort.direction === "asc" ? a.debtAmount - b.debtAmount : b.debtAmount - a.debtAmount;
        return 0;
      });
  }, [sortedOrders, sort]);

  const mechanicRows: MechanicReportRow[] = useMemo(() => {
    const rows = new Map<string, MechanicReportRow>();

    sortedOrders.forEach((order) => {
      (order.items || [])
        .filter((item) => item.type === "work" && (item.mechanic_id || item.mechanic_name))
        .forEach((item) => {
          const key = item.mechanic_id || item.mechanic_name || "";
          const mechanicName = item.mechanic_name || tp("Без имени");
          const row = rows.get(key) || {
            key,
            mechanicName,
            worksCount: 0,
            quantity: 0,
            totalAmount: 0,
            works: [],
          };

          row.worksCount += 1;
          row.quantity += Number(item.quantity) || 0;
          row.totalAmount += Number(item.total_price) || Number(item.quantity) * Number(item.selling_price) || 0;
          row.works.push({
            order,
            itemId: item.id,
            name: item.name,
            quantity: Number(item.quantity) || 0,
            sellingPrice: Number(item.selling_price) || 0,
            totalPrice: Number(item.total_price) || Number(item.quantity) * Number(item.selling_price) || 0,
          });
          rows.set(key, row);
        });
    });

    return Array.from(rows.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [sortedOrders, tp]);

  const filteredMechanicRows = useMemo(() => {
    if (selectedMechanicKeys.length === 0) return mechanicRows;
    const selectedSet = new Set(selectedMechanicKeys);
    return mechanicRows.filter((row) => selectedSet.has(row.key));
  }, [mechanicRows, selectedMechanicKeys]);

  const mechanicSearchResults = useMemo(() => {
    if (!mechanicSearchQuery.trim()) return mechanicRows;
    const term = mechanicSearchQuery.trim().toLowerCase();
    return mechanicRows.filter((row) => row.mechanicName.toLowerCase().includes(term));
  }, [mechanicRows, mechanicSearchQuery]);

  function toggleMechanic(key: string) {
    setSelectedMechanicKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function clearMechanics() {
    setSelectedMechanicKeys([]);
    setMechanicSearchQuery("");
  }

  // Multi-client selector actions
  function addClient(client: ClientWithCars) {
    const updated = [...selectedClients, client];
    setSelectedClients(updated);
    setFilters((f) => ({ ...f, clientIds: updated.map(c => c.id) }));
    setClientSearchQuery("");
    setClientSearchResults([]);
  }

  function removeClient(clientId: string) {
    const updated = selectedClients.filter((c) => c.id !== clientId);
    setSelectedClients(updated);
    setFilters((f) => ({ ...f, clientIds: updated.map(c => c.id) }));
  }

  function clearAllClients() {
    setSelectedClients([]);
    setFilters((f) => ({ ...f, clientIds: [] }));
    setClientSearchQuery("");
  }

  function resetFilters() {
    setLoading(true);
    setFilters({
      dateRange: "month",
      startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
      endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
      clientIds: [],
      searchQuery: "",
    });
    setSelectedClients([]);
    setClientSearchQuery("");
  }

  // Summary statistics calculated over active filtered data
  const summary: ReportSummary = useMemo(() => {
    if (filteredOrders.length === 0) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        totalPaid: 0,
        totalDebt: 0,
        averageOrderValue: 0,
        workRevenue: 0,
        partsRevenue: 0,
        partsCost: 0,
        partsProfit: 0,
        grossProfit: 0,
        uniqueClients: 0,
      };
    }

    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const totalPaid = filteredOrders.reduce((sum, o) => {
      if (typeof o.paid_amount === "number") return sum + o.paid_amount;
      if (o.payment_status === "unpaid") return sum;
      if (o.payment_status === "partial") return sum + Math.max(0, o.total_amount - (o.debt_amount || 0));
      return sum + o.total_amount;
    }, 0);
    const totalDebt = filteredOrders.reduce((sum, o) => sum + (o.debt_amount || 0), 0);
    const uniqueClients = new Set(filteredOrders.map((o) => o.client_id)).size;

    let workRevenue = 0;
    let partsRevenue = 0;
    let partsCost = 0;
    let partsProfit = 0;
    let grossProfit = 0;

    filteredOrders.forEach((order) => {
      const economy = getOrderEconomy(order.items || []);
      workRevenue += economy.workRevenue;
      partsRevenue += economy.partsRevenue;
      partsCost += economy.partsCost;
      partsProfit += economy.partsProfit;
      grossProfit += economy.grossProfit;
    });

    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      totalPaid,
      totalDebt,
      averageOrderValue: totalRevenue / filteredOrders.length,
      workRevenue,
      partsRevenue,
      partsCost,
      partsProfit,
      grossProfit,
      uniqueClients,
    };
  }, [filteredOrders]);


  function buildExportUrl(formatType: "excel" | "pdf") {
    const params = new URLSearchParams({
      format: formatType,
      tab,
      lang: exportLang,
    });
    if (filters.dateRange === "all") {
      params.set("all", "1");
    } else {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
    }
    if (filters.clientIds.length > 0) params.set("clientIds", filters.clientIds.join(","));
    if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());
    return `/api/reports/export?${params.toString()}`;
  }

  function getDownloadFilename(response: Response, fallback: string) {
    const disposition = response.headers.get("Content-Disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] || fallback;
  }

  async function downloadReport(formatType: "excel" | "pdf") {
    if (exportDisabled || exporting) return;
    setExporting(formatType);
    setExportError(null);

    try {
      const response = await fetch(buildExportUrl(formatType), { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || tp("Не удалось скачать отчет"));
      }

      const blob = await response.blob();
      const extension = formatType === "pdf" ? "pdf" : "xlsx";
      const filename = getDownloadFilename(response, `report.${extension}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : tp("Не удалось скачать отчет"));
    } finally {
      setExporting(null);
    }
  }

  function exportToExcel() {
    void downloadReport("excel");
  }

  function exportToPDF() {
    void downloadReport("pdf");
  }

  const exportDisabled = loading || exporting !== null || (
    tab === "debtors" ? debtorRows.length === 0 : tab === "mechanics" ? mechanicRows.length === 0 : sortedOrders.length === 0
  );

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title={tp("Отчёты и аналитика")}
        description={tp("Конструктор отчетов и финансовый дашборд автосервиса")}
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={resetFilters}
            className="h-10 sm:h-11 px-3 sm:px-5 text-xs sm:text-sm rounded-xl border-border/60 hover:bg-primary/5 hover:text-primary transition-colors duration-150 font-semibold"
          >
            <RotateCcw className="h-4 w-4 mr-1 sm:mr-2" />
            {tp("Сбросить")}
          </Button>
          <div className="h-4 w-[1px] bg-border/40 hidden sm:block" />
          <div className="flex items-center gap-1">
            <Languages className="h-4 w-4 text-muted-foreground mr-1" />
            <Button
              variant={exportLang === "ru" ? "default" : "outline"}
              size="sm"
              onClick={() => setExportLang("ru")}
              className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs rounded-lg"
            >
              RU
            </Button>
            <Button
              variant={exportLang === "ro" ? "default" : "outline"}
              size="sm"
              onClick={() => setExportLang("ro")}
              className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs rounded-lg"
            >
              RO
            </Button>
            <Button
              variant={exportLang === "en" ? "default" : "outline"}
              size="sm"
              onClick={() => setExportLang("en")}
              className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs rounded-lg"
            >
              EN
            </Button>
          </div>
          <div className="h-4 w-[1px] bg-border/40 hidden sm:block" />
          <Button
            onClick={exportToExcel}
            disabled={exportDisabled}
            className="h-10 sm:h-11 px-3 sm:px-5 text-xs sm:text-sm rounded-xl bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black hover:opacity-95 font-semibold uppercase tracking-wider transition-[colors,opacity] duration-150 flex items-center gap-2"
          >
            {exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel
          </Button>
          <Button
            onClick={exportToPDF}
            disabled={exportDisabled}
            className="btn-garage h-10 sm:h-11 px-3 sm:px-5 text-xs sm:text-sm"
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            PDF
          </Button>
          </div>
        }
      />

      {fetchError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-semibold">
          {tp("Ошибка загрузки")}: {fetchError}
        </div>
      )}

      {exportError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-semibold">
          {tp("Ошибка выгрузки")}: {exportError}
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex justify-center md:justify-start overflow-x-auto pb-1">
        <div className="flex gap-1.5 p-1 bg-secondary/10 dark:bg-secondary/25 rounded-2xl border border-border/40 min-w-0">
          <button
            onClick={() => setTab("finance")}
            className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wider rounded-xl transition-colors duration-100 whitespace-nowrap snap-start flex-shrink-0 ${
              tab === "finance"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/75 hover:text-foreground hover:bg-secondary/15"
            }`}
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            <TrendingUp className="h-4 w-4 inline-block mr-1 sm:mr-2 -mt-0.5" />
            {tp("Финансовый анализ")}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wider rounded-xl transition-colors duration-100 whitespace-nowrap snap-start flex-shrink-0 ${
              tab === "history"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/75 hover:text-foreground hover:bg-secondary/15"
            }`}
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            <FileText className="h-4 w-4 inline-block mr-1 sm:mr-2 -mt-0.5" />
            {tp("История обслуживания")}
          </button>
          <button
            onClick={() => setTab("mechanics")}
            className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wider rounded-xl transition-colors duration-100 whitespace-nowrap snap-start flex-shrink-0 ${
              tab === "mechanics"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/75 hover:text-foreground hover:bg-secondary/15"
            }`}
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            <UserRoundCog className="h-4 w-4 inline-block mr-1 sm:mr-2 -mt-0.5" />
            {tp("Механики")}
          </button>
          <button
            onClick={() => setTab("debtors")}
            className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wider rounded-xl transition-colors duration-100 whitespace-nowrap snap-start flex-shrink-0 ${
              tab === "debtors"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/75 hover:text-foreground hover:bg-secondary/15"
            }`}
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            <AlertCircle className="h-4 w-4 inline-block mr-1 sm:mr-2 -mt-0.5" />
            {tp("Должники")}
          </button>
        </div>
      </div>

      {/* Filters Control Panel */}
      <Card className="glass-card border-border/80">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-base font-semibold uppercase tracking-wider text-foreground/90" style={{ fontFamily: 'var(--font-oswald)' }}>
            <Filter className="h-4 w-4 text-primary" />
            {tp("Параметры и Фильтры")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="report-period" className="label-garage">{tp("Период")}</Label>
              <Select
                value={filters.dateRange}
                onValueChange={(v) => {
                  const dateRange = v as DateRange;
                  const rangeDates = getDateRangeDates(dateRange);
                  if (rangeDates) setLoading(true);
                  setFilters((f) => ({
                    ...f,
                    dateRange,
                    ...(rangeDates || {}),
                  }));
                }}
              >
                <SelectTrigger id="report-period" className="input-garage h-11 border-border/80 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/60">
                  {dateRangeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-sm">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-start-date" className="label-garage">{tp("С даты")}</Label>
              <DatePickerInput
                id="report-start-date"
                value={filters.startDate}
                onChange={(value) => {
                  setLoading(true);
                  setFilters((f) => ({ ...f, startDate: value }));
                }}
                disabled={filters.dateRange !== "custom"}
                className="input-garage h-11 border-border/80 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-end-date" className="label-garage">{tp("По дату")}</Label>
              <DatePickerInput
                id="report-end-date"
                value={filters.endDate}
                onChange={(value) => {
                  setLoading(true);
                  setFilters((f) => ({ ...f, endDate: value }));
                }}
                disabled={filters.dateRange !== "custom"}
                className="input-garage h-11 border-border/80 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-search" className="label-garage">{tp("Поиск в отчете")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  id="report-search"
                  placeholder={tp("№ заказа, клиент, авто, госномер...")}
                  value={filters.searchQuery}
                  onChange={(e) => {
                    setLoading(true);
                    setFilters((f) => ({ ...f, searchQuery: e.target.value }));
                  }}
                  className="input-garage h-11 pl-9 border-border/80 text-sm"
                />
                {filters.searchQuery && (
                  <button
                    onClick={() => {
                      setLoading(true);
                      setFilters((f) => ({ ...f, searchQuery: "" }));
                    }}
                    aria-label={tp("Очистить поиск")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-full"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Autocomplete Multi-Client / Mechanic Filter */}
          {tab === "mechanics" ? (
            <div className="space-y-2">
              <Label className="label-garage">{tp("Выборка механиков для отчета")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder={tp("Начните вводить имя механика...")}
                  value={mechanicSearchQuery}
                  onChange={(e) => setMechanicSearchQuery(e.target.value)}
                  className="input-garage h-11 pl-9 border-border/80 text-sm"
                />
                {mechanicSearchQuery && (
                  <button type="button" onClick={() => setMechanicSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {mechanicSearchQuery && mechanicSearchResults.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {mechanicSearchResults.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => { toggleMechanic(row.key); setMechanicSearchQuery(""); }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-border/20 last:border-0 hover:bg-primary/10 ${selectedMechanicKeys.includes(row.key) ? "bg-primary/5" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{row.mechanicName}</div>
                        <div className="text-xs text-muted-foreground">{row.worksCount} {tp("работ")} · {row.totalAmount.toLocaleString("ro-MD")} MDL</div>
                      </div>
                      {selectedMechanicKeys.includes(row.key) ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 flex-shrink-0">{tp("Выбран")}</Badge>
                      ) : (
                        <Plus className="h-4 w-4 flex-shrink-0 text-primary opacity-60" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedMechanicKeys.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                  <span className="text-xs text-muted-foreground mr-1">{tp("Механики в отчете")}:</span>
                  {selectedMechanicKeys.map((key) => {
                    const row = mechanicRows.find((r) => r.key === key);
                    return row ? (
                      <span key={key} className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-semibold animate-scale-in">
                        {row.mechanicName}
                        <button onClick={() => toggleMechanic(key)} className="hover:bg-primary hover:text-primary-foreground rounded-full p-0.5 ml-1 transition-colors duration-150">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null;
                  })}
                  <Button variant="ghost" onClick={clearMechanics} className="h-9 px-4 text-xs rounded-lg text-destructive hover:bg-destructive/10">
                    {tp("Очистить")}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/80 italic">
                  * {tp("По умолчанию выводятся работы по всем механикам за выбранный период.")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="report-client-search" className="label-garage">{tp("Выборка клиентов для отчета")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  ref={clientSearchInputRef}
                  id="report-client-search"
                  placeholder={tp("Начните вводить имя или телефон клиента...")}
                  value={clientSearchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setClientSearchQuery(value);
                    if (value.trim()) {
                      setSearchingClients(true);
                    } else {
                      setClientSearchResults([]);
                      setSearchingClients(false);
                    }
                  }}
                  className="input-garage h-11 pl-9 border-border/80 text-sm"
                />
                {searchingClients && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                )}

                {/* Client Autocomplete Popover (fully dark-mode styled) */}
                {clientSearchResults.length > 0 && createPortal(
                  <div style={clientDropdownStyle} className="max-h-64 overflow-y-auto rounded-lg border border-border/80 bg-card shadow-2xl">
                    {clientSearchResults.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => addClient(client)}
                        className="flex w-full items-center justify-between gap-3 border-b border-border/20 px-4 py-3 text-left transition-colors last:border-0 hover:bg-primary/10"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{client.full_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{client.phone}</div>
                        </div>
                        <Plus className="h-4 w-4 flex-shrink-0 text-primary opacity-60 hover:opacity-100" />
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
              </div>

              {/* Selected Clients Pills */}
              {selectedClients.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                  <span className="text-xs text-muted-foreground mr-1">{tp("Клиенты в отчете")}:</span>
                  {selectedClients.map((client) => (
                    <span
                      key={client.id}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-semibold animate-scale-in"
                    >
                      {client.full_name}
                      <button
                        onClick={() => removeClient(client.id)}
                        aria-label={tp("Удалить клиента из фильтра")}
                        className="hover:bg-primary hover:text-primary-foreground rounded-full p-0.5 ml-1 transition-colors duration-150"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <Button
                    variant="ghost"
                    onClick={clearAllClients}
                    className="h-9 px-4 text-xs rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    {tp("Очистить выборку")}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/80 italic">
                  * {tp("По умолчанию выводятся заказы по всем клиентам за выбранный период.")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* RENDER TAB 1: FINANCIAL ANALYSIS */}
      {tab === "finance" && (
        <div className="space-y-6">
          {/* Key Metrics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card bg-primary/5 hover:border-primary/40 border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Выручка")}</p>
                  <p className="text-2xl font-extrabold font-display text-primary mt-1" style={{ fontFamily: 'var(--font-bebas)' }}>
                    {summary.totalRevenue.toLocaleString("ro-MD")} MDL
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Оплачено")}</p>
                  <p className="text-2xl font-bold font-display mt-1 text-green-600" style={{ fontFamily: 'var(--font-bebas)' }}>
                    {summary.totalPaid.toLocaleString("ro-MD")} MDL
                  </p>
                </div>
                <div className="p-3 bg-secondary/15 rounded-xl">
                  <Landmark className="h-6 w-6 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Долги")}</p>
                  <p className="text-2xl font-bold font-display mt-1 text-amber-600" style={{ fontFamily: 'var(--font-bebas)' }}>
                    {summary.totalDebt.toLocaleString("ro-MD")} MDL
                  </p>
                </div>
                <div className="p-3 bg-secondary/15 rounded-xl">
                  <Calendar className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Прибыль сервиса")}</p>
                  <p className="text-2xl font-bold font-display mt-1 text-primary" style={{ fontFamily: 'var(--font-bebas)' }}>
                    {summary.grossProfit.toLocaleString("ro-MD")} MDL
                  </p>
                </div>
                <div className="p-3 bg-secondary/15 rounded-xl">
                  <Package className="h-6 w-6 text-primary" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Работы")}</p>
                <p className="text-2xl font-bold mt-1">{summary.workRevenue.toLocaleString("ro-MD")} MDL</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Запчасти клиенту")}</p>
                <p className="text-2xl font-bold mt-1">{summary.partsRevenue.toLocaleString("ro-MD")} MDL</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Себест. запчастей")}</p>
                <p className="text-2xl font-bold mt-1">{summary.partsCost.toLocaleString("ro-MD")} MDL</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Маржа запчастей")}</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{summary.partsProfit.toLocaleString("ro-MD")} MDL</p>
              </CardContent>
            </Card>
          </div>

          {/* Analysis Log Table */}
          <Card className="glass-card border-border/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
              <div>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80" style={{ fontFamily: 'var(--font-oswald)' }}>
                  {tp("Лог анализа")} ({sortedOrders.length} {tp("записей анализа")})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 px-1 sm:px-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs uppercase tracking-wider font-semibold">{tp("Идет загрузка отчета...")}</p>
                </div>
              ) : sortedOrders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{tp("Нет финансовых записей по данным фильтрам")}</p>
                  <p className="text-xs mt-1">{tp("Попробуйте увеличить период или изменить выборку клиентов")}</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-3 px-4 pb-4">
                    {sortedOrders.slice(0, 50).map((order) => {
                      const economy = getOrderEconomy(order.items || []);
                      return (
                        <div key={order.id} className="p-4 rounded-xl border border-border/60 bg-card/80 space-y-2 [content-visibility:auto] [contain-intrinsic-size:0_180px] [contain:layout_style_paint]">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{order.client.full_name}</div>
                              <div className="text-xs text-muted-foreground uppercase font-medium">
                                {order.car.brand} {order.car.model}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {format(new Date(order.order_date), "dd.MM.yyyy HH:mm")}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase flex-shrink-0 ${
                                statusOptions.find((s) => s.value === order.status)?.color
                              }`}
                            >
                              {order.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-muted-foreground">{tp("Итого")}</span>
                              <div className="font-bold text-foreground">{order.total_amount.toLocaleString("ro-MD")} MDL</div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-muted-foreground">{tp("Прибыль")}</span>
                              <div className="font-bold text-green-600">{economy.grossProfit.toLocaleString("ro-MD")} MDL</div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-muted-foreground">{tp("Работы")}</span>
                              <div className="font-medium text-primary">
                                {economy.workRevenue > 0 ? `${economy.workRevenue.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-muted-foreground">{tp("Запчасти")}</span>
                              <div className="font-medium text-foreground/80">
                                {economy.partsRevenue > 0 ? `${economy.partsRevenue.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </div>
                            </div>
                            {(order.debt_amount || 0) > 0 && (
                              <div className="space-y-0.5">
                                <span className="text-muted-foreground">{tp("Долг")}</span>
                                <div className="font-medium text-amber-600">{order.debt_amount?.toLocaleString("ro-MD")} MDL</div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-end pt-1">
                            <Link href={`/orders/${order.id}`} prefetch={false}>
                              <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs">
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                {tp("Детали")}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-border/80">
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Дата")} sortKey="date" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Клиент")} sortKey="client" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Автомобиль")} sortKey="car" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Статус")} sortKey="status" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Работы")}</th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Запчасти")}</th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Себест.")}</th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Долг")} sortKey="debt" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Прибыль")} sortKey="profit" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Итого")} sortKey="total" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Детали")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {sortedOrders.slice(0, 50).map((order) => {
                          const economy = getOrderEconomy(order.items || []);
                          return (
                            <tr key={order.id} className="hover:bg-primary/5 transition-colors group [content-visibility:auto] [contain-intrinsic-size:0_72px] [contain:layout_style_paint]">
                              <td className="py-3 px-3.5 whitespace-nowrap font-medium text-foreground/80">
                                {format(new Date(order.order_date), "dd.MM.yyyy HH:mm")}
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="font-semibold text-foreground">{order.client.full_name}</div>
                              </td>
                              <td className="py-3 px-3.5 font-semibold text-foreground/90 whitespace-nowrap uppercase">
                                {order.car.brand} {order.car.model}
                              </td>
                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                                    statusOptions.find((s) => s.value === order.status)?.color
                                  }`}
                                >
                                  {order.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-3.5 text-right font-medium text-primary">
                                {economy.workRevenue > 0 ? `${economy.workRevenue.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="py-3 px-3.5 text-right font-medium text-foreground/80">
                                {economy.partsRevenue > 0 ? `${economy.partsRevenue.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="py-3 px-3.5 text-right font-medium text-muted-foreground">
                                {economy.partsCost > 0 ? `${economy.partsCost.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="py-3 px-3.5 text-right font-medium text-amber-600">
                                {(order.debt_amount || 0) > 0 ? `${order.debt_amount?.toLocaleString("ro-MD")} MDL` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="py-3 px-3.5 text-right font-bold text-green-600">
                                {economy.grossProfit.toLocaleString("ro-MD")} MDL
                              </td>
                              <td className="py-3 px-3.5 text-right font-bold text-foreground">
                                {order.total_amount.toLocaleString("ro-MD")} MDL
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <Link href={`/orders/${order.id}`} prefetch={false} aria-label={tp("Открыть заказ")}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    tabIndex={-1}
                                    aria-label={tp("Открыть заказ")}
                                    className="h-9 w-9 rounded-lg hover:bg-primary/20 hover:text-primary transition-colors duration-150"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {sortedOrders.length > 50 && (
                      <p className="text-center py-4 text-xs font-semibold text-muted-foreground/80">
                        {tp("Показано")} 50 {tp("из")} {sortedOrders.length} {tp("записей анализа")}. {tp("Выгрузите Excel/PDF, чтобы увидеть полный список.")}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* RENDER TAB 2: SERVICE HISTORY */}
      {tab === "history" && (
        <div className="space-y-6">
          {/* Columns Visibility Constructor */}
          <Card className="glass-card border-border/60">
            <CardHeader className="pb-2.5 border-b border-border/30">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
                <Settings2 className="h-4 w-4 text-primary" />
                Конструктор колонок отчета истории
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {Object.keys(visibleColumns).map((col) => {
                  const key = col as keyof VisibleColumns;
                  const labels: Record<string, string> = {
                    date: tp("Дата"),
                    client: tp("Клиент"),
                    phone: tp("Телефон"),
                    car: tp("Марка/Модель"),
                    plate: tp("Госномер"),
                    mileage: tp("Пробег"),
                    vin: "VIN",
                    notes: tp("Примечания"),
                    items: tp("Детали (работы/детали)"),
                    status: tp("Статус"),
                    amount: tp("Сумма"),
                  };
                  return (
                    <label
                      key={col}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-xl cursor-pointer select-none text-xs font-semibold transition-colors duration-150 hover:bg-secondary/5 ${
                        visibleColumns[key]
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : "border-border/60 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={(e) =>
                          setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="rounded border-border/80 accent-primary h-3.5 w-3.5"
                      />
                      <span>{labels[key] || key}</span>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Results Table (Tabular log) */}
          <Card className="glass-card border-border/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
              <div>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80" style={{ fontFamily: 'var(--font-oswald)' }}>
                  {tp("Лог обслуживания")} ({sortedOrders.length} {tp("записей обслуживания")})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 px-1 sm:px-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs uppercase tracking-wider font-semibold">{tp("Идет загрузка отчета...")}</p>
                </div>
              ) : sortedOrders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{tp("Нет сервисных записей по данным фильтрам")}</p>
                  <p className="text-xs mt-1">{tp("Попробуйте увеличить период или изменить выборку клиентов")}</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-3 px-4 pb-4">
                    {sortedOrders.slice(0, 50).map((order) => (
                      <div key={order.id} className="p-4 rounded-xl border border-border/60 bg-card/80 space-y-2 [content-visibility:auto] [contain-intrinsic-size:0_220px] [contain:layout_style_paint]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{order.client.full_name}</div>
                            <div className="text-xs text-muted-foreground uppercase font-medium">
                              {order.car.brand} {order.car.model}
                            </div>
                            <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                              {format(new Date(order.order_date), "dd.MM.yyyy HH:mm")}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase flex-shrink-0 ${
                              statusOptions.find((s) => s.value === order.status)?.color
                            }`}
                          >
                            {order.status}
                          </Badge>
                        </div>
                        {visibleColumns.phone && (
                          <div className="text-xs text-muted-foreground">{order.client.phone}</div>
                        )}
                        {visibleColumns.plate && order.car.license_plate && (
                          <span className="inline-block px-2 py-0.5 bg-secondary/15 text-foreground rounded-md border border-border font-mono text-[11px]">
                            {order.car.license_plate}
                          </span>
                        )}
                        {visibleColumns.items && order.items && order.items.length > 0 && (
                          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                            {order.items.map((it) => (
                              <div key={it.id} className="flex justify-between items-center gap-2 border-b border-border/10 pb-0.5 last:border-0">
                                <span className={`text-xs truncate max-w-[140px] ${it.type === 'work' ? 'text-primary/95 font-medium' : 'text-muted-foreground'}`}>
                                  {it.name}
                                </span>
                                <span className="text-xs text-foreground/80 flex-shrink-0 font-semibold">
                                  {it.selling_price} MDL
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <div className="text-sm font-bold text-foreground">
                            {order.total_amount.toLocaleString("ro-MD")} MDL
                          </div>
                          <Link href={`/orders/${order.id}`} prefetch={false}>
                            <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs">
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {tp("Детали")}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-border/80">
                          {visibleColumns.date && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Дата")} sortKey="date" sort={sort} onSort={toggleSort} /></th>}
                          {visibleColumns.client && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Клиент")} sortKey="client" sort={sort} onSort={toggleSort} /></th>}
                          {visibleColumns.phone && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Телефон")}</th>}
                          {visibleColumns.car && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Автомобиль")} sortKey="car" sort={sort} onSort={toggleSort} /></th>}
                          {visibleColumns.plate && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Гос. номер")}</th>}
                          {visibleColumns.mileage && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Пробег")}</th>}
                          {visibleColumns.vin && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("VIN")}</th>}
                          {visibleColumns.items && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[180px]" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Детализация")}</th>}
                          {visibleColumns.notes && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Примечания")}</th>}
                          {visibleColumns.status && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Статус")} sortKey="status" sort={sort} onSort={toggleSort} align="center" /></th>}
                          {visibleColumns.amount && <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Сумма")} sortKey="total" sort={sort} onSort={toggleSort} align="right" /></th>}
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Детали")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {sortedOrders.slice(0, 50).map((order) => (
                          <tr key={order.id} className="hover:bg-primary/5 transition-colors group [content-visibility:auto] [contain-intrinsic-size:0_84px] [contain:layout_style_paint]">
                            {visibleColumns.date && (
                              <td className="py-3 px-3.5 whitespace-nowrap font-medium text-foreground/80">
                                {format(new Date(order.order_date), "dd.MM.yyyy HH:mm")}
                              </td>
                            )}
                            {visibleColumns.client && (
                              <td className="py-3 px-3.5">
                                <div className="font-semibold text-foreground">{order.client.full_name}</div>
                              </td>
                            )}
                            {visibleColumns.phone && (
                              <td className="py-3 px-3.5 text-muted-foreground whitespace-nowrap">
                                {order.client.phone}
                              </td>
                            )}
                            {visibleColumns.car && (
                              <td className="py-3 px-3.5 font-semibold text-foreground/90 whitespace-nowrap uppercase">
                                {order.car.brand} {order.car.model}
                              </td>
                            )}
                            {visibleColumns.plate && (
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                {order.car.license_plate ? (
                                  <span className="px-2 py-0.5 bg-secondary/15 text-foreground rounded-md border border-border font-mono text-xs">
                                    {order.car.license_plate}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            )}
                            {visibleColumns.mileage && (
                              <td className="py-3 px-3.5 text-right whitespace-nowrap font-medium text-muted-foreground">
                                {order.car_mileage || order.car.mileage ? `${formatMileage(order.car_mileage || order.car.mileage)} км` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                            )}
                            {visibleColumns.vin && (
                              <td className="py-3 px-3.5 font-mono text-xs text-muted-foreground">
                                {order.car.vin || <span className="text-muted-foreground/30">—</span>}
                              </td>
                            )}
                            {visibleColumns.items && (
                              <td className="py-3 px-3.5">
                                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                                  {order.items && order.items.length > 0 ? (
                                    order.items.map((it) => (
                                      <div key={it.id} className="flex justify-between items-center gap-2 border-b border-border/10 pb-0.5 last:border-0">
                                        <span className={`text-xs truncate max-w-[130px] ${it.type === 'work' ? 'text-primary/95 font-medium' : 'text-muted-foreground'}`}>
                                          {it.name}
                                        </span>
                                        <span className="text-xs text-foreground/80 flex-shrink-0 font-semibold">
                                          {it.selling_price} MDL
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40 italic">{tp("Пусто")}</span>
                                  )}
                                </div>
                              </td>
                            )}
                            {visibleColumns.notes && (
                              <td className="py-3 px-3.5 max-w-xs truncate text-muted-foreground">
                                {order.notes || <span className="text-muted-foreground/30">—</span>}
                              </td>
                            )}
                            {visibleColumns.status && (
                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                                    statusOptions.find((s) => s.value === order.status)?.color
                                  }`}
                                >
                                  {order.status}
                                </Badge>
                              </td>
                            )}
                            {visibleColumns.amount && (
                              <td className="py-3 px-3.5 text-right font-bold text-foreground">
                                {order.total_amount.toLocaleString("ro-MD")} MDL
                              </td>
                            )}
                            <td className="py-3 px-3.5 text-center">
                              <Link href={`/orders/${order.id}`} prefetch={false} aria-label={tp("Открыть заказ")}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  tabIndex={-1}
                                  aria-label={tp("Открыть заказ")}
                                  className="h-9 w-9 rounded-lg hover:bg-primary/20 hover:text-primary transition-colors duration-150"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sortedOrders.length > 50 && (
                      <p className="text-center py-4 text-xs font-semibold text-muted-foreground/80">
                        {tp("Показано")} 50 {tp("из")} {sortedOrders.length} {tp("записей обслуживания")}. {tp("Выгрузите Excel/PDF, чтобы увидеть полный список.")}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "mechanics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Исполнителей")}</p>
                <p className="text-3xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-bebas)' }}>{filteredMechanicRows.length}</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Работ выполнено")}</p>
                <p className="text-3xl font-extrabold mt-1 text-primary" style={{ fontFamily: 'var(--font-bebas)' }}>
                  {filteredMechanicRows.reduce((sum, row) => sum + row.worksCount, 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Сумма работ")}</p>
                <p className="text-3xl font-extrabold mt-1 text-green-600" style={{ fontFamily: 'var(--font-bebas)' }}>
                  {filteredMechanicRows.reduce((sum, row) => sum + row.totalAmount, 0).toLocaleString("ro-MD")} MDL
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card border-border/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80" style={{ fontFamily: 'var(--font-oswald)' }}>
                {tp("Отчет по механикам")} ({filteredMechanicRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-1 sm:px-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs uppercase tracking-wider font-semibold">{tp("Идет загрузка отчета...")}</p>
                </div>
              ) : filteredMechanicRows.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <UserRoundCog className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{selectedMechanicKeys.length > 0 ? tp("Нет работ по выбранным механикам") : tp("Нет выполненных работ по данным фильтрам")}</p>
                  <p className="text-xs mt-1">{selectedMechanicKeys.length > 0 ? tp("Попробуйте выбрать других механиков или измените период") : tp("Назначьте исполнителя в позициях заказа или измените период")}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/70">
                    <table className="w-full min-w-[680px] text-sm text-left">
                      <thead>
                        <tr className="border-b border-border/80 bg-secondary/10">
                          <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Механик ФИО")}</th>
                          <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Сделал работ")}</th>
                          <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Сумма с работ")}</th>
                          <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("ЗП")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredMechanicRows.map((row) => (
                          <tr key={row.key} className="hover:bg-primary/5 transition-colors">
                            <td className="py-4 px-4 font-bold">{row.mechanicName}</td>
                            <td className="py-4 px-4 text-right font-semibold">{row.worksCount}</td>
                            <td className="py-4 px-4 text-right font-extrabold text-primary">{row.totalAmount.toLocaleString("ro-MD")} MDL</td>
                            <td className="py-4 px-4 text-right font-extrabold text-amber-600">{(row.totalAmount / 2).toLocaleString("ro-MD")} MDL</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-4">
                    {filteredMechanicRows.map((row) => (
                      <div key={row.key} className="rounded-xl border border-border/70 bg-card/70 overflow-hidden">
                        <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold">{row.mechanicName}</h3>
                            <p className="text-xs text-muted-foreground">{tp("Работы этого механика за выбранный период")}</p>
                          </div>
                          <div className="text-sm font-bold text-primary">{row.totalAmount.toLocaleString("ro-MD")} MDL</div>
                        </div>
                        <div className="sm:hidden divide-y divide-border/40">
                          {row.works.map((work) => (
                            <div key={`${row.key}-${work.itemId}`} className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm">{work.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(work.order.order_date), "dd.MM.yyyy")} · {work.order.client.full_name}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-sm whitespace-nowrap text-amber-600">{tp("ЗП")}: {(work.totalPrice / 2).toLocaleString("ro-MD")} MDL</div>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {work.order.car.brand} {work.order.car.model} {work.order.car.license_plate ? `· ${work.order.car.license_plate}` : ""}
                              </div>
                              <Link href={`/orders/${work.order.id}`} prefetch={false}>
                                <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs">
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  {tp("Детали")}
                                </Button>
                              </Link>
                            </div>
                          ))}
                        </div>
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="border-b border-border/80">
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Дата")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Работа")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Клиент")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Автомобиль")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Кол-во")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Цена")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("ЗП")}</th>
                                <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">{tp("Детали")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {row.works.map((work) => (
                                <tr key={`${row.key}-${work.itemId}`} className="hover:bg-primary/5 transition-colors">
                                  <td className="py-3 px-4 whitespace-nowrap">{format(new Date(work.order.order_date), "dd.MM.yyyy")}</td>
                                  <td className="py-3 px-4 font-semibold">{work.name}</td>
                                  <td className="py-3 px-4">{work.order.client.full_name}</td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    {work.order.car.brand} {work.order.car.model}
                                    {work.order.car.license_plate && <div className="text-xs text-muted-foreground">{work.order.car.license_plate}</div>}
                                  </td>
                                  <td className="py-3 px-4 text-right">{work.quantity.toLocaleString("ro-MD")}</td>
                                  <td className="py-3 px-4 text-right">{work.sellingPrice.toLocaleString("ro-MD")} MDL</td>
                                  <td className="py-3 px-4 text-right font-bold text-amber-600">{(work.totalPrice / 2).toLocaleString("ro-MD")} MDL</td>
                                  <td className="py-3 px-4 text-center">
                                    <Link href={`/orders/${work.order.id}`} prefetch={false} aria-label={tp("Открыть заказ")}>
                                      <Button variant="ghost" size="icon" tabIndex={-1} aria-label={tp("Открыть заказ")} className="h-9 w-9 rounded-lg hover:bg-primary/20 hover:text-primary">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "debtors" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Должников")}</p>
                <p className="text-3xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-bebas)' }}>{debtorRows.length}</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Общий долг")}</p>
                <p className="text-3xl font-extrabold mt-1 text-amber-600" style={{ fontFamily: 'var(--font-bebas)' }}>
                  {summary.totalDebt.toLocaleString("ro-MD")} MDL
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/60">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Самый старый долг")}</p>
                <p className="text-3xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-bebas)' }}>
                  {debtorRows[0]?.debtAgeDays || 0} {tp("дн.")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card border-border/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80" style={{ fontFamily: 'var(--font-oswald)' }}>
                {tp("Реестр должников")} ({debtorRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-1 sm:px-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs uppercase tracking-wider font-semibold">{tp("Идет загрузка отчета...")}</p>
                </div>
              ) : debtorRows.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">{tp("Долгов по выбранным фильтрам нет")}</p>
                  <p className="text-xs mt-1">{tp("Выберите другой период или клиента, если нужен старый долг.")}</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-3 px-4 pb-4">
                    {debtorRows.slice(0, 50).map(({ order, paidAmount, debtAmount, debtAgeDays }) => (
                      <div key={order.id} className="p-4 rounded-xl border border-border/60 bg-card/80 space-y-2 [content-visibility:auto] [contain-intrinsic-size:0_190px] [contain:layout_style_paint]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{order.client.full_name}</div>
                            <div className="text-xs text-muted-foreground">{order.client.phone}</div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">
                              {order.car.brand} {order.car.model} · {order.car.license_plate || tp("без номера")}
                            </div>
                          </div>
                          <div className="text-xs text-right flex-shrink-0">
                            <div className="font-bold text-amber-600">{debtAmount.toLocaleString("ro-MD")} MDL</div>
                            <div className="text-muted-foreground">{debtAgeDays} {tp("дн.")}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Сумма")}</span>
                            <div className="font-medium">{order.total_amount.toLocaleString("ro-MD")} MDL</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Оплачено")}</span>
                            <div className="font-medium text-green-600">{paidAmount.toLocaleString("ro-MD")} MDL</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Дата долга")}</span>
                            <div className="font-medium">{order.debt_started_at ? format(new Date(order.debt_started_at), "dd.MM.yyyy") : "—"}</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Дата ремонта")}</span>
                            <div className="font-medium">{format(new Date(order.order_date), "dd.MM.yyyy")}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end pt-1">
                          <Link href={`/orders/${order.id}/edit`} prefetch={false}>
                            <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs">
                              {tp("Закрыть долг")}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[980px]">
                      <thead>
                        <tr className="border-b border-border/80">
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Дата")} sortKey="date" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Клиент")} sortKey="client" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Телефон")}</th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Автомобиль")} sortKey="car" sort={sort} onSort={toggleSort} /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Сумма")} sortKey="total" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Оплачено")} sortKey="paid" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Долг")} sortKey="debt" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Дата долга")}</th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}><SortButton label={tp("Дней")} sortKey="debtAge" sort={sort} onSort={toggleSort} align="right" /></th>
                          <th className="py-3.5 px-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Действие")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {debtorRows.slice(0, 50).map(({ order, paidAmount, debtAmount, debtAgeDays }) => (
                          <tr key={order.id} className="hover:bg-primary/5 transition-colors [content-visibility:auto] [contain-intrinsic-size:0_78px] [contain:layout_style_paint]">
                            <td className="py-3 px-3.5 whitespace-nowrap font-medium">{format(new Date(order.order_date), "dd.MM.yyyy")}</td>
                            <td className="py-3 px-3.5 font-semibold">{order.client.full_name}</td>
                            <td className="py-3 px-3.5 text-muted-foreground whitespace-nowrap">{order.client.phone}</td>
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-semibold">{order.car.brand} {order.car.model}</div>
                              <div className="text-xs text-muted-foreground">
                                {order.car.license_plate || tp("без номера")}
                                {(order.car_mileage || order.car.mileage) && ` · ${formatMileage(order.car_mileage || order.car.mileage)} ${tp("км")}`}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-right font-medium">{order.total_amount.toLocaleString("ro-MD")} MDL</td>
                            <td className="py-3 px-3.5 text-right font-medium text-green-600">{paidAmount.toLocaleString("ro-MD")} MDL</td>
                            <td className="py-3 px-3.5 text-right font-bold text-amber-600">{debtAmount.toLocaleString("ro-MD")} MDL</td>
                            <td className="py-3 px-3.5 text-center whitespace-nowrap">{order.debt_started_at ? format(new Date(order.debt_started_at), "dd.MM.yyyy") : "—"}</td>
                            <td className="py-3 px-3.5 text-right font-bold">{debtAgeDays}</td>
                            <td className="py-3 px-3.5 text-center">
                              <Link href={`/orders/${order.id}/edit`} prefetch={false}>
                                <Button variant="outline" className="h-9 px-3 text-xs rounded-lg">
                                  {tp("Закрыть долг")}
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {debtorRows.length > 50 && (
                      <p className="text-center py-4 text-xs font-semibold text-muted-foreground/80">
                        {tp("Показано")} 50 {tp("из")} {debtorRows.length} {tp("Должников")}. {tp("Выгрузите Excel/PDF, чтобы увидеть полный список.")}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
