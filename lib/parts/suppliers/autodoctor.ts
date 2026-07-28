/**
 * AutoDoctor.md — public catalog, no login required.
 * Search SSR embeds product list JSON: `"items":[{id,name,price,sku,slug,brand,stock…}]`
 * Plus HTML cards `.product-card__price` "55&nbsp;lei".
 * Prefer list-page parse (fast); fallback to product page only if empty.
 */

import { articleForUrl, normalizeArticle, parsePrice } from "../normalize";
import { fetchText } from "../http";
import type { PartOffer, StockStatus, SupplierSearchResult } from "../types";

const BASE = "https://autodoctor.md";
const SUPPLIER = "autodoctor" as const;
const SUPPLIER_NAME = "AutoDoctor";

interface AdItem {
  id?: number;
  name?: string;
  price?: number;
  priceRetail?: number;
  sku?: string;
  partNumber?: string;
  slug?: string;
  stock?: string;
  availability?: string;
  brand?: { name?: string; slug?: string } | string;
  matchedBy?: string;
}

function brandOf(item: AdItem): string {
  if (!item.brand) return "—";
  if (typeof item.brand === "string") return item.brand;
  return item.brand.name || item.brand.slug || "—";
}

function stockOf(item: AdItem): StockStatus {
  const s = `${item.stock || ""} ${item.availability || ""}`.toLowerCase();
  if (/in-?stock|in_stock|available/.test(s)) return "in_stock";
  if (/order|pre-?order|comand/.test(s)) return "order";
  if (/out|indispon/.test(s)) return "out";
  return "unknown";
}

/** Extract balanced JSON array starting at `[` after `"items":` */
function extractItemsJson(html: string): AdItem[] {
  const marker = html.search(/"items"\s*:\s*\[/);
  if (marker < 0) return [];
  const start = html.indexOf("[", marker);
  if (start < 0) return [];

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < Math.min(html.length, start + 400_000); i++) {
    const c = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        try {
          const parsed = JSON.parse(raw) as unknown;
          return Array.isArray(parsed) ? (parsed as AdItem[]) : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function offersFromItems(items: AdItem[]): PartOffer[] {
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const priceRaw = item.price ?? item.priceRetail;
    const price = typeof priceRaw === "number" ? priceRaw : parsePrice(String(priceRaw ?? ""));
    if (price == null || !(price > 0) || price < 3 || price > 50_000) continue;

    const brand = brandOf(item);
    const article =
      (item.sku || item.partNumber || "").toString().trim() ||
      (item.slug || "").replace(/^[A-Z]+-/i, "") ||
      item.name ||
      "";
    if (!article) continue;

    const slug = (item.slug || "").trim();
    const name = (item.name || `${brand} ${article}`).slice(0, 200);
    const key = `${brand}|${article}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      brand: brand || "—",
      article,
      name,
      price,
      currency: "MDL",
      stock: stockOf(item),
      url: slug
        ? `${BASE}/shop/products/${encodeURIComponent(slug)}`
        : `${BASE}/shop/search/products/${encodeURIComponent(article)}`,
      priceConfidence: "high",
      rawPriceText: `${price} MDL`,
      isAnalog: item.matchedBy === "analog" || item.matchedBy === "cross",
    });
  }

  return offers;
}

/** Fallback: HTML product cards when JSON missing */
function offersFromHtmlCards(html: string): PartOffer[] {
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/app-product-card|product-card--layout/i);

  for (const block of blocks) {
    const slugM = block.match(/\/shop\/products\/([^"'?\s]+)/i);
    const priceM = block.match(
      /product-card__price[^>]*>\s*([0-9]+(?:[.,][0-9]+)?|[0-9]+(?:&nbsp;|\s)[0-9.,]*)\s*(?:&nbsp;)?\s*lei/i
    );
    if (!slugM || !priceM) continue;

    const slug = slugM[1]!.trim();
    const price = parsePrice(priceM[1]!.replace(/&nbsp;/g, " "));
    if (price == null || price < 3 || price > 50_000) continue;

    const { brand, article } = parseSlug(slug);
    const key = `${brand}|${article}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      brand,
      article,
      name: `${brand} ${article}`,
      price,
      currency: "MDL",
      stock: "unknown",
      url: `${BASE}/shop/products/${encodeURIComponent(slug)}`,
      priceConfidence: "high",
      rawPriceText: `${price} MDL`,
    });
  }

  return offers;
}

/** FEBI-32122 → { brand: FEBI, article: 32122 } */
function parseSlug(slug: string): { brand: string; article: string } {
  const raw = decodeURIComponent(slug).replace(/^\/+|\/+$/g, "");
  const parts = raw.split("-");
  if (parts.length >= 2) {
    const brand = (parts[0] || "").toUpperCase();
    const article = parts.slice(1).join("-").replace(/_/g, " ");
    return { brand, article };
  }
  return { brand: "—", article: raw };
}

export async function searchAutodoctor(code: string): Promise<SupplierSearchResult> {
  const started = Date.now();
  const article = articleForUrl(code);
  if (article.length < 3) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: "Артикул слишком короткий",
      durationMs: 0,
      offers: [],
    };
  }

  const searchUrl = `${BASE}/shop/search/products/${encodeURIComponent(article)}`;

  try {
    const res = await fetchText({
      url: searchUrl,
      timeoutMs: 14000,
      retries: 0,
      skipWarmup: true,
      preferCurl: true,
      headers: {
        Referer: `${BASE}/`,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.blocked) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: false,
        blocked: true,
        error: "WAF blocked AutoDoctor",
        durationMs: Date.now() - started,
        offers: [],
      };
    }
    if (!res.ok) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: false,
        error: `HTTP ${res.status}`,
        durationMs: Date.now() - started,
        offers: [],
      };
    }

    // Primary: embedded search results JSON (one request, full prices)
    let offers = offersFromItems(extractItemsJson(res.text));
    if (!offers.length) {
      offers = offersFromHtmlCards(res.text);
    }

    if (!offers.length) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: [
          {
            supplier: SUPPLIER,
            supplierName: SUPPLIER_NAME,
            brand: "—",
            article,
            name: `Открыть ${article} на AutoDoctor`,
            price: null,
            currency: "MDL",
            stock: "unknown",
            url: searchUrl,
            priceConfidence: "low",
            isShell: true,
          },
        ],
        error: "Нет товаров в HTML — ссылка на OEM-поиск",
      };
    }

    const q = normalizeArticle(article);
    offers.sort((a, b) => {
      const ae =
        normalizeArticle(a.article) === q || normalizeArticle(a.article).includes(q) ? 0 : 1;
      const be =
        normalizeArticle(b.article) === q || normalizeArticle(b.article).includes(q) ? 0 : 1;
      if (ae !== be) return ae - be;
      return (a.price ?? 1e12) - (b.price ?? 1e12);
    });

    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      durationMs: Date.now() - started,
      offers: offers.slice(0, 40),
    };
  } catch (err) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка AutoDoctor",
      durationMs: Date.now() - started,
      offers: [],
    };
  }
}
