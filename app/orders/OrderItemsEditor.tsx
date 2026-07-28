"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getItemTotals, money } from "@/lib/finance";
import type { Employee, OrderItemFormData, PartSource, Supplier, WarehousePart, WorkTemplate } from "@/lib/types";
import { createId } from "@/lib/utils";
import { AlertTriangle, PackageSearch, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useLanguage } from "@/components/layout/LanguageProvider";

export function createEmptyOrderItem(): OrderItemFormData {
  return {
    type: "work",
    source: "manual",
    name: "",
    quantity: 1,
    selling_price: 0,
    cost_price: 0,
    supplier_discount_percent: 0,
    tempId: createId(),
  };
}

interface OrderItemsEditorProps {
  items: OrderItemFormData[];
  setItems: Dispatch<SetStateAction<OrderItemFormData[]>>;
  suppliers: Supplier[];
  warehouseParts: WarehousePart[];
  employees: Employee[];
  workTemplates: WorkTemplate[];
}

export function OrderItemsEditor({ items, setItems, suppliers, warehouseParts, employees, workTemplates }: OrderItemsEditorProps) {
  const { tp } = useLanguage();
  const priceStep = "0.01";

  function addItem(type: "work" | "part" = "work") {
    setItems((current) => [...current, { ...createEmptyOrderItem(), type }]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof OrderItemFormData, value: string | number) {
    setItems((current) => {
      const updated = [...current];
      const normalizedValue =
        field === "selling_price" || field === "cost_price"
          ? money(Number(value))
          : field === "quantity"
            ? Math.max(Number(value) || 0, 0)
            : value;
      let item: OrderItemFormData = { ...updated[index], [field]: normalizedValue };

      if (field === "type") {
        const isPart = value === "part";
        item = {
          ...item,
          mechanic_id: isPart ? "" : item.mechanic_id || "",
          mechanic_name: isPart ? "" : item.mechanic_name || "",
          source: "manual",
          warehouse_part_id: "",
          supplier_id: "",
          supplier_name: "",
          supplier_discount_percent: 0,
          cost_price: 0,
          code: isPart ? item.code || "" : "",
          brand: isPart ? item.brand || "" : "",
        };
      }

      if (field === "source") {
        item = {
          ...item,
          source: value as PartSource,
          warehouse_part_id: "",
          supplier_id: "",
          supplier_name: "",
          supplier_discount_percent: 0,
          cost_price: 0,
        };
      }

      if (field === "warehouse_part_id") {
        if (value === "none") {
          item = {
            ...item,
            warehouse_part_id: "",
            supplier_id: "",
            supplier_name: "",
            supplier_discount_percent: 0,
            cost_price: 0,
          };
          updated[index] = item;
          return updated;
        }

        const part = warehouseParts.find((candidate) => candidate.id === value);
        const supplier = suppliers.find((candidate) => candidate.id === part?.supplier_id);
        if (part) {
          item = {
            ...item,
            type: "part",
            source: "warehouse",
            warehouse_part_id: part.id,
            supplier_id: part.supplier_id || "",
            supplier_name: supplier?.name || "",
            supplier_discount_percent: supplier?.discount_percent || 0,
            name: part.name,
            code: part.code || "",
            brand: part.brand || "",
            selling_price: money(part.selling_price),
            cost_price: money(part.purchase_price),
          };
        }
      }

      if (field === "supplier_id") {
        const supplier = suppliers.find((candidate) => candidate.id === value);
        item = {
          ...item,
          supplier_id: value === "none" ? "" : String(value),
          supplier_name: supplier?.name || "",
          supplier_discount_percent: supplier?.discount_percent || 0,
        };
      }

      if (field === "mechanic_id") {
        const mechanic = employees.find((candidate) => candidate.id === value);
        item = {
          ...item,
          mechanic_id: value === "none" ? "" : String(value),
          mechanic_name: mechanic?.full_name || "",
        };
      }

      updated[index] = item;
      return updated;
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.selling_price, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{tp("Позиции заказа")}</h2>
          <p className="text-xs text-muted-foreground">{tp("Работы, запчасти со склада и запчасти от поставщика")}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground space-y-4">
          <p className="text-sm">{tp("Нет добавленных позиций")}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button type="button" variant="outline" onClick={() => addItem("work")} className="h-11 px-5 text-sm rounded-xl flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              {tp("Добавить работу")}
            </Button>
            <Button type="button" variant="outline" onClick={() => addItem("part")} className="h-11 px-5 text-sm rounded-xl flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              {tp("Добавить запчасть")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => {
            const warehousePart = warehouseParts.find((part) => part.id === item.warehouse_part_id);
            const totals = getItemTotals(item);
            const stockWarning = item.type === "part" && item.source === "warehouse" && warehousePart && item.quantity > warehousePart.quantity;

            return (
              <div key={item.tempId || index} className="p-4 border border-border/70 rounded-xl space-y-4 bg-card/70">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{tp("Позиция")} #{index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    aria-label={tp("Удалить позицию")}
                    className="h-9 w-9 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`item-type-${index}`} className="text-xs">{tp("Тип")}</Label>
                    <Select value={item.type} onValueChange={(value) => updateItem(index, "type", value as "work" | "part")}>
                      <SelectTrigger id={`item-type-${index}`} className="w-full h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">{tp("Работа")}</SelectItem>
                        <SelectItem value="part">{tp("Запчасть")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {item.type === "part" && (
                    <div className="space-y-2">
                      <Label htmlFor={`item-source-${index}`} className="text-xs">{tp("Источник")}</Label>
                      <Select value={item.source || "manual"} onValueChange={(value) => updateItem(index, "source", value as PartSource)}>
                        <SelectTrigger id={`item-source-${index}`} className="w-full h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">{tp("Ручной ввод")}</SelectItem>
                          <SelectItem value="warehouse">{tp("Со склада")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {item.type === "work" && (
                    <div className="space-y-2">
                      <Label htmlFor={`item-mechanic-${index}`} className="text-xs">{tp("Исполнитель")}</Label>
                      <Select value={item.mechanic_id || ""} onValueChange={(value) => value && updateItem(index, "mechanic_id", value)}>
                        <SelectTrigger id={`item-mechanic-${index}`} className="w-full h-11">
                          <SelectValue placeholder={tp("Выберите исполнителя")} />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.length === 0 ? (
                            <SelectItem value="no-employees" disabled>{tp("Сначала добавьте сотрудника")}</SelectItem>
                          ) : (
                            employees.map((employee) => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.full_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {item.type === "part" && item.source === "warehouse" ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`item-warehouse-${index}`} className="text-xs">{tp("Запчасть на складе")}</Label>
                      <Select value={item.warehouse_part_id || "none"} onValueChange={(value) => value && updateItem(index, "warehouse_part_id", value)}>
                        <SelectTrigger id={`item-warehouse-${index}`} className="w-full h-11">
                          <SelectValue placeholder={tp("Выберите запчасть")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{tp("Не выбрано")}</SelectItem>
                          {warehouseParts.map((part) => (
                            <SelectItem key={part.id} value={part.id}>
                              {part.name} {part.brand ? `- ${part.brand}` : ""} ({part.quantity} {tp("шт.")})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : item.type === "work" ? (
                    <div className="space-y-2 md:col-span-2 self-end">
                      <Label htmlFor={`item-name-${index}`} className="text-xs">{tp("Название *")}</Label>
                      <WorkNameAutocomplete
                        value={item.name}
                        workTemplates={workTemplates}
                        onSelect={(template) => {
                          setItems((current) => {
                            const updated = [...current];
                            updated[index] = {
                              ...updated[index],
                              name: template.name,
                              selling_price: template.default_price > 0 ? money(template.default_price) : updated[index].selling_price,
                            };
                            return updated;
                          });
                        }}
                        onChange={(value) => updateItem(index, "name", value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2 md:col-span-2 self-end">
                      <Label htmlFor={`item-name-${index}`} className="text-xs">{tp("Название *")}</Label>
                      <Input
                        id={`item-name-${index}`}
                        value={item.name}
                        onChange={(e) => updateItem(index, "name", e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                  )}
                </div>

                {item.type === "part" && item.source !== "warehouse" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`item-code-${index}`} className="text-xs">{tp("Код/артикул")}</Label>
                      <Input id={`item-code-${index}`} value={item.code || ""} onChange={(e) => updateItem(index, "code", e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`item-brand-${index}`} className="text-xs">{tp("Бренд")}</Label>
                      <Input id={`item-brand-${index}`} value={item.brand || ""} onChange={(e) => updateItem(index, "brand", e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`item-supplier-${index}`} className="text-xs">{tp("Поставщик")}</Label>
                      <Select value={item.supplier_id || "none"} onValueChange={(value) => value && updateItem(index, "supplier_id", value)}>
                        <SelectTrigger id={`item-supplier-${index}`} className="w-full h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{tp("Без поставщика")}</SelectItem>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name} - {tp("скидка")} {supplier.discount_percent}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {item.type === "part" && item.source === "warehouse" && warehousePart && (
                  <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${stockWarning ? "bg-destructive/10 text-destructive border-destructive/25" : "bg-secondary/5 text-muted-foreground border-border/60"}`}>
                    {stockWarning ? <AlertTriangle className="h-4 w-4" /> : <PackageSearch className="h-4 w-4" />}
                    {tp("На складе")}: {warehousePart.quantity} {tp("шт.")} {tp("Себестоимость")}: {money(warehousePart.purchase_price).toLocaleString("ro-MD")} MDL.
                  </div>
                )}

                <div className={`grid grid-cols-2 gap-3 ${item.type === "part" ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
                  <div>
                    <Label htmlFor={`item-qty-${index}`} className="text-xs mb-[5px]">{tp("Кол-во")}</Label>
                    <NumberInput
                      id={`item-qty-${index}`}
                      min="1"
                      step={item.type === "part" ? "any" : "1"}
                      value={item.quantity}
                      onValueChange={(value) => updateItem(index, "quantity", value)}
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`item-price-${index}`} className="text-xs mb-[5px]">{tp("Цена клиенту")}</Label>
                    <NumberInput
                      id={`item-price-${index}`}
                      min="0"
                      step={priceStep}
                      value={item.selling_price}
                      onValueChange={(value) => updateItem(index, "selling_price", value)}
                      className="h-11"
                    />
                  </div>
                  {item.type === "part" && (
                    <div>
                      <Label htmlFor={`item-cost-${index}`} className="text-xs mb-[5px]">{tp("Себестоимость")}</Label>
                      <NumberInput
                        id={`item-cost-${index}`}
                        min="0"
                        step={priceStep}
                        value={item.cost_price || 0}
                        onValueChange={(value) => updateItem(index, "cost_price", value)}
                        disabled={item.source === "warehouse"}
                        className="h-11 bg-secondary/10"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`item-total-${index}`} className="text-xs mb-[5px]">{tp("Сумма")}</Label>
                    <Input id={`item-total-${index}`} value={`${totals.totalPrice.toLocaleString("ro-MD")} MDL`} disabled className="h-11 bg-secondary/10" />
                  </div>
                  {item.type === "part" && (
                    <div>
                      <Label htmlFor={`item-margin-${index}`} className="text-xs mb-[5px]">{tp("Маржа")}</Label>
                      <Input id={`item-margin-${index}`} value={`${totals.profitAmount.toLocaleString("ro-MD")} MDL`} disabled className="h-11 bg-secondary/10" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => addItem("work")} className="h-11 flex-1 sm:flex-auto px-5 text-sm rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                {tp("Добавить работу")}
              </Button>
              <Button type="button" variant="outline" onClick={() => addItem("part")} className="h-11 flex-1 sm:flex-auto px-5 text-sm rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                {tp("Добавить запчасть")}
              </Button>
            </div>
            <div className="text-xl font-bold">
              {tp("Итого")}: {totalAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkNameAutocomplete({
  value,
  workTemplates,
  onSelect,
  onChange,
}: {
  value: string;
  workTemplates: WorkTemplate[];
  onSelect: (template: WorkTemplate) => void;
  onChange: (value: string) => void;
}) {
  const { tp } = useLanguage();
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return workTemplates.slice(0, 20);
    const term = query.trim().toLowerCase();
    return workTemplates
      .filter((w) => w.name.toLowerCase().includes(term) || (w.code && w.code.toLowerCase().includes(term)))
      .slice(0, 20);
  }, [query, workTemplates]);

  function handleSelect(template: WorkTemplate) {
    setQuery(template.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelect(template);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
      e.preventDefault();
      handleSelect(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onKeyDown={handleKeyDown}
        required
        className="h-11"
        placeholder={tp("Начните вводить название работы...")}
      />
      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
        >
          {filtered.map((template, index) => (
            <button
              key={template.id}
              type="button"
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors ${
                index === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(template)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {template.code && <span className="text-primary font-mono mr-2 text-xs">{template.code}</span>}
                  {template.name}
                </div>
                {template.category && (
                  <div className="text-xs text-muted-foreground">{template.category}</div>
                )}
              </div>
              {template.default_price > 0 && (
                <span className="text-xs font-bold text-primary whitespace-nowrap">
                  {money(template.default_price).toLocaleString("ro-MD")} MDL
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
