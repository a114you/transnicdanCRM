import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Car,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  Minus,
  Package,
  Plus,
  ReceiptText,
  TrendingUp,
  UserRoundCog,
  Users,
  Wrench,
} from "lucide-react";
import { getDashboardCounts, getEmployees, getOrders, getTodaysOrders } from "@/lib/supabase";
import { getDebtAgeDays, getOrderEconomy, getPaymentStatusLabel, money } from "@/lib/finance";
import { tr, type Language } from "@/lib/i18n";
import type { OrderWithDetails } from "@/lib/types";
import { endOfMonth, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ru, ro } from "date-fns/locale";

interface DashboardDataProps {
  language: Language;
  period: DashboardPeriod;
}

export type DashboardPeriod = "week" | "month" | "all";

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

function formatMoney(value: number) {
  return value.toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function orderDate(order: OrderWithDetails) {
  return new Date(order.order_date);
}

function isSameDay(date: Date, reference: Date) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate();
}

function orderPaid(order: OrderWithDetails) {
  return Number(order.paid_amount ?? order.total_amount) || 0;
}

function orderDebt(order: OrderWithDetails) {
  return Number(order.debt_amount) || Math.max(0, (Number(order.total_amount) || 0) - orderPaid(order));
}

function getMechanicName(order: OrderWithDetails) {
  return Array.from(new Set((order.items || []).filter((item) => item.type === "work").map((item) => item.mechanic_name).filter(Boolean))).join(", ");
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

function periodLabel(period: DashboardPeriod, language: Language) {
  if (period === "week") return tr("Текущая неделя", language);
  if (period === "all") return tr("За все время", language);
  return tr("Текущий месяц", language);
}

function changePercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function periodEconomy(orders: OrderWithDetails[]) {
  const revenue = money(orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0));
  const paid = money(orders.reduce((sum, order) => sum + orderPaid(order), 0));
  const grossProfit = money(orders.reduce((sum, order) => sum + getOrderEconomy(order.items || []).grossProfit, 0));
  const worksCount = orders.reduce((sum, order) => sum + (order.items || []).filter((item) => item.type === "work").length, 0);
  return {
    revenue,
    paid,
    grossProfit,
    ordersCount: orders.length,
    worksCount,
    avgTicket: orders.length ? money(revenue / orders.length) : 0,
  };
}

function buildDashboard(orders: OrderWithDetails[], todaysOrders: OrderWithDetails[], period: DashboardPeriod) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfMonth(now);
  const previousMonth = subMonths(now, 1);
  const previousMonthStart = startOfMonth(previousMonth);
  const previousMonthEnd = endOfMonth(previousMonth);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const periodStart = period === "week" ? weekStart : period === "all" ? null : monthStart;
  const periodEnd = period === "week" ? now : period === "all" ? null : monthEnd;
  const activeOrders = orders.filter((order) => order.status === "Новый" || order.status === "В работе");
  const readyOrders = orders.filter((order) => order.status === "Готов");
  const issuedOrders = orders.filter((order) => order.status === "Выдан");
  const debtOrders = orders.filter((order) => orderDebt(order) > 0);
  const todayIssued = orders.filter((order) => order.status === "Выдан" && isSameDay(orderDate(order), now));
  const monthOrders = orders.filter((order) => inRange(orderDate(order), monthStart, monthEnd));
  const previousMonthOrders = orders.filter((order) => inRange(orderDate(order), previousMonthStart, previousMonthEnd));
  const periodOrders = period === "all" ? orders : orders.filter((order) => inRange(orderDate(order), periodStart!, periodEnd!));

  const revenueToday = money(todaysOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0));
  const paidToday = money(todaysOrders.reduce((sum, order) => sum + orderPaid(order), 0));
  const debtTotal = money(debtOrders.reduce((sum, order) => sum + orderDebt(order), 0));
  const debtAging = [
    { label: "0-7", orders: [] as OrderWithDetails[], amount: 0 },
    { label: "8-30", orders: [] as OrderWithDetails[], amount: 0 },
    { label: "30+", orders: [] as OrderWithDetails[], amount: 0 },
  ];
  debtOrders.forEach((order) => {
    const age = getDebtAgeDays(order.debt_started_at || order.order_date, now);
    const bucket = age <= 7 ? debtAging[0] : age <= 30 ? debtAging[1] : debtAging[2];
    bucket.orders.push(order);
    bucket.amount = money(bucket.amount + orderDebt(order));
  });
  const activeValue = money(activeOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0));
  const readyValue = money(readyOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0));
  const selected = periodEconomy(periodOrders);
  const currentMonth = periodEconomy(monthOrders);
  const previousMonthStats = periodEconomy(previousMonthOrders);

  const mechanics = new Map<string, { name: string; orders: Set<string>; works: number; amount: number }>();
  periodOrders.forEach((order) => {
    (order.items || []).filter((item) => item.type === "work").forEach((item) => {
      if (!item.mechanic_name) return;
      const name = item.mechanic_name;
      const current = mechanics.get(name) || { name, orders: new Set<string>(), works: 0, amount: 0 };
      current.orders.add(order.id);
      current.works += 1;
      current.amount = money(current.amount + (Number(item.total_price) || 0));
      mechanics.set(name, current);
    });
  });

  const mechanicRows = Array.from(mechanics.values())
    .map((row) => ({ ...row, ordersCount: row.orders.size }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const attentionOrders = [...activeOrders, ...readyOrders, ...debtOrders]
    .filter((order, index, source) => source.findIndex((candidate) => candidate.id === order.id) === index)
    .sort((a, b) => {
      const debtDiff = orderDebt(b) - orderDebt(a);
      if (debtDiff !== 0) return debtDiff;
      return orderDate(b).getTime() - orderDate(a).getTime();
    })
    .slice(0, 7);

  return {
    activeOrders,
    readyOrders,
    issuedOrders,
    debtOrders,
    todayIssued,
    periodStart,
    periodEnd,
    periodOrders,
    revenueToday,
    paidToday,
    debtTotal,
    debtAging,
    activeValue,
    readyValue,
    selected,
    currentMonth,
    previousMonth: previousMonthStats,
    mechanicRows,
    attentionOrders,
  };
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Banknote;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass = tone === "warning" ? "bg-amber-500/10 text-amber-600" : tone === "success" ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary";

  return (
    <Card className="glass-card border-border/80">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
            <p className="mt-2 break-words text-2xl font-extrabold leading-tight text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${toneClass}`}>
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PeriodSwitcher({ period, language }: { period: DashboardPeriod; language: Language }) {
  return (
    <div className="grid w-full grid-cols-3 rounded-lg border border-border/70 bg-secondary/10 p-1 sm:inline-grid sm:w-auto">
      {[
        { value: "week" as DashboardPeriod, label: tr("Неделя", language) },
        { value: "month" as DashboardPeriod, label: tr("Текущий месяц", language) },
        { value: "all" as DashboardPeriod, label: tr("Все время", language) },
      ].map((item) => (
        <Link
          key={item.value}
          href={`/?period=${item.value}`}
          className={`rounded-md px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide transition-colors sm:px-3 sm:text-xs ${
            period === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function ComparisonRow({ label, current, previous, suffix = "MDL", language }: { label: string; current: number; previous: number; suffix?: string; language: Language }) {
  const diff = changePercent(current, previous);
  const positive = diff > 0;
  const neutral = diff === 0;
  const Icon = neutral ? Minus : TrendingUp;
  const value = suffix === "%" ? `${current}%` : `${formatMoney(current)} ${suffix}`;

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-right font-bold">{value}</span>
      </div>
      <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${neutral ? "text-muted-foreground" : positive ? "text-green-600" : "text-red-600"}`}>
        <Icon className={`h-3.5 w-3.5 ${!neutral && !positive ? "rotate-180" : ""}`} />
        {diff > 0 ? "+" : ""}{diff}% {tr("к прошлому месяцу", language)}
      </div>
    </div>
  );
}

function MiniOrder({ order, language }: { order: OrderWithDetails; language: Language }) {
  return (
    <Link href={`/orders/${order.id}`} className="block rounded-lg border border-border/60 p-3 hover:bg-primary/5 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
            <span className="font-semibold text-sm truncate">{order.client.full_name}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {order.car.brand} {order.car.model} {order.car.license_plate ? `· ${order.car.license_plate}` : ""}
          </div>
          {getMechanicName(order) && <div className="mt-1 text-xs text-muted-foreground">{tr("Исполнитель", language)}: {getMechanicName(order)}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold">{formatMoney(Number(order.total_amount) || 0)} MDL</div>
          {orderDebt(order) > 0 && <div className="text-xs font-semibold text-amber-600">{formatMoney(orderDebt(order))} MDL {tr("долг", language)}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${statusColors[order.status] || "bg-muted border-border"}`}>
          {tr(order.status, language)}
        </Badge>
        <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${paymentStatusColors[order.payment_status || "paid"]}`}>
          {getPaymentStatusLabel(order.payment_status || "paid", language)}
        </Badge>
        <span className="text-[11px] text-muted-foreground ml-auto">{format(orderDate(order), "dd.MM HH:mm")}</span>
      </div>
    </Link>
  );
}

export async function DashboardStats({ language, period }: DashboardDataProps) {
  const [counts, todaysOrders, orders, employees] = await Promise.all([
    getDashboardCounts(),
    getTodaysOrders(),
    getOrders(250),
    getEmployees(),
  ]);
  const dashboard = buildDashboard(orders, todaysOrders, period);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>{periodLabel(period, language)}</h2>
          <p className="text-sm text-muted-foreground">
            {dashboard.periodStart && dashboard.periodEnd ? `${format(dashboard.periodStart, "dd.MM.yyyy")} - ${format(dashboard.periodEnd, "dd.MM.yyyy")}` : tr("Вся история заказов", language)}
          </p>
        </div>
        <PeriodSwitcher period={period} language={language} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title={tr("Оборот за период", language)}
          value={`${formatMoney(dashboard.selected.revenue)} MDL`}
          detail={`${dashboard.selected.ordersCount} ${tr("заказов", language)} · ${tr("оплачено", language)} ${formatMoney(dashboard.selected.paid)} MDL`}
          icon={Banknote}
          tone="success"
        />
        <MetricCard
          title={tr("Долги клиентов", language)}
          value={`${formatMoney(dashboard.debtTotal)} MDL`}
          detail={`${dashboard.debtOrders.length} ${tr("заказов", language)} ${tr("с долгом", language)}`}
          icon={AlertTriangle}
          tone={dashboard.debtTotal > 0 ? "warning" : "success"}
        />
        <MetricCard
          title={tr("Работы за период", language)}
          value={`${dashboard.selected.worksCount}`}
          detail={`${tr("Средний чек", language)} ${formatMoney(dashboard.selected.avgTicket)} MDL`}
          icon={Wrench}
        />
        <MetricCard
          title={tr("Готово к выдаче", language)}
          value={`${dashboard.readyOrders.length}`}
          detail={`${formatMoney(dashboard.readyValue)} MDL ${tr("ожидают клиента", language)}`}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="glass-card border-border/80 xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
              {tr("Операционная сводка", language)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: tr("Клиенты", language), value: counts.clientsCount, detail: `${counts.carsCount} ${tr("авто", language)}`, icon: Users },
                { label: tr("Активные механики", language), value: employees.length, detail: tr("доступны для работ", language), icon: UserRoundCog },
                { label: tr("Выдано сегодня", language), value: dashboard.todayIssued.length, detail: tr("закрытые заказы", language), icon: ReceiptText },
                { label: tr("Активно сейчас", language), value: dashboard.activeOrders.length, detail: `${formatMoney(dashboard.activeValue)} MDL`, icon: Gauge },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-border/60 p-4 bg-secondary/5">
                    <Icon className="h-4 w-4 text-primary mb-3" />
                    <div className="text-xl font-extrabold" style={{ fontFamily: "var(--font-oswald)" }}>{item.value}</div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
              {tr("Сравнение с прошлым месяцем", language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ComparisonRow label={tr("Оборот", language)} current={dashboard.currentMonth.revenue} previous={dashboard.previousMonth.revenue} language={language} />
            <ComparisonRow label={tr("Валовая прибыль", language)} current={dashboard.currentMonth.grossProfit} previous={dashboard.previousMonth.grossProfit} language={language} />
            <ComparisonRow label={tr("Заказы", language)} current={dashboard.currentMonth.ordersCount} previous={dashboard.previousMonth.ordersCount} suffix={tr("шт.", language)} language={language} />
            <Link href="/reports">
              <Button variant="outline" className="mt-2 h-10 w-full text-xs font-bold uppercase tracking-wider">
                {tr("Открыть отчеты", language)}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {tr("Возраст долгов", language)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {dashboard.debtAging.map((bucket, index) => {
              const share = dashboard.debtTotal ? Math.round((bucket.amount / dashboard.debtTotal) * 100) : 0;
              const tone = index === 0 ? "bg-green-500" : index === 1 ? "bg-amber-500" : "bg-red-500";
              return (
                <div key={bucket.label} className="rounded-lg border border-border/60 p-4 bg-secondary/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{bucket.label} {tr("дней", language)}</div>
                      <div className="mt-1 text-xl font-extrabold" style={{ fontFamily: "var(--font-oswald)" }}>{formatMoney(bucket.amount)} MDL</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{bucket.orders.length}</div>
                      <div className="text-[11px] text-muted-foreground">{tr("заказов", language)}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${tone}`} style={{ width: `${share}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{share}% {tr("от общей задолженности", language)}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export async function DashboardOrders({ language, period }: DashboardDataProps) {
  const [orders, todaysOrders] = await Promise.all([getOrders(250), getTodaysOrders()]);
  const dashboard = buildDashboard(orders, todaysOrders, period);
  const recentOrders = orders.slice(0, 8);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="glass-card border-border/80 xl:col-span-2 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
              <Clock className="h-5 w-5 text-primary" strokeWidth={2} />
              {tr("Требуют внимания", language)}
            </CardTitle>
            <Link href="/orders" className="w-full sm:w-auto">
              <Button variant="outline" className="h-10 w-full sm:w-auto text-xs font-bold uppercase tracking-wider">
                {tr("Все ремонты", language)}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {dashboard.attentionOrders.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-3" />
              <p className="font-semibold text-muted-foreground">{tr("Нет срочных задач", language)}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {dashboard.attentionOrders.map((order) => <MiniOrder key={order.id} order={order} language={language} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
            <UserRoundCog className="h-5 w-5 text-primary" />
            {tr("Механики", language)} · {periodLabel(period, language)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboard.mechanicRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("Нет выполненных работ за период", language)}</p>
          ) : dashboard.mechanicRows.map((row) => (
            <div key={row.name} className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-sm font-semibold">{row.name}</div>
                <div className="shrink-0 text-right text-sm font-bold">{formatMoney(row.amount)} MDL</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{row.ordersCount} {tr("заказов", language)} · {row.works} {tr("работ", language)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card border-border/80 xl:col-span-3 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-oswald)" }}>
              <FileText className="h-5 w-5 text-primary" strokeWidth={2} />
              {tr("Последние ремонты", language)}
            </CardTitle>
            <Link href="/orders/new" className="w-full sm:w-auto">
              <Button className="btn-garage h-10 w-full sm:w-auto text-xs font-bold uppercase tracking-wider">
                <Plus className="h-4 w-4 mr-2" />
                {tr("Новый ремонт", language)}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-base font-semibold text-muted-foreground mb-3">{tr("Пока нет заказов на ремонт", language)}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentOrders.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`} className="group flex flex-col lg:flex-row lg:items-center justify-between p-5 hover:bg-primary/5 transition-colors gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded">#{order.id.slice(0, 8).toUpperCase()}</span>
                      <span className="font-bold text-base text-foreground truncate">{order.client.full_name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1 text-foreground/80">
                        <Car className="h-3.5 w-3.5 text-primary" />
                        {order.car.brand} {order.car.model}
                      </span>
                      {order.car.license_plate && <span className="px-2 py-0.5 bg-secondary/15 border border-border text-xs rounded font-mono">{order.car.license_plate}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground/80 font-semibold uppercase tracking-wider">
                        {format(orderDate(order), "dd MMMM yyyy, HH:mm", { locale: language === "ro" ? ro : ru })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 lg:gap-4">
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${paymentStatusColors[order.payment_status || "paid"]}`}>
                      {getPaymentStatusLabel(order.payment_status || "paid", language)}
                    </Badge>
                    <Badge variant="outline" className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${statusColors[order.status] || "bg-muted border-border"}`}>
                      {tr(order.status, language)}
                    </Badge>
                    <div className="text-base font-extrabold text-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-oswald)" }}>
                      {formatMoney(order.total_amount)} MDL
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
