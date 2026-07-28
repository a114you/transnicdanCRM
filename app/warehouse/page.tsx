"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createWarehousePart, deleteWarehousePart, getSuppliers, getWarehouseParts, updateWarehousePart, createWarehouseMovement } from "@/lib/supabase";
import { money } from "@/lib/finance";
import type { Supplier, WarehousePart, WarehousePartFormData } from "@/lib/types";
import { Edit, History, Package, Save, Search, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "name" | "supplier" | "quantity" | "purchase" | "selling" | "margin";
type SortDir = "asc" | "desc";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";

const emptyForm: WarehousePartFormData = {
  name: "",
  code: "",
  brand: "",
  supplier_id: "",
  quantity: 0,
  min_quantity: 0,
  purchase_price: 0,
  selling_price: 0,
  location: "",
};

const listPageSize = 60;

function normalizeMoneyInput(value: number) {
  return money(Math.max(Number(value) || 0, 0));
}

export default function WarehousePage() {
  const { tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [parts, setParts] = useState<WarehousePart[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<WarehousePartFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(listPageSize);
  const [query, setQuery] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");
  const selectedSupplier = form.supplier_id ? suppliers.find((supplier) => supplier.id === form.supplier_id) : null;
  const existingPart = editingId ? parts.find((p) => p.id === editingId) : null;
  const isDecreasing = existingPart ? form.quantity < existingPart.quantity : false;

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
    const [supplierData, partData] = await Promise.all([getSuppliers(), getWarehouseParts()]);
    setSuppliers(supplierData);
    setParts(partData);
    setVisibleCount(listPageSize);
  }

  const supplierById = useMemo(() => {
    return new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  }, [suppliers]);

  const totals = useMemo(() => {
    return parts.reduce(
      (acc, part) => {
        acc.stockValue += part.quantity * part.purchase_price;
        acc.retailValue += part.quantity * part.selling_price;
        acc.lowStock += part.quantity <= part.min_quantity ? 1 : 0;
        return acc;
      },
      { stockValue: 0, retailValue: 0, lowStock: 0 }
    );
  }, [parts]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredParts = useMemo(() => {
    let result = normalizedQuery
      ? parts.filter((part) => {
          const supplier = part.supplier_id ? supplierById.get(part.supplier_id) : null;
          return [
            part.name,
            part.code,
            part.brand,
            part.location,
            part.notes,
            supplier?.name,
          ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
        })
      : parts;

    if (selectedSupplierId !== "all") {
      if (selectedSupplierId === "none") {
        result = result.filter((part) => !part.supplier_id);
      } else {
        result = result.filter((part) => part.supplier_id === selectedSupplierId);
      }
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortKey === "supplier") {
        const sA = a.supplier_id ? supplierById.get(a.supplier_id)?.name || "" : "";
        const sB = b.supplier_id ? supplierById.get(b.supplier_id)?.name || "" : "";
        cmp = sA.localeCompare(sB, undefined, { sensitivity: "base" });
      } else if (sortKey === "quantity") {
        cmp = a.quantity - b.quantity;
      } else if (sortKey === "purchase") {
        cmp = a.purchase_price - b.purchase_price;
      } else if (sortKey === "selling") {
        cmp = a.selling_price - b.selling_price;
      } else if (sortKey === "margin") {
        cmp = (a.selling_price - a.purchase_price) - (b.selling_price - b.purchase_price);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [parts, normalizedQuery, sortKey, sortDir, supplierById, selectedSupplierId]);
  const visibleParts = filteredParts.slice(0, visibleCount);
  const hasMoreParts = visibleCount < filteredParts.length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setRemovalReason("");
  }

  function editPart(part: WarehousePart) {
    setEditingId(part.id);
    setForm({
      name: part.name,
      code: part.code || "",
      brand: part.brand || "",
      supplier_id: part.supplier_id || "",
      quantity: part.quantity,
      min_quantity: part.min_quantity,
      purchase_price: part.purchase_price,
      selling_price: part.selling_price,
      location: part.location || "",
    });
  }

  function updateSupplierId(value: string) {
    const supplierId = value === "none" ? "" : value;
    setForm((current) => ({
      ...current,
      supplier_id: supplierId,
    }));
  }

  function updateSellingPrice(value: number) {
    setForm((current) => ({
      ...current,
      selling_price: normalizeMoneyInput(value),
    }));
  }

  function updatePurchasePrice(value: number) {
    setForm((current) => ({
      ...current,
      purchase_price: normalizeMoneyInput(value),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showAlert(tp("Введите название запчасти"), { variant: "warning" });
      return;
    }

    if (isDecreasing && !removalReason.trim()) {
      showAlert(tp("Укажите причину списания запчастей"), { variant: "warning" });
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      supplier_id: form.supplier_id || null,
      code: form.code || null,
      brand: form.brand || null,
      location: form.location || null,
      quantity: Math.max(Number(form.quantity) || 0, 0),
      min_quantity: Math.max(Number(form.min_quantity) || 0, 0),
      purchase_price: normalizeMoneyInput(form.purchase_price),
      selling_price: normalizeMoneyInput(form.selling_price),
    };

    setLoading(true);
    try {
      if (editingId) {
        const existingPart = parts.find((p) => p.id === editingId);
        const qtyDelta = payload.quantity - (existingPart?.quantity || 0);
        await updateWarehousePart(editingId, payload);
        if (qtyDelta !== 0) {
          const movementNote = qtyDelta < 0
            ? `Ручное списание: ${removalReason.trim()} (было: ${existingPart?.quantity || 0}, стало: ${payload.quantity})`
            : `Ручное добавление${existingPart ? ` (было: ${existingPart.quantity}, стало: ${payload.quantity})` : `(${payload.quantity} шт.)`}`;
          await createWarehouseMovement({
            warehouse_part_id: editingId,
            part_name: payload.name,
            part_code: payload.code,
            part_brand: payload.brand,
            delta: qtyDelta,
            quantity_before: existingPart?.quantity || 0,
            quantity_after: payload.quantity,
            movement_type: qtyDelta > 0 ? 'manual_add' : 'manual_remove',
            note: movementNote,
          });
          if (qtyDelta < 0) setRemovalReason("");
        }
      } else {
        const created = await createWarehousePart(payload);
        if (payload.quantity > 0) {
          await createWarehouseMovement({
            warehouse_part_id: created.id,
            part_name: payload.name,
            part_code: payload.code,
            part_brand: payload.brand,
            delta: payload.quantity,
            quantity_before: 0,
            quantity_after: payload.quantity,
            movement_type: 'initial',
            note: 'Первичное добавление на склад',
          });
        }
      }
      resetForm();
      await loadData();
    } catch {
      showAlert(tp("Ошибка при сохранении запчасти"), { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function removePart(id: string) {
    const confirmed = await showConfirm(tp("Удалить запчасть со склада?"), { destructive: true });
    if (!confirmed) return;
    try {
      const part = parts.find((p) => p.id === id);
      if (part && part.quantity > 0) {
        await createWarehouseMovement({
          warehouse_part_id: id,
          part_name: part.name,
          part_code: part.code,
          part_brand: part.brand,
          delta: -part.quantity,
          quantity_before: part.quantity,
          quantity_after: 0,
          movement_type: 'manual_remove',
          note: `Удаление запчасти со склада: ${part.name}${part.code ? ` [${part.code}]` : ''} — остаток ${part.quantity} шт.`,
        });
      }
      await deleteWarehousePart(id);
      await loadData();
      if (editingId === id) resetForm();
    } catch {
      showAlert(tp("Ошибка при удалении запчасти"), { variant: "error" });
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<Package className="h-5 w-5" />}
        title={tp("Склад запчастей")}
        description={tp("Остатки, себестоимость и продажные цены сервиса")}
        actions={
          <Link href="/warehouse/history" className="w-full sm:w-auto">
            <Button variant="outline" className="h-11 px-5 text-sm rounded-xl flex items-center gap-2 w-full sm:w-auto">
              <History className="h-4 w-4" />
              {tp("Движение запчастей")}
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={tp("Позиций")} value={parts.length} />
        <StatCard label={tp("Себестоимость склада")} value={`${money(totals.stockValue).toLocaleString("ro-MD")}`} hint="MDL" />
        <StatCard label={tp("Низкий остаток")} value={totals.lowStock} tone="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {editingId ? tp("Редактировать запчасть") : tp("Новая запчасть")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="part-name">{tp("Название")}</Label>
                <Input id="part-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="part-code">{tp("Код")}</Label>
                  <Input id="part-code" value={form.code || ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-brand">{tp("Бренд")}</Label>
                  <Input id="part-brand" value={form.brand || ""} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="part-supplier">{tp("Поставщик")}</Label>
                <Select value={form.supplier_id || "none"} onValueChange={(value) => value && updateSupplierId(value)}>
                  <SelectTrigger id="part-supplier" className="w-full h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tp("Без поставщика")}</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name} - {supplier.discount_percent}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="part-quantity">{tp("Остаток")}</Label>
                  <NumberInput id="part-quantity" min="0" step="1" value={form.quantity} onValueChange={(value) => setForm((f) => ({ ...f, quantity: value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-min-quantity">{tp("Мин. остаток")}</Label>
                  <NumberInput id="part-min-quantity" min="0" step="1" value={form.min_quantity} onValueChange={(value) => setForm((f) => ({ ...f, min_quantity: value }))} className="h-11" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="part-purchase-price">{tp("Себестоимость")}</Label>
                  <NumberInput id="part-purchase-price" min="0" step="0.01" value={form.purchase_price} onValueChange={updatePurchasePrice} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-selling-price">{tp("Цена клиенту")}</Label>
                  <NumberInput id="part-selling-price" min="0" step="0.01" value={form.selling_price} onValueChange={updateSellingPrice} className="h-11" />
                </div>
              </div>
              {selectedSupplier && (
                <p className="text-xs text-muted-foreground">
                  {tp("Скидка")} {selectedSupplier.discount_percent}%: {tp("используется как справочная информация поставщика.")}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="part-location">{tp("Место хранения")}</Label>
                <Input id="part-location" value={form.location || ""} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="h-11" />
              </div>
              {editingId && isDecreasing && (
                <div className="space-y-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20">
                  <Label htmlFor="part-removal-reason" className="text-red-700 dark:text-red-400">{tp("Причина списания")} *</Label>
                  <Input
                    id="part-removal-reason"
                    value={removalReason}
                    onChange={(e) => setRemovalReason(e.target.value)}
                    className="h-11 border-red-300 dark:border-red-500/30"
                    placeholder={tp("Обязательно укажите причину списания...")}
                    required
                  />
                  <p className="text-[11px] text-red-600 dark:text-red-400">{tp("Списание будет зафиксировано в истории движений запчастей")}</p>
                </div>
              )}
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
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Остатки")} ({parts.length})</CardTitle>
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
                  placeholder={tp("Поиск запчасти, кода, бренда, поставщика...")}
                  className="h-11 pl-9 pr-10"
                />
                {query && (
                  <button type="button" aria-label={tp("Очистить поиск")} onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {normalizedQuery && <p className="mt-2 text-xs text-muted-foreground">{tp("Найдено")}: {filteredParts.length}</p>}
            </div>
            {suppliers.length > 0 && (
              <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedSupplierId("all"); setVisibleCount(listPageSize); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedSupplierId === "all" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {tp("Все поставщики")}
                </button>
                {suppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelectedSupplierId(s.id); setVisibleCount(listPageSize); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedSupplierId === s.id ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {s.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setSelectedSupplierId("none"); setVisibleCount(listPageSize); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedSupplierId === "none" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {tp("Без поставщика")}
                </button>
              </div>
            )}
            {parts.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Склад пока пуст")}</p>
              </div>
            ) : filteredParts.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
              </div>
            ) : (
              <>
                {/* Mobile Cards */}
                <div className="sm:hidden space-y-3 p-4">
                  {visibleParts.map((part) => {
                    const supplier = part.supplier_id ? supplierById.get(part.supplier_id) : null;
                    const lowStock = part.quantity <= part.min_quantity;
                    return (
                      <div key={part.id} className="p-4 rounded-xl border border-border/60 bg-card/80 space-y-2 [content-visibility:auto] [contain-intrinsic-size:0_180px] [contain:layout_style_paint]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="break-words text-sm font-semibold">{part.name}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                              {part.brand && <span>{part.brand}</span>}
                              {part.code && <span className="font-mono">{part.code}</span>}
                              {part.location && <span>{part.location}</span>}
                            </div>
                          </div>
                          <Badge variant="outline" className={lowStock ? "bg-amber-100 text-amber-800 border-amber-200 flex-shrink-0" : "bg-green-100 text-green-800 border-green-200 flex-shrink-0"}>
                            {part.quantity} {tp("шт.")}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Себест.")}</span>
                            <div className="font-medium">{money(part.purchase_price).toLocaleString("ro-MD")} MDL</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Клиенту")}</span>
                            <div className="font-medium">{money(part.selling_price).toLocaleString("ro-MD")} MDL</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Маржа/шт")}</span>
                            <div className="font-bold text-primary">{money(part.selling_price - part.purchase_price).toLocaleString("ro-MD")} MDL</div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">{tp("Поставщик")}</span>
                            <div className="truncate">{supplier?.name || "—"}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => editPart(part)} className="h-9 rounded-lg px-3 text-xs">
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            {tp("Изменить")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => removePart(part.id)} className="h-9 rounded-lg px-3 text-xs">
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            {tp("Удалить")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[760px]">
                    <thead>
                      <tr className="border-b border-border/60 bg-secondary/5">
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort("name")} className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Запчасть")}<SortIcon columnKey="name" />
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort("supplier")} className="flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Поставщик")}<SortIcon columnKey="supplier" />
                          </button>
                        </th>
                        <th className="p-3 text-right">
                          <button type="button" onClick={() => toggleSort("quantity")} className="flex items-center justify-end text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Остаток")}<SortIcon columnKey="quantity" />
                          </button>
                        </th>
                        <th className="p-3 text-right">
                          <button type="button" onClick={() => toggleSort("purchase")} className="flex items-center justify-end text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Себест.")}<SortIcon columnKey="purchase" />
                          </button>
                        </th>
                        <th className="p-3 text-right">
                          <button type="button" onClick={() => toggleSort("selling")} className="flex items-center justify-end text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Клиенту")}<SortIcon columnKey="selling" />
                          </button>
                        </th>
                        <th className="p-3 text-right">
                          <button type="button" onClick={() => toggleSort("margin")} className="flex items-center justify-end text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {tp("Маржа/шт")}<SortIcon columnKey="margin" />
                          </button>
                        </th>
                        <th className="p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">{tp("Действия")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {visibleParts.map((part) => {
                        const supplier = part.supplier_id ? supplierById.get(part.supplier_id) : null;
                        const lowStock = part.quantity <= part.min_quantity;
                        return (
                          <tr key={part.id} className="hover:bg-primary/5 transition-colors [content-visibility:auto] [contain-intrinsic-size:0_64px] [contain:layout_style_paint]">
                            <td className="p-3">
                              <div className="font-semibold">{part.name}</div>
                              <div className="text-xs text-muted-foreground flex gap-2">
                                {part.brand && <span>{part.brand}</span>}
                                {part.code && <span className="font-mono">{part.code}</span>}
                                {part.location && <span>{part.location}</span>}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{supplier?.name || "—"}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline" className={lowStock ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-green-500/10 text-green-600 border-green-500/20"}>
                                {part.quantity} {tp("шт.")}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-medium">{money(part.purchase_price).toLocaleString("ro-MD")} MDL</td>
                            <td className="p-3 text-right font-medium">{money(part.selling_price).toLocaleString("ro-MD")} MDL</td>
                            <td className="p-3 text-right font-bold text-primary">{money(part.selling_price - part.purchase_price).toLocaleString("ro-MD")} MDL</td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => editPart(part)} aria-label={tp("Изменить")} className="h-9 w-9 rounded-xl">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => removePart(part.id)} aria-label={tp("Удалить")} className="h-9 w-9 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {hasMoreParts && (
                  <div className="border-t border-border/40 p-4 sm:p-5 text-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + listPageSize)} className="h-10 w-full rounded-xl px-5 text-sm sm:w-auto">
                      {tp("Показать еще")} {Math.min(listPageSize, filteredParts.length - visibleCount)}
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
