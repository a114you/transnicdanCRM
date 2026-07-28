"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Car, ArrowRight, Phone, Users, Search, X, StickyNote } from "lucide-react";
import type { ClientWithCars } from "@/lib/types";
import type { Language } from "@/lib/i18n";
import { tr } from "@/lib/i18n";
import { useState } from "react";

interface ClientsListProps {
  initialClients: ClientWithCars[];
  total: number;
  language: Language;
}

const pageSize = 40;

export function ClientsList({ initialClients, total, language }: ClientsListProps) {
  const [clients, setClients] = useState(initialClients);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredClients = normalizedQuery
    ? clients.filter((client) => [
        client.full_name,
        client.phone,
        client.email,
        client.notes,
        ...(client.cars || []).flatMap((car) => [car.brand, car.model, car.license_plate, car.vin, car.notes]),
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
    : clients;
  const hasMore = clients.length < total;

  async function loadMore() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients?limit=${pageSize}&offset=${clients.length}`);
      if (!response.ok) throw new Error("Failed to load clients");
      const payload = await response.json() as { clients: ClientWithCars[] };
      setClients((current) => [...current, ...payload.clients]);
    } finally {
      setLoading(false);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-16 px-6">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <Users className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <p className="text-xl text-muted-foreground mb-4">
          {tr("Пока нет клиентов в базе", language)}
        </p>
        <Link href="/clients/new">
          <Button className="btn-garage h-11 px-5 text-sm">
            {tr("Добавить первого клиента", language)}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="p-3 sm:p-4 md:p-6 border-b-2 border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("Поиск клиента, телефона, авто, госномера, VIN...", language)}
            className="h-11 pl-9 pr-10 text-sm sm:text-base"
          />
          {query && (
            <button type="button" aria-label={tr("Очистить поиск", language)} onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {normalizedQuery && (
          <p className="mt-2 text-xs text-muted-foreground">{tr("Найдено", language)}: {filteredClients.length}</p>
        )}
      </div>
      <div className="divide-y-2 divide-border">
        {filteredClients.map((client) => {
          const carCount = client.cars?.length || 0;
          const plates = (client.cars || [])
            .map((c) => c.license_plate)
            .filter(Boolean)
            .slice(0, 3);
          return (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              prefetch={false}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 md:p-6 hover:bg-muted/50 transition-colors duration-100 [content-visibility:auto] [contain-intrinsic-size:0_112px] [contain:layout_style_paint]"
            >
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg sm:text-xl md:text-2xl font-semibold truncate max-w-full">
                    {client.full_name}
                  </div>
                  {carCount > 0 && (
                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {carCount} {tr("авто", language)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 text-sm sm:text-base text-muted-foreground">
                  <span className="flex items-center gap-2 min-w-0">
                    <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="truncate font-medium tabular-nums">{client.phone}</span>
                  </span>
                  {client.email && (
                    <span className="truncate text-xs sm:text-sm max-w-[200px] hidden sm:inline">{client.email}</span>
                  )}
                </div>
                {carCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Car className="h-3.5 w-3.5 flex-shrink-0 text-primary/80" />
                    <span className="truncate max-w-full">
                      {(client.cars || [])
                        .slice(0, 2)
                        .map((car) => `${car.brand} ${car.model}${car.year ? ` (${car.year})` : ""}`)
                        .join(" · ")}
                      {carCount > 2 ? ` +${carCount - 2}` : ""}
                    </span>
                    {plates.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {plates.map((p) => (
                          <span key={p} className="font-mono text-[10px] sm:text-xs px-1.5 py-0.5 rounded border border-border bg-secondary/15">
                            {p}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {client.notes && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground/90 line-clamp-1 max-w-xl">
                    <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{client.notes}</span>
                  </p>
                )}
              </div>

              <div className="mt-3 sm:mt-0 sm:ml-4 flex-shrink-0 self-end sm:self-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150">
                  <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {tr("Ничего не найдено", language)}
        </div>
      )}

      {!normalizedQuery && hasMore && (
        <div className="border-t-2 border-border p-4 sm:p-6 text-center">
          <Button type="button" variant="outline" onClick={loadMore} disabled={loading} className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
            {loading ? tr("Загрузка...", language) : `${tr("Показать еще", language)} ${Math.min(pageSize, total - clients.length)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
