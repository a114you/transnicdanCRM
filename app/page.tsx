import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { DashboardStats, DashboardOrders, type DashboardPeriod } from "@/components/dashboard/DashboardData";
import { OrderDraftNotice } from "@/components/layout/OrderDraftNotice";
import { tr } from "@/lib/i18n";
import { getServerLanguage } from "@/lib/server-i18n";
import { Suspense } from "react";

function StatsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card p-6 h-[120px] animate-pulse bg-muted/20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card h-[180px] animate-pulse bg-muted/20 rounded-xl xl:col-span-2" />
        <div className="glass-card h-[180px] animate-pulse bg-muted/20 rounded-xl" />
      </div>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="glass-card border-border/80 rounded-xl overflow-hidden xl:col-span-2">
        <div className="h-16 bg-secondary/5 border-b border-border/40 animate-pulse" />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-[112px] animate-pulse bg-muted/10 rounded-lg" />)}
        </div>
      </div>
      <div className="glass-card h-[300px] animate-pulse bg-muted/20 rounded-xl" />
      <div className="glass-card border-border/80 rounded-xl overflow-hidden xl:col-span-3">
        <div className="h-16 bg-secondary/5 border-b border-border/40 animate-pulse" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-[72px] border-b border-border/40 animate-pulse bg-muted/10" />)}
      </div>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const language = await getServerLanguage();
  const params = await searchParams;
  const period: DashboardPeriod = params?.period === "week" || params?.period === "all" ? params.period : "month";

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-8 pb-8 lg:pb-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-5 p-4 sm:p-5 lg:p-6 glass-card bg-secondary/5 border-white/5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            SPARK CRM
          </p>
          <h1 className="text-2xl min-[390px]:text-3xl sm:text-4xl lg:text-[2.5rem] font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {tr("Панель управления", language)}
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 shrink-0">
          <Link href="/clients/new" className="w-full sm:w-auto">
            <Button className="btn-garage h-11 px-5 text-sm w-full sm:w-auto">
              <Plus className="h-5 w-5 mr-2" strokeWidth={2.5} />
              {tr("Новый клиент", language)}
            </Button>
          </Link>
          <Link href="/orders/new" className="w-full sm:w-auto">
            <Button className="btn-garage-secondary h-11 px-5 text-sm w-full sm:w-auto">
              <Plus className="h-5 w-5 mr-2" strokeWidth={2.5} />
              {tr("Новый ремонт", language)}
            </Button>
          </Link>
        </div>
      </div>

      <GlobalSearch />

      <OrderDraftNotice language={language} />

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats language={language} period={period} />
      </Suspense>

      <Suspense fallback={<OrdersSkeleton />}>
        <DashboardOrders language={language} period={period} />
      </Suspense>
    </div>
  );
}
