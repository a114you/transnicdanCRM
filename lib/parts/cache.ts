import type { PartsSearchResponse } from "./types";

type Entry = { expires: number; value: PartsSearchResponse };

const store = new Map<string, Entry>();

const DEFAULT_TTL = Number(process.env.PARTS_CACHE_TTL_SEC || 7200) * 1000;
/** Empty / shell-only results must not stick for hours */
const EMPTY_TTL = Math.min(DEFAULT_TTL, Number(process.env.PARTS_EMPTY_CACHE_TTL_SEC || 90) * 1000);

export function cacheGet(key: string): PartsSearchResponse | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function isThinResult(value: PartsSearchResponse): boolean {
  const priced = (value.offers || []).some((o) => o.price != null && o.price > 0);
  const exact = (value.exactOffers || []).length > 0;
  return !priced && !exact;
}

export function cacheSet(key: string, value: PartsSearchResponse, ttlMs = DEFAULT_TTL) {
  // simple bound: drop oldest if too large
  if (store.size > 500) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  const ttl = isThinResult(value) ? EMPTY_TTL : ttlMs;
  store.set(key, { expires: Date.now() + ttl, value });
}

/** Drop all in-memory search cache (dev / after scraper fixes). */
export function cacheClear() {
  store.clear();
}

export function cacheKey(normalized: string, suppliers: string[]): string {
  return `${normalized}|${suppliers.slice().sort().join(",")}`;
}
