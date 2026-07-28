"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDebtAgeDays,
  getDebtAmount,
  getPaidAmountFromEntries,
  getPaymentMethodFromEntries,
  getPaymentStatus,
  PAYMENT_ENTRY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/finance";
import type { PaymentEntry, PaymentEntryMethod, PaymentMethod } from "@/lib/types";
import { createId } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/layout/LanguageProvider";

interface OrderPaymentSectionProps {
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentEntries: PaymentEntry[];
  debtStartedAt: string;
  setPaymentMethod: (value: PaymentMethod) => void;
  setPaymentEntries: (value: PaymentEntry[]) => void;
  setDebtStartedAt: (value: string) => void;
}

export function OrderPaymentSection({
  totalAmount,
  paymentMethod,
  paymentEntries,
  debtStartedAt,
  setPaymentMethod,
  setPaymentEntries,
  setDebtStartedAt,
}: OrderPaymentSectionProps) {
  const { tp } = useLanguage();
  const entries = paymentEntries;
  const paidAmount = getPaidAmountFromEntries(entries);
  const normalizedPaid = Math.min(Math.max(Number(paidAmount) || 0, 0), totalAmount);
  const debtAmount = getDebtAmount(totalAmount, normalizedPaid);
  const paymentStatus = getPaymentStatus(totalAmount, normalizedPaid);
  const debtAgeDays = getDebtAgeDays(debtStartedAt);

  function updateEntry(index: number, field: keyof PaymentEntry, value: string | number) {
    const updated = entries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [field]: value } : entry
    );
    setPaymentEntries(updated);
    setPaymentMethod(getPaymentMethodFromEntries(updated));
  }

  function addEntry() {
    const updated = [
      ...entries,
      {
        id: createId(),
        method: "cash" as PaymentEntryMethod,
        amount: 0,
        paid_at: new Date().toISOString().slice(0, 10),
      },
    ];
    setPaymentEntries(updated);
    setPaymentMethod(getPaymentMethodFromEntries(updated));
  }

  function removeEntry(index: number) {
    const updated = entries.filter((_, entryIndex) => entryIndex !== index);
    setPaymentEntries(updated);
    setPaymentMethod(getPaymentMethodFromEntries(updated, paymentMethod));
  }

  function changePaymentMode(value: PaymentMethod) {
    setPaymentMethod(value);
    if (value !== "mixed" && entries.length > 0) {
      setPaymentEntries([
        {
          id: entries[0]?.id || createId(),
          method: value,
          amount: normalizedPaid,
          paid_at: entries[0]?.paid_at || new Date().toISOString().slice(0, 10),
          note: entries[0]?.note || "",
        },
      ]);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tp("Оплата")}</h2>
        <p className="text-xs text-muted-foreground">{tp("Способ оплаты, оплаченная сумма и долг по заказу")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="payment-method">{tp("Способ оплаты")}</Label>
          <Select value={paymentMethod} onValueChange={(value) => value && changePaymentMode(value as PaymentMethod)}>
            <SelectTrigger id="payment-method" className="w-full h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paid-amount">{tp("Оплачено")}</Label>
          <Input id="paid-amount" value={`${normalizedPaid.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`} disabled className="h-11 bg-secondary/10" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="debt-amount">{tp("Долг")}</Label>
          <Input
            id="debt-amount"
            value={`${debtAmount.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`}
            disabled
            className="h-11 bg-secondary/10"
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{tp("Статус оплаты")}</span>
          <div className={`h-11 rounded-xl border px-3 flex items-center font-semibold text-sm ${
            paymentStatus === "paid"
              ? "bg-green-500/10 text-green-600 border-green-500/20"
              : paymentStatus === "partial"
                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
          }`}>
            {PAYMENT_STATUS_LABELS[paymentStatus]}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium leading-none">{tp("Платежи клиента")}</span>
          <button type="button" onClick={addEntry} className="text-xs font-semibold text-primary inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            {tp("Добавить платеж")}
          </button>
        </div>

        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              {tp("Платежи еще не внесены. Заказ будет сохранен как неоплаченный.")}
            </div>
          )}

          {entries.map((entry, index) => (
            <div key={entry.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_2fr_auto] gap-2 items-end p-3 border border-border/70 rounded-xl">
              <div className="space-y-1">
                <Label htmlFor={`entry-method-${index}`} className="text-xs">{tp("Способ")}</Label>
                <Select value={entry.method} onValueChange={(value) => value && updateEntry(index, "method", value as PaymentEntryMethod)}>
                  <SelectTrigger id={`entry-method-${index}`} className="w-full h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_ENTRY_METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`entry-amount-${index}`} className="text-xs">{tp("Сумма")}</Label>
                <NumberInput id={`entry-amount-${index}`} min="0" step="1" value={entry.amount} onValueChange={(value) => updateEntry(index, "amount", value)} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`entry-date-${index}`} className="text-xs">{tp("Дата")}</Label>
                <Input id={`entry-date-${index}`} type="date" value={entry.paid_at.slice(0, 10)} onChange={(e) => updateEntry(index, "paid_at", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`entry-note-${index}`} className="text-xs">{tp("Комментарий")}</Label>
                <Input id={`entry-note-${index}`} value={entry.note || ""} onChange={(e) => updateEntry(index, "note", e.target.value)} className="h-10" />
              </div>
              <button type="button" onClick={() => removeEntry(index)} aria-label={tp("Удалить платеж")} className="h-10 w-10 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {debtAmount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="debt-started-at">{tp("Дата начала долга")}</Label>
            <Input
              id="debt-started-at"
              type="date"
              value={debtStartedAt}
              onChange={(e) => setDebtStartedAt(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{tp("Дней в долге")}</span>
            <div className="h-11 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 flex items-center font-semibold text-amber-700">
              {debtAgeDays} {tp("дн.")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
