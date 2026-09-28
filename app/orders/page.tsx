import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText } from "lucide-react";
import { getOrders } from "@/lib/supabase";
import { tr } from "@/lib/i18n";
import { getServerLanguage } from "@/lib/server-i18n";
import { OrdersList } from "./OrdersList";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";

export default async function OrdersPage() {
  const language = await getServerLanguage();
  const orders = await getOrders(100000);

  const active = orders.filter((o) => o.status === "Новый" || o.status === "В работе").length;
  const ready = orders.filter((o) => o.status === "Готов").length;
  const debt = orders.reduce((s, o) => s + (Number(o.debt_amount) || 0), 0);

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<FileText className="h-5 w-5" />}
        title={tr("Ремонты", language)}
        description={tr("Управление заказами на обслуживание", language)}
        actions={
          <Link href="/orders/new" className="w-full sm:w-auto">
            <Button className="btn-garage h-11 px-5 text-sm w-full sm:w-auto">
              <Plus className="h-5 w-5 mr-2" strokeWidth={2.5} />
              {tr("Новый ремонт", language)}
            </Button>
          </Link>
        }
      />

      {orders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label={tr("Всего", language)} value={orders.length} />
          <StatCard label={tr("Активные", language)} value={active} tone="primary" />
          <StatCard label={tr("Готово к выдаче", language)} value={ready} tone="success" />
          <StatCard
            label={tr("Долг", language)}
            value={`${debt.toLocaleString("ro-MD", { maximumFractionDigits: 0 })}`}
            hint="MDL"
            tone={debt > 0 ? "warning" : "default"}
          />
        </div>
      )}

      <Card className="glass-card border-border/80 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-4 sm:p-5 rounded-t-2xl">
          <CardTitle className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wider">
            <FileText className="h-4 w-4 text-primary" />
            {tr("Все заказы на ремонт", language)}
            <span className="text-muted-foreground font-normal normal-case tracking-normal">({orders.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-base font-semibold text-muted-foreground mb-3">
                {tr("Пока нет заказов на ремонт", language)}
              </p>
              <Link href="/orders/new">
                <Button className="btn-garage h-11 px-5 text-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {tr("Создать первый заказ", language)}
                </Button>
              </Link>
            </div>
          ) : (
            <OrdersList orders={orders} language={language} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
