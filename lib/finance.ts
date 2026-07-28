import type { OrderItem, OrderItemFormData, PaymentEntry, PaymentEntryMethod, PaymentMethod, PaymentStatus } from "./types";
import type { Language } from "./i18n";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличными",
  card: "Картой",
  transfer: "Переводом",
  mixed: "Смешанная оплата",
};

export const PAYMENT_ENTRY_METHOD_LABELS: Record<PaymentEntryMethod, string> = {
  cash: "Наличными",
  card: "Картой",
  transfer: "Переводом",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Оплачено",
  partial: "Частично",
  unpaid: "Не оплачено",
};

export const PAYMENT_METHOD_LABELS_RO: Record<PaymentMethod, string> = {
  cash: "Numerar",
  card: "Card",
  transfer: "Transfer",
  mixed: "Plată mixtă",
};

export const PAYMENT_ENTRY_METHOD_LABELS_RO: Record<PaymentEntryMethod, string> = {
  cash: "Numerar",
  card: "Card",
  transfer: "Transfer",
};

export const PAYMENT_STATUS_LABELS_RO: Record<PaymentStatus, string> = {
  paid: "Achitat",
  partial: "Parțial",
  unpaid: "Neachitat",
};

export const PAYMENT_METHOD_LABELS_EN: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank transfer",
  mixed: "Mixed payment",
};

export const PAYMENT_ENTRY_METHOD_LABELS_EN: Record<PaymentEntryMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank transfer",
};

export const PAYMENT_STATUS_LABELS_EN: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

export function getPaymentMethodLabel(method: PaymentMethod, language: Language = "ru") {
  if (language === "en") return PAYMENT_METHOD_LABELS_EN[method];
  return language === "ro" ? PAYMENT_METHOD_LABELS_RO[method] : PAYMENT_METHOD_LABELS[method];
}

export function getPaymentEntryMethodLabel(method: PaymentEntryMethod, language: Language = "ru") {
  if (language === "en") return PAYMENT_ENTRY_METHOD_LABELS_EN[method];
  return language === "ro" ? PAYMENT_ENTRY_METHOD_LABELS_RO[method] : PAYMENT_ENTRY_METHOD_LABELS[method];
}

export function getPaymentStatusLabel(status: PaymentStatus, language: Language = "ru") {
  if (language === "en") return PAYMENT_STATUS_LABELS_EN[status];
  return language === "ro" ? PAYMENT_STATUS_LABELS_RO[status] : PAYMENT_STATUS_LABELS[status];
}

export function money(value: number | null | undefined): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getPaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  const total = money(totalAmount);
  const paid = money(paidAmount);

  if (paid <= 0 && total > 0) return "unpaid";
  if (paid + 0.009 >= total) return "paid";
  return "partial";
}

export function getDebtAmount(totalAmount: number, paidAmount: number): number {
  return money(Math.max(0, money(totalAmount) - money(paidAmount)));
}

export function getPaidAmountFromEntries(entries: PaymentEntry[] = []): number {
  return money(entries.reduce((sum, entry) => sum + money(entry.amount), 0));
}

export function getPaymentMethodFromEntries(entries: PaymentEntry[] = [], fallback: PaymentMethod = "cash"): PaymentMethod {
  const usedMethods = new Set(entries.filter((entry) => money(entry.amount) > 0).map((entry) => entry.method));
  if (usedMethods.size === 0) return fallback;
  if (usedMethods.size > 1 || entries.length > 1) return "mixed";
  return [...usedMethods][0];
}

export function getDebtAgeDays(debtStartedAt?: string | null, now = new Date()): number {
  if (!debtStartedAt) return 0;
  const start = new Date(debtStartedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const diff = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function getItemTotals(item: Pick<OrderItem | OrderItemFormData, "type" | "quantity" | "selling_price" | "cost_price">) {
  const quantity = Number(item.quantity) || 0;
  const sellingPrice = money(item.selling_price);
  const totalPrice = money(quantity * sellingPrice);
  const costPrice = item.type === "part" ? money(item.cost_price) : 0;
  const costTotal = money(quantity * costPrice);

  return {
    totalPrice,
    costPrice,
    costTotal,
    profitAmount: money(totalPrice - costTotal),
  };
}

export function getOrderEconomy(items: OrderItem[] = []) {
  return items.reduce(
    (acc, item) => {
      const total = money(item.total_price);
      const cost = money(item.cost_total);
      const profit = money(item.profit_amount ?? total - cost);

      if (item.type === "work") {
        acc.workRevenue = money(acc.workRevenue + total);
        acc.grossProfit = money(acc.grossProfit + total);
      } else {
        acc.partsRevenue = money(acc.partsRevenue + total);
        acc.partsCost = money(acc.partsCost + cost);
        acc.partsProfit = money(acc.partsProfit + profit);
        acc.grossProfit = money(acc.grossProfit + profit);
      }

      return acc;
    },
    {
      workRevenue: 0,
      partsRevenue: 0,
      partsCost: 0,
      partsProfit: 0,
      grossProfit: 0,
    }
  );
}

export interface ReferrerRewardInput {
  reward_type: "fixed" | "percent";
  reward_fixed?: number | null;
  reward_percent?: number | null;
}

export interface ReferrerRewardResult {
  rewardAmount: number;
  rewardBasis: number;
}

/**
 * Вычисляет вознаграждение реферера за заказ.
 * Базис — ТОЛЬКО выручка по работам (без запчастей).
 * @returns { rewardAmount, rewardBasis } где rewardBasis = workRevenue
 */
export function calculateReferrerReward(workRevenue: number, reward: ReferrerRewardInput | null | undefined): ReferrerRewardResult {
  const basis = Math.max(0, Number(workRevenue) || 0);
  if (!reward) return { rewardAmount: 0, rewardBasis: basis };
  if (reward.reward_type === "fixed") {
    const amount = Math.max(0, Number(reward.reward_fixed) || 0);
    return { rewardAmount: money(amount), rewardBasis: basis };
  }
  const percent = Math.min(Math.max(Number(reward.reward_percent) || 0, 0), 100);
  return { rewardAmount: money((basis * percent) / 100), rewardBasis: basis };
}
