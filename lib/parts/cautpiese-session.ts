/**
 * Persist CautPiese UI across tab switches and order navigation.
 * sessionStorage = survives /orders and back; clears when browser tab closes.
 */

import type { PartOffer, PartsSearchResponse } from "./types";

export const CAUTPIESE_UI_SESSION_KEY = "crm:cautpiese-ui-v1";

export type CautpieseUiSnapshot = {
  v: 1;
  savedAt: number;
  tab: "code" | "vin" | "suppliers";
  code: string;
  data: PartsSearchResponse | null;
  error: string | null;
  sortKey: "price" | "brand" | "supplier" | "stock" | "match";
  onlyInStock: boolean;
  onlyExact: boolean;
  brandFilter: string;
  supplierFilter: string;
  vin: string;
  vinStep: 1 | 2 | 3 | 4;
  vinModels: unknown | null;
  selectedMod: unknown | null;
  vehicleOemCatalog: string;
  vinCompare: unknown | null;
  modFilter: string;
};

const MAX_AGE_MS = 8 * 60 * 60_000; // 8h

function stripHeavyOffers(data: PartsSearchResponse | null): PartsSearchResponse | null {
  if (!data) return null;
  // Cap offer lists so sessionStorage stays under quota (~5MB)
  const cap = <T,>(arr: T[] | undefined, n: number) => (arr || []).slice(0, n);
  const trimOffer = (o: PartOffer): PartOffer => ({
    ...o,
    // drop huge HTML-ish fields if any
    name: (o.name || "").slice(0, 220),
  });
  return {
    ...data,
    offers: cap(data.offers, 200).map(trimOffer),
    exactOffers: cap(data.exactOffers, 80).map(trimOffer),
    crossOffers: cap(data.crossOffers, 120).map(trimOffer),
    results: cap(data.results, 40).map((r) => ({
      ...r,
      offers: cap(r.offers, 40).map(trimOffer),
      error: r.error?.slice(0, 200),
    })),
    shopLinks: cap(data.shopLinks, 30),
    expandedAnalogs: cap(data.expandedAnalogs, 20),
    explanation: (data.explanation || "").slice(0, 800),
  };
}

export function loadCautpieseUiSession(): CautpieseUiSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CAUTPIESE_UI_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CautpieseUiSnapshot;
    if (!parsed || parsed.v !== 1) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(CAUTPIESE_UI_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCautpieseUiSession(snap: Omit<CautpieseUiSnapshot, "v" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CautpieseUiSnapshot = {
      v: 1,
      savedAt: Date.now(),
      ...snap,
      data: stripHeavyOffers(snap.data),
    };
    sessionStorage.setItem(CAUTPIESE_UI_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // QuotaExceeded — drop results payload, keep query at least
    try {
      const light: CautpieseUiSnapshot = {
        v: 1,
        savedAt: Date.now(),
        ...snap,
        data: snap.data
          ? {
              ...snap.data,
              offers: (snap.data.offers || []).slice(0, 40),
              exactOffers: (snap.data.exactOffers || []).slice(0, 20),
              crossOffers: (snap.data.crossOffers || []).slice(0, 20),
              results: [],
            }
          : null,
      };
      sessionStorage.setItem(CAUTPIESE_UI_SESSION_KEY, JSON.stringify(light));
    } catch {
      /* ignore */
    }
  }
}

export function clearCautpieseUiSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CAUTPIESE_UI_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ── Recent article queries (browser-like autocomplete) ─────────────────────

export const CAUTPIESE_RECENT_QUERIES_KEY = "crm:cautpiese-recent-queries-v1";
const RECENT_MAX_STORE = 40;
const RECENT_SHOW = 5;

export function loadRecentQueries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CAUTPIESE_RECENT_QUERIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim())
      .filter((x) => x.length >= 2)
      .slice(0, RECENT_MAX_STORE);
  } catch {
    return [];
  }
}

/** Push successful search to top; dedupe case-insensitively */
export function pushRecentQuery(query: string): string[] {
  if (typeof window === "undefined") return [];
  const q = query.trim();
  if (q.length < 2) return loadRecentQueries();
  const prev = loadRecentQueries();
  const qn = q.toUpperCase().replace(/\s+/g, "");
  const next = [q, ...prev.filter((x) => x.toUpperCase().replace(/\s+/g, "") !== qn)].slice(
    0,
    RECENT_MAX_STORE
  );
  try {
    localStorage.setItem(CAUTPIESE_RECENT_QUERIES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Suggestions for the search input:
 * - empty focus → last N queries
 * - typing → filter history by prefix/substring (show up to N)
 */
export function suggestRecentQueries(input: string, limit = RECENT_SHOW): string[] {
  const all = loadRecentQueries();
  const q = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!q) return all.slice(0, limit);
  const scored = all
    .map((raw) => {
      const n = raw.toUpperCase().replace(/\s+/g, "");
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 80;
      else if (n.includes(q)) score = 50;
      else return null;
      return { raw, score };
    })
    .filter(Boolean) as Array<{ raw: string; score: number }>;
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.raw);
}

export function removeRecentQuery(query: string): string[] {
  if (typeof window === "undefined") return [];
  const qn = query.trim().toUpperCase().replace(/\s+/g, "");
  const next = loadRecentQueries().filter(
    (x) => x.toUpperCase().replace(/\s+/g, "") !== qn
  );
  try {
    localStorage.setItem(CAUTPIESE_RECENT_QUERIES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecentQueries(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CAUTPIESE_RECENT_QUERIES_KEY);
  } catch {
    /* ignore */
  }
}
