/**
 * AutoMall.md — Moldova catalog comparison.
 *
 * Strategy:
 *  1) Try www.automall.md (MDL) when Imperva allows — real prices if present.
 *  2) Fallback: webmallpmr.md catalog twin (same brand/article graph, NO Imperva).
 *     - Never use PMR rub prices in UI.
 *     - Map hits → https://www.automall.md/AutoCatalog/{BRAND}/{ART}
 *     - price = null, rawPriceText = "см. на сайте"
 *
 * One shared catalog; UI always branded AutoMall (MD).
 */

import { articleForUrl, normalizeArticle } from "../normalize";
import { curlImpersonateFetch, hasCurlImpersonate } from "../curl-impersonate";
import { parseAutomallTiles, dedupeOffers } from "../parse/html-products";
import type { PartOffer, StockStatus, SupplierSearchResult } from "../types";

const SUPPLIER = "automall" as const;
const SUPPLIER_NAME = "AutoMall";

/** Public MD site (prices when unblocked) */
const MD_BASE = (process.env.AUTOMALL_BASE_URL || "https://www.automall.md").replace(/\/$/, "");
/** PMR twin — open HTML catalog, never show its prices */
const PMR_BASE = (process.env.AUTOMALL_PMR_MIRROR || "https://webmallpmr.md").replace(/\/$/, "");

const SEE_ON_SITE = "см. на сайте";

function envCookie(): string {
  return process.env.AUTOMALL_COOKIE?.trim() || "";
}

function mdSearchUrl(code: string): string {
  return `${MD_BASE}/Catalog/Search?number=${encodeURIComponent(code)}`;
}

function mdCatalogUrl(brand: string, article: string): string {
  // AutoMall MD deep product page
  const b = brand.replace(/\s+/g, "-").trim() || "OEM";
  const a = article.trim().replace(/\s+/g, "-");
  return `${MD_BASE}/AutoCatalog/${encodeURIComponent(b)}/${encodeURIComponent(a)}`;
}

function isBlockedHtml(html: string, status?: number): boolean {
  if (status === 403 || status === 429) return true;
  if (!html || html.length < 800) {
    return (
      /incapsula|_Incapsula|Request unsuccessful|pardon our interruption/i.test(html || "") ||
      html.length < 400
    );
  }
  return (
    /_Incapsula_Resource|Request unsuccessful/i.test(html) &&
    !/ware-num|AutoCatalog|class="tile"/i.test(html)
  );
}

export interface CatalogHit {
  brand: string;
  article: string;
  name: string;
  stock: StockStatus;
}

/**
 * Parse AutoMall / WebMall tile HTML.
 * PMR pages use class="tile" + .brand + .ware-num + .price (руб — ignore).
 */
export function parseAutomallCatalogHits(html: string, query: string): CatalogHit[] {
  const hits: CatalogHit[] = [];
  const seen = new Set<string>();
  const q = normalizeArticle(query);

  const tiles = html.split(/class="tile(?:-border)?"/i).slice(1);
  for (const tile of tiles) {
    const brand =
      tile.match(/class="brand"[^>]*title="([^"]+)"/i)?.[1]?.trim() ||
      tile.match(/class="brand"[^>]*>([^<]+)/i)?.[1]?.trim() ||
      "";
    const article =
      tile.match(/class="ware-num"[^>]*>([^<]+)/i)?.[1]?.trim() ||
      tile.match(/\/(?:Auto|AutoCatalog)\/[^/]+\/([^"'?\s]+)/i)?.[1]?.replace(/-/g, " ").trim() ||
      "";
    if (!article || article.length < 2) continue;

    const name =
      tile.match(/<h4[^>]*>\s*<a[^>]*>([^<]+)/i)?.[1]?.trim() ||
      tile.match(/title="([^"]*фильтр[^"]*|[^"]{4,80})"/i)?.[1]?.trim() ||
      `${brand} ${article}`.trim();

    let stock: StockStatus = "unknown";
    if (/нет в наличии|no-present/i.test(tile)) stock = "out";
    else if (/под заказ/i.test(tile)) stock = "order";
    else if (/в наличии/i.test(tile)) stock = "in_stock";

    const key = `${normalizeArticle(brand)}|${normalizeArticle(article)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      brand: brand || "—",
      article,
      name: name.slice(0, 200),
      stock,
    });
  }

  // Fallback: /ru/Auto/BRAND/ART or /AutoCatalog/BRAND/ART links
  for (const m of html.matchAll(
    /\/(?:ru\/)?Auto(?:Catalog)?\/([^/"'\s]+)\/([^/"'\s?]+)/gi
  )) {
    const brand = decodeURIComponent(m[1]!).replace(/-/g, " ").trim();
    const article = decodeURIComponent(m[2]!).replace(/-/g, " ").trim();
    if (!article || article.length < 2) continue;
    if (/^(Images|GetImage|Content|bundles)$/i.test(brand)) continue;
    const key = `${normalizeArticle(brand)}|${normalizeArticle(article)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ brand, article, name: `${brand} ${article}`, stock: "unknown" });
  }

  hits.sort((a, b) => {
    const ae = normalizeArticle(a.article) === q ? 0 : 1;
    const be = normalizeArticle(b.article) === q ? 0 : 1;
    return ae - be;
  });
  return hits;
}

function hitsToMdOffers(hits: CatalogHit[], query: string): PartOffer[] {
  const qn = normalizeArticle(query);
  return hits.slice(0, 40).map((h) => {
    const exact = normalizeArticle(h.article) === qn;
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      brand: h.brand,
      article: h.article,
      name: h.name,
      price: null,
      currency: "MDL",
      stock: h.stock,
      url: mdCatalogUrl(h.brand, h.article),
      priceConfidence: "low" as const,
      rawPriceText: SEE_ON_SITE,
      isAnalog: !exact,
      isShell: false,
    };
  });
}

function shellOffer(article: string): PartOffer {
  return {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    brand: "—",
    article,
    name: `Открыть ${article} на AutoMall`,
    price: null,
    currency: "MDL",
    stock: "unknown",
    url: mdSearchUrl(article),
    priceConfidence: "low",
    rawPriceText: SEE_ON_SITE,
    isShell: true,
  };
}

function oemForms(code: string): string[] {
  const raw = code.trim();
  const noSpace = raw.replace(/\s+/g, "");
  const compact = noSpace.replace(/[-./]/g, "");
  const spaced = compact.match(/^([A-Z]+)(\d+[A-Z0-9]*)$/i);
  const out = [raw, noSpace, compact, noSpace.toUpperCase()];
  if (spaced) out.push(`${spaced[1]} ${spaced[2]}`);
  return [...new Set(out.filter((s) => s.length >= 3))].slice(0, 4);
}

/**
 * Open PMR mirror only (curl-impersonate, no free-proxy, no fetchText WAF chain).
 * Imperva on automall.md wastes 16s+ timeouts inside core search.
 */
async function tryPmrCatalog(article: string): Promise<CatalogHit[]> {
  const form = oemForms(article)[0]!;
  const url = `${PMR_BASE}/Catalog/Search?number=${encodeURIComponent(form)}`;
  const timeoutMs = 12000;
  const headers: Record<string, string> = {
    Referer: PMR_BASE + "/",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ru-RU,ru;q=0.9",
  };

  if (hasCurlImpersonate()) {
    const r = await curlImpersonateFetch({
      url,
      headers,
      timeoutMs,
    });
    if (r.text && /ware-num|class="tile"/i.test(r.text)) {
      return parseAutomallCatalogHits(r.text, form);
    }
  }

  // Minimal undici fallback — not via fetchText (avoids automall WAF rotate)
  try {
    const { fetch: undiciFetch } = await import("undici");
    const res = await undiciFetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (/ware-num|class="tile"/i.test(text)) {
      return parseAutomallCatalogHits(text, form);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** Optional MD MDL prices — only when cookie set (skip Imperva by default). */
async function tryMdWithCookie(article: string): Promise<PartOffer[] | null> {
  if (!envCookie()) return null;
  const form = oemForms(article)[0]!;
  const url = mdSearchUrl(form);
  if (!hasCurlImpersonate()) return null;
  const r = await curlImpersonateFetch({
    url,
    headers: {
      Referer: MD_BASE + "/",
      Accept: "text/html",
      Cookie: envCookie(),
    },
    cookies: envCookie(),
    timeoutMs: 10000,
  });
  if (!r.text || isBlockedHtml(r.text, r.status) || r.text.length < 1500) return null;
  const tiles = parseAutomallTiles(r.text, {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    baseUrl: MD_BASE,
    article: form,
    currency: "MDL",
  }).filter((o) => o.price != null && o.price > 0 && o.price < 50_000);
  if (!tiles.length) return null;
  return tiles.slice(0, 40).map((o) => ({
    ...o,
    currency: "MDL",
    priceConfidence: "high" as const,
    url: o.url && /automall\.md/i.test(o.url) ? o.url : mdCatalogUrl(o.brand, o.article),
  }));
}

export async function searchAutomall(code: string): Promise<SupplierSearchResult> {
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

  try {
    // Cookie-MD first only if configured (real MDL)
    if (envCookie()) {
      const md = await tryMdWithCookie(article);
      if (md?.length) {
        return {
          supplier: SUPPLIER,
          supplierName: SUPPLIER_NAME,
          ok: true,
          durationMs: Date.now() - started,
          offers: dedupeOffers(md).slice(0, 40),
        };
      }
    }

    // Default killer path: open PMR catalog → MD AutoMall links + «см. на сайте»
    const pmrHits = await tryPmrCatalog(article);
    if (pmrHits.length) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: dedupeOffers(hitsToMdOffers(pmrHits, article)).slice(0, 40),
        error: `Каталог AutoMall (${pmrHits.length} поз.) — цены: ${SEE_ON_SITE}`,
      };
    }

    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      durationMs: Date.now() - started,
      offers: [shellOffer(article)],
      error: `Каталог недоступен — откройте: ${mdSearchUrl(article)}`,
    };
  } catch (err) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка AutoMall",
      durationMs: Date.now() - started,
      offers: [shellOffer(article)],
    };
  }
}
