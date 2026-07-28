import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, FileText, User, Car, Phone, Mail, Clock, AlertCircle, Wrench, Package, Receipt, History, CreditCard } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { getOrderById, getOrdersByClientId } from "@/lib/supabase";
import {
  getDebtAgeDays,
  getOrderEconomy,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  PAYMENT_ENTRY_METHOD_LABELS,
  PAYMENT_ENTRY_METHOD_LABELS_RO,
} from "@/lib/finance";
import { formatMileage } from "@/lib/act-report";
import { OrderExportActions } from "./OrderExportActions";
import { format } from "date-fns";
import { ru, ro } from "date-fns/locale";
import { tr } from "@/lib/i18n";
import { getServerLanguage } from "@/lib/server-i18n";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [order, language] = await Promise.all([getOrderById(id), getServerLanguage()]);
  const tp = (s: string) => tr(s, language);
  const dateLocale = language === "ro" ? ro : ru;
  const entryMethodLabels = language === "ro" ? PAYMENT_ENTRY_METHOD_LABELS_RO : PAYMENT_ENTRY_METHOD_LABELS;

  if (!order) {
    notFound();
  }

  const clientOrders = await getOrdersByClientId(order.client_id);
  const history = clientOrders.filter(o => o.id !== order.id).slice(0, 5);

  const statusColors: Record<string, string> = {
    "Новый": "bg-blue-100 text-blue-800 border-blue-200",
    "В работе": "bg-amber-100 text-amber-800 border-amber-200",
    "Готов": "bg-green-100 text-green-800 border-green-200",
    "Выдан": "bg-zinc-200 text-zinc-700 border-zinc-300",
  };

  const workItems = order.items?.filter(item => item.type === "work") || [];
  const partItems = order.items?.filter(item => item.type === "part") || [];
  const economy = getOrderEconomy(order.items || []);
  const paidAmount = order.paid_amount ?? order.total_amount;
  const debtAmount = order.debt_amount || 0;
  const paymentStatus = order.payment_status || "paid";
  const repairMileage = order.car_mileage || order.car.mileage || 0;
  const debtAgeDays = getDebtAgeDays(order.debt_started_at);

  const paymentStatusColors: Record<string, string> = {
    paid: "bg-green-100 text-green-800 border-green-200",
    partial: "bg-amber-100 text-amber-800 border-amber-200",
    unpaid: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* HEADER SECTION with navigation and download actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 sm:p-6 glass-card bg-secondary/5 border-white/5">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton href="/orders" label={tp("Назад к списку ремонтов")} ariaLabel={tp("Назад к списку ремонтов")} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 flex-shrink-0 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{tp("Ремонтный заказ")}</span>
            </div>
            <h1 className="mt-0.5 truncate text-xl min-[390px]:text-2xl font-extrabold uppercase tracking-wider text-foreground sm:text-3xl">
              {tp("Заказ #")}{order.id.slice(0, 8)}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(order.order_date), "dd MMMM yyyy, HH:mm", { locale: dateLocale })}
              {" · "}
              {workItems.length} {tp("раб.")} · {partItems.length} {tp("запч.")}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
          <Badge
            variant="outline"
            className={`justify-center text-xs px-3 py-1 rounded-full font-bold uppercase ${
              statusColors[order.status] || "bg-muted"
            }`}
          >
            {tp(order.status)}
          </Badge>
          <div className="h-6 w-[1px] bg-border/40 hidden sm:block" />
          <OrderExportActions orderId={id} />
          <Link href={`/orders/${id}/edit`}>
            <Button className="btn-garage h-10 sm:h-11 w-full sm:w-auto px-4 sm:px-5 text-xs sm:text-sm">
              <Edit className="h-4 w-4 mr-2" />
              {tp("Редактировать")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid: Client & Car Details Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client Card */}
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
              <User className="h-5 w-5 text-primary" />
              {tp("Клиент")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-3.5">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("ФИО Клиента")}</div>
              <div className="mt-0.5 break-words text-lg font-bold text-foreground">{order.client.full_name}</div>
            </div>
            
            <div className="flex min-w-0 items-center gap-3 pt-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider leading-none">{tp("Телефон")}</div>
                <a href={`tel:${order.client.phone}`} className="mt-0.5 block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary">
                  {order.client.phone}
                </a>
              </div>
            </div>

            {order.client.email && (
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider leading-none">Email</div>
                  <a href={`mailto:${order.client.email}`} className="mt-0.5 block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary">
                    {order.client.email}
                  </a>
                </div>
              </div>
            )}

            {order.client.notes && (
              <div className="pt-2 border-t border-border/30">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("Заметки к клиенту")}</div>
                <p className="text-xs text-muted-foreground leading-relaxed break-words">{order.client.notes}</p>
              </div>
            )}
            
            <div className="pt-3 border-t border-border/40 flex justify-end">
              <Link href={`/clients/${order.client.id}`}>
                <Button variant="link" className="p-0 text-primary font-bold uppercase tracking-wider text-xs min-h-[24px]" style={{ fontFamily: 'var(--font-oswald)' }}>
                  {tp("Перейти в карточку клиента →")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Car Card */}
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
              <Car className="h-5 w-5 text-primary" />
              {tp("Автомобиль")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Марка / Модель")}</div>
              <div className="mt-0.5 break-words text-base font-extrabold uppercase text-foreground">{order.car.brand} {order.car.model}</div>
              </div>
              {order.car.year && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Год выпуска")}</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{order.car.year}</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/20">
              {order.car.license_plate && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Госномер")}</div>
                  <div className="mt-1 w-fit max-w-full break-all rounded border border-border/40 bg-secondary/15 px-2 py-0.5 font-mono text-sm text-foreground">
                    {order.car.license_plate}
                  </div>
                </div>
              )}
              {repairMileage > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Пробег на ремонте")}</div>
                  <div className="text-sm font-bold text-foreground mt-1">{formatMileage(repairMileage)} км</div>
                </div>
              )}
            </div>

            {order.car.vin && (
              <div className="pt-3 border-t border-border/20">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("VIN код автомобиля")}</div>
                <div className="mt-1 w-fit max-w-full break-all rounded border border-border/30 bg-secondary/10 px-2 py-1 font-mono text-sm text-foreground/90">
                  {order.car.vin}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/80">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
            <CreditCard className="h-5 w-5 text-primary" />
            {tp("Оплата и долг")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Способ")}</div>
            <div className="font-bold mt-1">{getPaymentMethodLabel(order.payment_method || "cash", language)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Статус оплаты")}</div>
            <Badge variant="outline" className={`mt-1 ${paymentStatusColors[paymentStatus]}`}>
              {getPaymentStatusLabel(paymentStatus, language)}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Оплачено")}</div>
            <div className="mt-1 break-words font-bold text-green-600">{paidAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Долг")}</div>
            <div className={`mt-1 break-words font-bold ${debtAmount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
              {debtAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Дата долга")}</div>
            <div className="font-medium mt-1">
              {debtAmount > 0 && order.debt_started_at ? format(new Date(order.debt_started_at), "dd.MM.yyyy") : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Дней в долге")}</div>
            <div className={`font-bold mt-1 ${debtAmount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
              {debtAmount > 0 ? `${debtAgeDays} ${tp("дн.")}` : "—"}
            </div>
          </div>
          </div>
          {order.payment_entries && order.payment_entries.length > 0 && (
            <div className="overflow-x-auto border border-border/40 rounded-xl">
              <table className="w-full text-sm text-left min-w-[560px]">
                <thead>
                  <tr className="bg-secondary/5 border-b border-border/30">
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Дата")}</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Способ")}</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{tp("Сумма")}</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{tp("Комментарий")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {order.payment_entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="p-3 whitespace-nowrap font-medium">{format(new Date(entry.paid_at), "dd.MM.yyyy")}</td>
                      <td className="p-3">{entryMethodLabels[entry.method]}</td>
                      <td className="p-3 text-right font-bold text-green-600">{entry.amount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</td>
                      <td className="p-3 text-muted-foreground">{entry.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repair Items & Details */}
      <Card className="glass-card border-border/80">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl sm:p-6">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
            <FileText className="h-5 w-5 text-primary" />
            {tp("Спецификация работ и материалов")} ({order.items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:p-6">
          {/* Work list */}
          {workItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
                <Wrench className="h-4 w-4" />
                {tp("Выполненные работы")}
              </h2>
              <div className="overflow-x-auto border border-border/40 rounded-xl">
                <table className="w-full text-sm text-left min-w-[440px]">
                  <thead>
                    <tr className="bg-secondary/5 border-b border-border/30">
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Наименование")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Кол-во")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Цена")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Сумма")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {workItems.map((item) => (
                      <tr key={item.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3.5 font-semibold text-foreground/90">{item.name}</td>
                        <td className="p-3.5 text-right font-medium">{item.quantity}</td>
                        <td className="p-3.5 text-right font-medium">{item.selling_price.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</td>
                        <td className="p-3.5 text-right font-bold text-foreground">{item.total_price.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Parts list */}
          {partItems.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
                <Package className="h-4 w-4" />
                {tp("Использованные запчасти и детали")}
              </h2>
              <div className="overflow-x-auto border border-border/40 rounded-xl">
                <table className="w-full text-sm text-left min-w-[520px]">
                  <thead>
                    <tr className="bg-secondary/5 border-b border-border/30">
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Наименование")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Бренд")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Код")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Источник")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Кол-во")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Цена")}</th>
                      <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Сумма")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {partItems.map((item) => (
                      <tr key={item.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3.5 font-semibold text-foreground/90">{item.name}</td>
                        <td className="p-3.5 font-semibold text-foreground/70 uppercase">{item.brand || "—"}</td>
                        <td className="p-3.5 font-mono text-muted-foreground">{item.code || "—"}</td>
                        <td className="p-3.5 text-muted-foreground">
                          {item.source === "warehouse" ? tp("Склад") : item.supplier_name || tp("Ручной ввод")}
                        </td>
                        <td className="p-3.5 text-right font-medium">{item.quantity}</td>
                        <td className="p-3.5 text-right font-medium">{item.selling_price.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</td>
                        <td className="p-3.5 text-right font-bold text-foreground">{item.total_price.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.notes && (
            <div className="rounded-xl border border-border/40 bg-secondary/5 p-4">
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{tp("Заметки к заказу")}</div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">{order.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-border/30">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <Receipt className="h-5 w-5 text-primary mb-2" />
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Итого клиенту")}</div>
              <div className="text-2xl font-bold mt-1">{order.total_amount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</div>
            </div>
            <div className="p-4 bg-secondary/5 border border-border/50 rounded-xl">
              <Wrench className="h-5 w-5 text-muted-foreground mb-2" />
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Работы")}</div>
              <div className="text-2xl font-bold mt-1">{economy.workRevenue.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</div>
            </div>
            <div className="p-4 bg-secondary/5 border border-border/50 rounded-xl">
              <Package className="h-5 w-5 text-muted-foreground mb-2" />
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{tp("Запчасти")}</div>
              <div className="text-2xl font-bold mt-1">{economy.partsRevenue.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
              <History className="h-5 w-5 text-primary" />
              {tp("История обслуживания клиента")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/20">
              {history.map((histOrder) => (
                <Link
                  key={histOrder.id}
                  href={`/orders/${histOrder.id}`}
                  className="flex flex-col gap-3 p-4 transition-colors duration-150 hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded">
                        #{histOrder.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {histOrder.car.brand} {histOrder.car.model}
                      </span>
                      {histOrder.car.license_plate && (
                        <span className="px-2 py-0.5 bg-secondary/15 border border-border text-xs rounded font-mono">
                          {histOrder.car.license_plate}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      {format(new Date(histOrder.order_date), "dd MMMM yyyy, HH:mm", { locale: ru })}
                    </div>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-foreground flex-shrink-0 ml-4">
                    {histOrder.total_amount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground/80 flex items-center gap-2" style={{ fontFamily: 'var(--font-oswald)' }}>
              <AlertCircle className="h-5 w-5 text-primary" />
              {tp("Примечания к заказу")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {order.notes}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
