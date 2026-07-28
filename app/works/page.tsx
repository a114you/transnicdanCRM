"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { createWorkTemplate, deleteWorkTemplate, getWorkTemplates, updateWorkTemplate } from "@/lib/supabase";
import { money } from "@/lib/finance";
import type { WorkTemplate, WorkTemplateFormData } from "@/lib/types";
import { Edit, Save, Search, Trash2, X, Wrench, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";

type SortKey = "code" | "name" | "category" | "price";
type SortDir = "asc" | "desc";

const emptyForm: WorkTemplateFormData = {
  name: "",
  code: "",
  default_price: 0,
  category: "",
};

const listPageSize = 60;

export default function WorksPage() {
  const { tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [works, setWorks] = useState<WorkTemplate[]>([]);
  const [form, setForm] = useState<WorkTemplateFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(listPageSize);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const data = await getWorkTemplates();
    setWorks(data);
    setVisibleCount(listPageSize);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredWorks = useMemo(() => {
    const result = normalizedQuery
      ? works.filter((w) => {
          return [
            w.code,
            w.name,
            w.category,
          ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
        })
      : works;

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "code") {
        cmp = (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: "base" });
      } else if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortKey === "category") {
        cmp = (a.category || "").localeCompare(b.category || "", undefined, { sensitivity: "base" });
      } else if (sortKey === "price") {
        cmp = a.default_price - b.default_price;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [works, normalizedQuery, sortKey, sortDir]);
  const visibleWorks = filteredWorks.slice(0, visibleCount);
  const hasMoreWorks = visibleCount < filteredWorks.length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function editWork(work: WorkTemplate) {
    setEditingId(work.id);
    setForm({
      name: work.name,
      code: work.code || "",
      default_price: work.default_price,
      category: work.category || "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showAlert(tp("Введите название работы"), { variant: "warning" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      code: form.code || null,
      default_price: money(Math.max(Number(form.default_price) || 0, 0)),
      category: form.category || null,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateWorkTemplate(editingId, payload);
      } else {
        await createWorkTemplate(payload);
      }
      resetForm();
      await loadData();
    } catch {
      showAlert(tp("Ошибка при сохранении работы"), { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function removeWork(id: string) {
    const confirmed = await showConfirm(tp("Удалить работу из каталога?"), { destructive: true });
    if (!confirmed) return;
    try {
      await deleteWorkTemplate(id);
      await loadData();
      if (editingId === id) resetForm();
    } catch {
      showAlert(tp("Ошибка при удалении работы"), { variant: "error" });
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<Wrench className="h-5 w-5" />}
        title={tp("Список работ")}
        description={tp("Каталог работ сервиса для быстрого выбора при оформлении заказа")}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={tp("Позиций")} value={works.length} />
        <StatCard label={tp("С ценой")} value={works.filter((w) => w.default_price > 0).length} tone="success" />
        <StatCard label={tp("Без цены")} value={works.filter((w) => w.default_price === 0).length} tone="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {editingId ? tp("Редактировать работу") : tp("Новая работа")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="work-code">{tp("Код работы")}</Label>
                <Input id="work-code" value={form.code || ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="h-11" placeholder={tp("напр. 1, 001, A1...")} />
                <p className="text-[11px] text-muted-foreground">{tp("Короткий код для быстрого поиска работы")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-name">{tp("Название работы")}</Label>
                <Input id="work-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-price">{tp("Цена по умолчанию")} (MDL)</Label>
                <NumberInput id="work-price" min="0" step="0.01" value={form.default_price} onValueChange={(value) => setForm((f) => ({ ...f, default_price: value }))} className="h-11" />
                <p className="text-[11px] text-muted-foreground">{tp("Если указана, цена подставляется при выборе работы в заказе")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-category">{tp("Категория")}</Label>
                <Input id="work-category" value={form.category || ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="h-11" placeholder={tp("напр. Двигатель, Тормоза, Подвеска...")} />
              </div>
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
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Список работ")} ({works.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(listPageSize);
                  }}
                  placeholder={tp("Поиск по коду или названию...")}
                  className="h-11 pl-9 pr-10"
                />
                {query && (
                  <button type="button" aria-label={tp("Очистить поиск")} onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {normalizedQuery && <p className="mt-2 text-xs text-muted-foreground">{tp("Найдено")}: {filteredWorks.length}</p>}
            </div>
            {works.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Wrench className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Работы пока не добавлены")}</p>
              </div>
            ) : filteredWorks.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
              </div>
            ) : (
              <>
                {/* Mobile Cards */}
                <div className="sm:hidden space-y-3 p-4">
                  {visibleWorks.map((work) => (
                    <div key={work.id} className="p-4 rounded-xl border border-border/60 bg-card/80 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-semibold">
                            {work.code && <span className="text-primary font-mono mr-2">{work.code}</span>}
                            {work.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                            {work.category && <span>{work.category}</span>}
                          </div>
                        </div>
                        {work.default_price > 0 && (
                          <span className="text-sm font-bold text-primary flex-shrink-0">{money(work.default_price).toLocaleString("ro-MD")} MDL</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => editWork(work)} className="h-9 rounded-lg px-3 text-xs">
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          {tp("Изменить")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => removeWork(work.id)} className="h-9 rounded-lg px-3 text-xs">
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          {tp("Удалить")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[650px]">
                    <thead>
                      <tr className="border-b border-border/60 bg-secondary/5">
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort("code")} className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Код")}<SortIcon columnKey="code" />
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort("name")} className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Название работы")}<SortIcon columnKey="name" />
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort("category")} className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Категория")}<SortIcon columnKey="category" />
                          </button>
                        </th>
                        <th className="p-3 text-right">
                          <button type="button" onClick={() => toggleSort("price")} className="flex items-center justify-end text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Цена")}<SortIcon columnKey="price" />
                          </button>
                        </th>
                        <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">{tp("Действия")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {visibleWorks.map((work) => (
                        <tr key={work.id} className="hover:bg-primary/5 transition-colors">
                          <td className="p-3 font-mono text-primary font-bold">{work.code || "—"}</td>
                          <td className="p-3 font-semibold">{work.name}</td>
                          <td className="p-3 text-muted-foreground">{work.category || "—"}</td>
                          <td className="p-3 text-right font-medium">{work.default_price > 0 ? `${money(work.default_price).toLocaleString("ro-MD")} MDL` : "—"}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="outline" size="icon" onClick={() => editWork(work)} aria-label={tp("Изменить")} className="h-9 w-9 rounded-xl">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="icon" onClick={() => removeWork(work.id)} aria-label={tp("Удалить")} className="h-9 w-9 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreWorks && (
                  <div className="border-t border-border/40 p-4 sm:p-5 text-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + listPageSize)} className="h-10 w-full rounded-xl px-5 text-sm sm:w-auto">
                      {tp("Показать еще")} {Math.min(listPageSize, filteredWorks.length - visibleCount)}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
