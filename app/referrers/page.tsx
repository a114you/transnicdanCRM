"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createReferrer, deleteReferrer, getReferrers, getOrders, updateReferrer } from "@/lib/supabase";
import { money } from "@/lib/finance";
import type { Referrer, ReferrerFormData, ReferrerRewardType, OrderWithDetails } from "@/lib/types";
import { Edit, Gift, Save, Search, Trash2, Users, X } from "lucide-react";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { format } from "date-fns";

const emptyForm: ReferrerFormData = {
  full_name: "",
  phone: "",
  reward_type: "fixed",
  reward_fixed: 0,
  reward_percent: 0,
  active: true,
};

const listPageSize = 60;

export default function ReferrersPage() {
  const { tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [form, setForm] = useState<ReferrerFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(listPageSize);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [refData, orderData] = await Promise.all([getReferrers(true), getOrders(500)]);
    setReferrers(refData);
    setOrders(orderData);
    setVisibleCount(listPageSize);
  }

  const referrerStats = useMemo(() => {
    const stats = new Map<string, { totalReward: number; orderCount: number; orders: { id: string; date: string; amount: number; reward: number; client: string }[] }>();

    referrers.forEach((r) => stats.set(r.id, { totalReward: 0, orderCount: 0, orders: [] }));

    orders.forEach((order) => {
      if (!order.referrer_id) return;
      const stat = stats.get(order.referrer_id);
      if (!stat) return;
      stat.totalReward += order.referrer_reward || 0;
      stat.orderCount += 1;
      stat.orders.push({
        id: order.id,
        date: order.order_date,
        amount: order.total_amount,
        reward: order.referrer_reward || 0,
        client: order.client?.full_name || "",
      });
    });

    return stats;
  }, [referrers, orders]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredReferrers = normalizedQuery
    ? referrers.filter((r) => [r.full_name, r.phone, r.email].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
    : referrers;
  const visibleReferrers = filteredReferrers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredReferrers.length;

  const totalEarned = useMemo(() => referrers.reduce((sum, r) => sum + (referrerStats.get(r.id)?.totalReward || 0), 0), [referrers, referrerStats]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function editReferrer(referrer: Referrer) {
    setEditingId(referrer.id);
    setForm({
      full_name: referrer.full_name,
      phone: referrer.phone || "",
      email: referrer.email || "",
      reward_type: referrer.reward_type,
      reward_fixed: referrer.reward_fixed,
      reward_percent: referrer.reward_percent,
      active: referrer.active,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      showAlert(tp("Введите имя реферала"), { variant: "warning" });
      return;
    }

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      reward_type: form.reward_type,
      reward_fixed: money(form.reward_type === "fixed" ? Math.max(Number(form.reward_fixed) || 0, 0) : 0),
      reward_percent: money(form.reward_type === "percent" ? Math.min(Math.max(Number(form.reward_percent) || 0, 0), 100) : 0),
      active: form.active,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateReferrer(editingId, payload);
      } else {
        await createReferrer(payload);
      }
      resetForm();
      await loadData();
    } catch {
      showAlert(tp("Ошибка при сохранении реферала"), { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function removeReferrer(id: string) {
    const confirmed = await showConfirm(tp("Удалить реферала?"), { destructive: true });
    if (!confirmed) return;
    try {
      await deleteReferrer(id);
      await loadData();
      if (editingId === id) resetForm();
    } catch {
      showAlert(tp("Ошибка при удалении реферала"), { variant: "error" });
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title={tp("Рефералы")}
        description={tp("Партнёры, приводящие клиентов в автосервис")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={tp("Рефералов")} value={referrers.length} />
        <StatCard label={tp("Приведено заказов")} value={orders.filter((o) => o.referrer_id).length} tone="primary" />
        <StatCard label={tp("Общая сумма выплат")} value={totalEarned.toLocaleString("ro-MD")} hint="MDL" tone="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {editingId ? tp("Редактировать реферала") : tp("Новый реферал")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ref-name">{tp("ФИО *")}</Label>
                <Input id="ref-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ref-phone">{tp("Телефон")}</Label>
                <Input id="ref-phone" type="tel" value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label>{tp("Тип вознаграждения")}</Label>
                <Select value={form.reward_type} onValueChange={(v) => setForm((f) => ({ ...f, reward_type: v as ReferrerRewardType }))}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{tp("Фиксированная сумма (MDL)")}</SelectItem>
                    <SelectItem value="percent">{tp("Процент от работ (%)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.reward_type === "fixed" ? (
                <div className="space-y-2">
                  <Label htmlFor="ref-fixed">{tp("Сумма за клиента")} (MDL)</Label>
                  <NumberInput id="ref-fixed" min="0" step="1" value={form.reward_fixed} onValueChange={(v) => setForm((f) => ({ ...f, reward_fixed: v }))} className="h-11" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="ref-percent">{tp("Процент от работ")}</Label>
                  <NumberInput id="ref-percent" min="0" max="100" step="0.5" value={form.reward_percent} onValueChange={(v) => setForm((f) => ({ ...f, reward_percent: v }))} className="h-11" />
                </div>
              )}
              <label className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-4 w-4 accent-primary" />
                {tp("Активен")}
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="btn-garage h-11 px-5 text-sm flex-1">
                  <Save className="h-4 w-4" />
                  {loading ? tp("Сохранение...") : tp("Сохранить")}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm} className="h-11 w-11 p-0 rounded-xl">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/80 xl:col-span-2">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Список рефералов")} ({referrers.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setVisibleCount(listPageSize); }}
                  placeholder={tp("Поиск по имени, телефону...")}
                  className="h-11 pl-9 pr-10"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {referrers.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Рефералы пока не добавлены")}</p>
              </div>
            ) : filteredReferrers.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {visibleReferrers.map((referrer) => {
                  const stats = referrerStats.get(referrer.id);
                  return (
                    <div key={referrer.id} className="p-5 hover:bg-primary/5 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-lg">{referrer.full_name}</span>
                            <Badge variant="outline" className={referrer.active ? "bg-green-100 text-green-800 border-green-200" : "bg-zinc-200 text-zinc-700 border-zinc-300"}>
                              {referrer.active ? tp("Активен") : tp("Не активен")}
                            </Badge>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                              {referrer.reward_type === "fixed"
                                ? `${money(referrer.reward_fixed)} MDL`
                                : `${referrer.reward_percent}%`}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                            {referrer.phone && <span>{referrer.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" onClick={() => editReferrer(referrer)} className="h-10 w-10 rounded-xl">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => removeReferrer(referrer.id)} className="h-10 w-10 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Stats */}
                      {stats && stats.orderCount > 0 && (
                        <div className="mt-3 p-3 rounded-xl border border-border/40 bg-secondary/5 space-y-2">
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">{tp("Заработал")}:</span>
                              <span className="font-bold text-green-600 ml-2">{stats.totalReward.toLocaleString("ro-MD")} MDL</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{tp("Заказов")}:</span>
                              <span className="font-bold ml-2">{stats.orderCount}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {stats.orders.slice(0, 5).map((o) => (
                              <div key={o.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{format(new Date(o.date), "dd.MM.yyyy")}</span>
                                <span className="truncate">{o.client}</span>
                                <span className="ml-auto font-bold text-primary">{o.reward.toLocaleString("ro-MD")} MDL</span>
                              </div>
                            ))}
                            {stats.orders.length > 5 && (
                              <div className="text-xs text-muted-foreground">+{stats.orders.length - 5} {tp("ещё")}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {hasMore && (
                  <div className="p-4 sm:p-5 text-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((c) => c + listPageSize)} className="h-10 w-full rounded-xl px-5 text-sm sm:w-auto">
                      {tp("Показать еще")} {Math.min(listPageSize, filteredReferrers.length - visibleCount)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
