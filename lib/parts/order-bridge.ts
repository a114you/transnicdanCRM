/**
 * Bridge CautPiese offers → order draft / existing order.
 *
 * Flow:
 *  1) User fills basket (localStorage)
 *  2) Picks destination → basket moves to transfer package + basket clears immediately
 *  3) Order new/edit page consumes transfer package into form
 *  4) On successful save → mark fingerprints committed
 *  5) On CautPiese return → reconcile: drop any basket rows already committed / already in transfer done
 */
import type { OrderItemFormData } from "@/lib/types";
import { createId } from "@/lib/utils";
import type { PartOffer } from "./types";

export const CAUTPIESE_ORDER_ITEMS_KEY = "crm:cautpiese-order-items";
/** When set, edit page for this order id should merge basket items on load */
export const CAUTPIESE_TARGET_ORDER_KEY = "crm:cautpiese-target-order-id";
/** Items handed off to an order page (basket already emptied) */
export const CAUTPIESE_TRANSFER_KEY = "crm:cautpiese-transfer-v1";
/** Fingerprints of parts already delivered into an order form/save */
export const CAUTPIESE_COMMITTED_KEY = "crm:cautpiese-committed-v1";

export type CautpieseTransfer = {
  orderId: string | null; // null = new order
  items: OrderItemFormData[];
  at: number;
};

function emitBasketChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cautpiese-basket-change"));
}

export function itemFingerprint(item: {
  code?: string | null;
  brand?: string | null;
  supplier_name?: string | null;
  name?: string | null;
  selling_price?: number | null;
}): string {
  const code = (item.code || "").replace(/\s+/g, "").toUpperCase();
  const brand = (item.brand || "").replace(/\s+/g, "").toUpperCase().slice(0, 24);
  const sup = (item.supplier_name || "").replace(/\s+/g, "").toUpperCase().slice(0, 24);
  const price =
    item.selling_price != null && item.selling_price > 0
      ? String(Math.round(item.selling_price * 100))
      : "0";
  if (code) return `${code}|${brand}|${sup}|${price}`;
  return `N|${(item.name || "").slice(0, 40).toUpperCase()}|${sup}|${price}`;
}

export function offerToOrderItem(offer: PartOffer): OrderItemFormData {
  const nameParts = [offer.brand, offer.article, offer.name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    type: "part",
    source: "manual",
    name: nameParts.slice(0, 200) || offer.article,
    code: offer.article,
    brand: offer.brand && offer.brand !== "—" ? offer.brand : "",
    quantity: 1,
    selling_price: offer.price != null && offer.price > 0 ? offer.price : 0,
    cost_price: 0,
    supplier_name: offer.supplierName || "",
    supplier_discount_percent: 0,
    tempId: createId(),
  };
}

export function readCautpieseOrderItems(): OrderItemFormData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CAUTPIESE_ORDER_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCautpieseBasketCount(): number {
  return readCautpieseOrderItems().length;
}

export function pushOffersToOrderDraft(offers: PartOffer[]): number {
  if (typeof window === "undefined") return 0;
  const existing = readCautpieseOrderItems();
  const committed = readCommittedFingerprints();
  const incoming = offers.map(offerToOrderItem).filter((item) => {
    const fp = itemFingerprint(item);
    // Don't re-add parts already committed to an order
    if (committed.has(fp)) return false;
    // Dedupe against current basket
    return !existing.some((e) => itemFingerprint(e) === fp);
  });
  if (!incoming.length) {
    emitBasketChange();
    return existing.length;
  }
  const next = [...existing, ...incoming];
  localStorage.setItem(CAUTPIESE_ORDER_ITEMS_KEY, JSON.stringify(next));
  emitBasketChange();
  return next.length;
}

export function removeCautpieseBasketItem(tempId: string): number {
  if (typeof window === "undefined") return 0;
  const next = readCautpieseOrderItems().filter((i) => i.tempId !== tempId);
  localStorage.setItem(CAUTPIESE_ORDER_ITEMS_KEY, JSON.stringify(next));
  emitBasketChange();
  return next.length;
}

export function clearCautpieseBasket() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
  localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
  emitBasketChange();
}

/** Peek without clearing */
export function peekCautpieseOrderItems(): OrderItemFormData[] {
  return readCautpieseOrderItems();
}

function readCommittedFingerprints(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(CAUTPIESE_COMMITTED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { fps?: string[]; at?: number };
    // Keep 24h
    if (parsed.at && Date.now() - parsed.at > 24 * 60 * 60_000) {
      sessionStorage.removeItem(CAUTPIESE_COMMITTED_KEY);
      return new Set();
    }
    return new Set(parsed.fps || []);
  } catch {
    return new Set();
  }
}

export function markPartsCommitted(items: Array<Partial<OrderItemFormData>>): void {
  if (typeof window === "undefined" || !items.length) return;
  const set = readCommittedFingerprints();
  for (const it of items) {
    if (it.type && it.type !== "part") continue;
    set.add(itemFingerprint(it));
  }
  // Cap size
  const fps = [...set].slice(-400);
  try {
    sessionStorage.setItem(
      CAUTPIESE_COMMITTED_KEY,
      JSON.stringify({ fps, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Hand basket off to an order page and clear basket immediately
 * (so returning to CautPiese doesn't show stale cart).
 */
export function beginCautpieseTransfer(orderId: string | null): number {
  if (typeof window === "undefined") return 0;
  const items = readCautpieseOrderItems();
  if (!items.length) return 0;
  const transfer: CautpieseTransfer = {
    orderId,
    items,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(CAUTPIESE_TRANSFER_KEY, JSON.stringify(transfer));
  } catch {
    // fallback: keep in localStorage under transfer via target keys
    localStorage.setItem(CAUTPIESE_TRANSFER_KEY, JSON.stringify(transfer));
  }
  if (orderId) localStorage.setItem(CAUTPIESE_TARGET_ORDER_KEY, orderId);
  else localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
  // Basket empty right away
  localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
  markPartsCommitted(items);
  emitBasketChange();
  return items.length;
}

/**
 * Order page: take transfer package (or legacy basket) into the form.
 */
export function consumeCautpieseOrderItems(opts?: {
  orderId?: string;
  requireTargetMatch?: boolean;
}): OrderItemFormData[] {
  if (typeof window === "undefined") return [];

  // Prefer transfer package
  let transfer: CautpieseTransfer | null = null;
  try {
    const raw =
      sessionStorage.getItem(CAUTPIESE_TRANSFER_KEY) ||
      localStorage.getItem(CAUTPIESE_TRANSFER_KEY);
    if (raw) transfer = JSON.parse(raw) as CautpieseTransfer;
  } catch {
    transfer = null;
  }

  if (transfer?.items?.length) {
    if (opts?.requireTargetMatch) {
      const want = opts.orderId ?? null;
      const got = transfer.orderId ?? null;
      if (want !== got) {
        // Wrong order page — leave package for the right one
        return [];
      }
    }
    // Age out after 2h
    if (Date.now() - (transfer.at || 0) > 2 * 60 * 60_000) {
      sessionStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
      localStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
      return [];
    }
    sessionStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
    localStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
    localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
    localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
    markPartsCommitted(transfer.items);
    emitBasketChange();
    return transfer.items;
  }

  // Legacy path: items still in basket
  const target = localStorage.getItem(CAUTPIESE_TARGET_ORDER_KEY);
  if (opts?.requireTargetMatch) {
    if (opts.orderId) {
      if (target !== opts.orderId) return [];
    } else if (target) {
      return [];
    }
  }
  const items = readCautpieseOrderItems();
  if (!items.length) return [];
  localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
  localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
  markPartsCommitted(items);
  emitBasketChange();
  return items;
}

/** After successful order save — basket + transfer fully done */
export function finalizeCautpieseAfterOrderSave(items: Array<Partial<OrderItemFormData>>) {
  if (typeof window === "undefined") return;
  markPartsCommitted(items);
  localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
  localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
  sessionStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
  localStorage.removeItem(CAUTPIESE_TRANSFER_KEY);
  emitBasketChange();
}

/**
 * Drop basket rows that were already handed off / saved into an order.
 * Call on CautPiese mount / focus.
 */
export function reconcileCautpieseBasket(): number {
  if (typeof window === "undefined") return 0;
  const committed = readCommittedFingerprints();
  // If a transfer is pending for someone else, don't steal it — just clean basket
  const basket = readCautpieseOrderItems();
  if (!basket.length) {
    emitBasketChange();
    return 0;
  }
  if (!committed.size) {
    emitBasketChange();
    return basket.length;
  }
  const kept = basket.filter((item) => !committed.has(itemFingerprint(item)));
  if (kept.length !== basket.length) {
    if (kept.length) localStorage.setItem(CAUTPIESE_ORDER_ITEMS_KEY, JSON.stringify(kept));
    else localStorage.removeItem(CAUTPIESE_ORDER_ITEMS_KEY);
  }
  emitBasketChange();
  return kept.length;
}

export function setCautpieseTargetOrder(orderId: string | null) {
  if (typeof window === "undefined") return;
  if (orderId) localStorage.setItem(CAUTPIESE_TARGET_ORDER_KEY, orderId);
  else localStorage.removeItem(CAUTPIESE_TARGET_ORDER_KEY);
}

export function getCautpieseTargetOrder(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CAUTPIESE_TARGET_ORDER_KEY);
}

export function formatOffersQuote(
  query: string,
  exact: PartOffer[],
  cross: PartOffer[],
  bestPrice: number | null
): string {
  const lines: string[] = [];
  const date = new Date().toISOString().slice(0, 10);
  lines.push(`${query} · ${date}`);
  if (bestPrice != null) {
    lines.push(`Лучшая цена (MDL): ${bestPrice.toFixed(2)}`);
  }
  lines.push("");
  lines.push("Точные:");
  const exactLines = exact
    .filter((o) => o.price != null)
    .slice(0, 12)
    .map(
      (o) =>
        `  ${o.supplierName} · ${o.brand} ${o.article} · ${o.price?.toFixed(2)} ${o.currency}${
          o.stock === "in_stock" ? " · в наличии" : ""
        }`
    );
  lines.push(...(exactLines.length ? exactLines : ["  —"]));
  lines.push("");
  lines.push("Аналоги / кросс:");
  const crossLines = cross
    .filter((o) => o.price != null)
    .slice(0, 12)
    .map(
      (o) =>
        `  ${o.supplierName} · ${o.brand} ${o.article} · ${o.price?.toFixed(2)} ${o.currency}`
    );
  lines.push(...(crossLines.length ? crossLines : ["  —"]));
  return lines.join("\n");
}
