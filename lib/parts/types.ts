export type StockStatus = "in_stock" | "order" | "out" | "unknown";

/** Dynamic supplier ids from catalog */
export type SupplierId = string;

export type MatchType = "exact" | "cross" | "weak";

export type PriceConfidence = "high" | "medium" | "low";

export interface PartOffer {
  supplier: SupplierId;
  supplierName: string;
  brand: string;
  article: string;
  name: string;
  price: number | null;
  currency: string;
  stock: StockStatus;
  delivery?: string;
  url?: string;
  isAnalog?: boolean;
  rawPriceText?: string;
  /**
   * high = structured card/API price (trust for bestPrice)
   * medium = plausible parse
   * low = harvest / foreign currency / shell link only
   */
  priceConfidence?: PriceConfidence;
  /**
   * True = "open shop search" placeholder (no real product card).
   * Never shown as «Точный код» / never in bestPrice.
   */
  isShell?: boolean;
  /** Set after ranking */
  matchType?: MatchType;
  matchScore?: number;
}

export interface SupplierSearchResult {
  supplier: SupplierId;
  supplierName: string;
  ok: boolean;
  blocked?: boolean;
  error?: string;
  durationMs: number;
  offers: PartOffer[];
  offline?: boolean;
}

export interface PartsSearchResponse {
  query: string;
  normalized: string;
  tookMs: number;
  results: SupplierSearchResult[];
  offers: PartOffer[];
  /** exact matches only */
  exactOffers?: PartOffer[];
  /** cross / analogs */
  crossOffers?: PartOffer[];
  bestPrice: number | null;
  /** supplierId with cheapest priced offer */
  bestSupplier?: string | null;
  /** best among exact matches */
  bestExactPrice?: number | null;
  /** count of offers with stock */
  inStockCount: number;
  suppliersTotal: number;
  suppliersOk: number;
  /**
   * Deep-links to shop OEM search when there is no priced card.
   * Not mixed into exact/cross tables.
   */
  shopLinks?: Array<{ supplier: string; supplierName: string; url: string; label: string }>;
  explanation?: string;
  /** Search tier: core | secondary | waf (proxy-only) | all */
  phase?: "core" | "secondary" | "waf" | "all";
  /** True when served from in-memory cache */
  cached?: boolean;
  /** Unix ms when result was stored in cache */
  cachedAt?: number | null;
  /**
   * Trusted TecDoc-style analog codes extracted from supplier cross tabs,
   * then re-searched across MD shops (not marketplace junk).
   */
  expandedAnalogs?: Array<{
    article: string;
    brand: string;
    sourceSupplier: string;
    score: number;
  }>;
}

export interface CategoryCompareResponse {
  categoryId: string;
  categoryNameRu: string;
  categoryNameRo: string;
  tookMs: number;
  /** Parallel searches using category hints */
  queries: string[];
  results: SupplierSearchResult[];
  offers: PartOffer[];
  bestPrice: number | null;
  bestSupplier?: string | null;
  inStockCount: number;
  supplierLinks: Array<{ supplierId: string; name: string; url: string; hasScrape: boolean }>;
}

export interface VinDecodeResult {
  vin: string;
  valid: boolean;
  make?: string;
  model?: string;
  modelYear?: string;
  bodyClass?: string;
  engine?: string;
  fuel?: string;
  plantCountry?: string;
  /** Production date from OEM catalog (e.g. 11.07.2007) */
  productionDate?: string;
  /** Transmission / gearbox from OEM VIN card */
  transmission?: string;
  error?: string;
  raw?: Record<string, string>;
}

export interface PartCategory {
  id: string;
  nameRu: string;
  nameRo: string;
  path: string;
  group: string;
}
