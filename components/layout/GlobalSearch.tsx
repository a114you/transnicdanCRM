"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, User, Car as CarIcon, Loader2, X, FileText, Package, Building2, UserRoundCog, Wrench } from "lucide-react";
import { globalSearch } from "@/lib/supabase";
import type { ClientWithCars, Car, Employee, OrderItem, OrderWithDetails, Supplier, WarehousePart } from "@/lib/types";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

interface SearchResult {
  clients: ClientWithCars[];
  cars: Car[];
  orders: OrderWithDetails[];
  orderItems: (OrderItem & { order?: OrderWithDetails })[];
  warehouseParts: WarehousePart[];
  suppliers: Supplier[];
  employees: Employee[];
}

export function GlobalSearch() {
  const { tp } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search - triggers after user stops typing for 300ms
  useEffect(() => {
    if (!query.trim()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(query);
        setResults(data);
        setShowResults(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query]);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function clearSearch() {
    setQuery("");
    setResults(null);
    setShowResults(false);
  }

  return (
    <div className="relative w-full max-w-4xl lg:max-w-5xl mx-auto" ref={searchRef}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          {loading ? (
            <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
          ) : (
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          )}
          <Input
            type="text"
            aria-label={tp("Универсальный поиск по клиентам, авто, заказам, работам, складу...")}
            placeholder={tp("Универсальный поиск по клиентам, авто, заказам, работам, складу...")}
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (value.trim()) {
                setLoading(true);
              } else {
                setResults(null);
                setShowResults(false);
                setLoading(false);
              }
            }}
            onFocus={() => results && setShowResults(true)}
            className="text-base h-12 lg:h-14 pl-11 pr-11 bg-background border-border/70 focus:border-primary rounded-2xl shadow-sm lg:shadow-md lg:hover:shadow-lg transition-shadow"
          />
          {query && (
            <button
              type="button"
              aria-label={tp("Очистить поиск")}
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="hidden sm:flex h-12 w-12 items-center justify-center bg-muted/60 border border-border/60 rounded-xl">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Search className="h-5 w-5 text-muted-foreground" />}
        </div>
      </div>

      {showResults && results && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover rounded-2xl border border-border/80 z-50 max-h-96 overflow-auto">
          {results.clients.length === 0 &&
          results.cars.length === 0 &&
          results.orders.length === 0 &&
          results.orderItems.length === 0 &&
          results.warehouseParts.length === 0 &&
          results.suppliers.length === 0 &&
          results.employees.length === 0 ? (
            <div className="p-6 text-muted-foreground text-center text-sm">{tp("Ничего не найдено")}</div>
          ) : (
            <div className="divide-y divide-border/60">
              {results.clients.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Клиенты")}</div>
                  {results.clients.map((client) => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150"
                      onClick={() => setShowResults(false)}
                    >
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{client.full_name}</div>
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.cars.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Автомобили")}</div>
                  {results.cars.map((car) => (
                    <Link
                      key={car.id}
                      href={`/clients/${car.client_id}`}
                      className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150"
                      onClick={() => setShowResults(false)}
                    >
                      <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                        <CarIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{car.brand} {car.model}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {car.license_plate} {car.vin && `• ${car.vin}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.orders.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Заказы")}</div>
                  {results.orders.map((order) => (
                    <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150" onClick={() => setShowResults(false)}>
                      <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">#{order.id.slice(0, 8).toUpperCase()} · {order.client.full_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{order.car.brand} {order.car.model} {order.car.license_plate && `• ${order.car.license_plate}`}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.orderItems.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Работы и позиции заказов")}</div>
                  {results.orderItems.map((item) => (
                    <Link key={item.id} href={`/orders/${item.order_id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150" onClick={() => setShowResults(false)}>
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.type === "work" ? tp("Работа") : tp("Запчасть")}
                          {item.order?.client?.full_name && ` • ${item.order.client.full_name}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.warehouseParts.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Склад")}</div>
                  {results.warehouseParts.map((part) => (
                    <Link key={part.id} href="/warehouse" className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150" onClick={() => setShowResults(false)}>
                      <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{part.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{part.brand || tp("Без бренда")} {part.code && `• ${part.code}`} • {part.quantity} {tp("шт.")}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.employees.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Сотрудники")}</div>
                  {results.employees.map((employee) => (
                    <Link key={employee.id} href="/employees" className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150" onClick={() => setShowResults(false)}>
                      <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
                        <UserRoundCog className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{employee.full_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{employee.role} {employee.phone && `• ${employee.phone}`}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {results.suppliers.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-2" style={{ fontFamily: 'var(--font-oswald)' }}>{tp("Поставщики")}</div>
                  {results.suppliers.map((supplier) => (
                    <Link key={supplier.id} href="/settings" className="flex items-center gap-3 p-3 hover:bg-accent/40 rounded-xl transition-colors duration-150" onClick={() => setShowResults(false)}>
                      <div className="p-2 bg-zinc-500/10 rounded-lg text-zinc-500">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{tp("Скидка")} {supplier.discount_percent}%</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
