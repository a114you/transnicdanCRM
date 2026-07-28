import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users } from "lucide-react";
import { getClientsCount, getClientsList } from "@/lib/supabase";
import { tr } from "@/lib/i18n";
import { getServerLanguage } from "@/lib/server-i18n";
import { ClientsList } from "./ClientsList";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";

export default async function ClientsPage() {
  const language = await getServerLanguage();
  const [clients, clientsCount] = await Promise.all([getClientsList(), getClientsCount()]);
  const carsCount = clients.reduce((sum, c) => sum + (c.cars?.length || 0), 0);

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title={tr("Клиенты", language)}
        description={tr("База клиентов и их автомобилей", language)}
        actions={
          <Link href="/clients/new" className="w-full sm:w-auto">
            <Button className="btn-garage h-11 px-5 text-sm w-full sm:w-auto">
              <Plus className="h-5 w-5 mr-2" strokeWidth={2.5} />
              {tr("Новый клиент", language)}
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={tr("Всего клиентов", language)} value={clientsCount} />
        <StatCard label={tr("авто", language)} value={carsCount} tone="primary" />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label={tr("На странице", language)}
          value={clients.length}
          hint={clientsCount > clients.length ? tr("Показать еще", language) : undefined}
        />
      </div>

      <Card className="glass-card border-border/80 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-secondary/5 p-4 sm:p-5 rounded-t-2xl">
          <CardTitle className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wider">
            <Users className="h-4 w-4 text-primary" />
            {tr("Список клиентов", language)}
            <span className="text-muted-foreground font-normal normal-case tracking-normal">({clientsCount})</span>
          </CardTitle>
        </CardHeader>
        <ClientsList initialClients={clients} total={clientsCount} language={language} />
      </Card>
    </div>
  );
}
