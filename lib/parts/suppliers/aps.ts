/**
 * APS / AutoResident / ENORM-family open catalogs (no login).
 *
 * GET /search_products/?query={OEM}
 * - ENORM: list has priceroz MDL
 * - APS: list often "—", price on product page «Розничная цена: 188,00 лей»
 * - AutoResident: same platform; stock may differ
 */

import { articleForUrl, normalizeArticle } from "../normalize";
import { fetchText } from "../http";
import {
  parseApsPlatform,
  parseApsProductPage,
  parseSchemaProducts,
  dedupeOffers,
} from "../parse/html-products";
import type { PartOffer, SupplierSearchResult } from "../types";
import type { SupplierDef } from "./catalog";

const MAX_PRODUCT_ENRICH = 8;

function shell(def: SupplierDef, article: string, url: string): PartOffer {
  return {
    supplier: def.id,
    supplierName: def.name,
    brand: "—",
    article,
    name: `Открыть ${article} на ${def.name}`,
    price: null,
    currency: "MDL",
    stock: "unknown",
    url,
    priceConfidence: "low",
    isShell: true,
  };
}

async function enrichFromProductPages(
  def: SupplierDef,
  query: string,
  offers: PartOffer[]
): Promise<PartOffer[]> {
  const q = normalizeArticle(query);
  // Prefer exact / near-exact article rows without price, with product URL
  const need = offers
    .filter((o) => o.price == null && o.url && /\/products\//i.test(o.url))
    .sort((a, b) => {
      const an = normalizeArticle(a.article);
      const bn = normalizeArticle(b.article);
      const ae = an === q ? 0 : an.includes(q) || q.includes(an) ? 1 : 2;
      const be = bn === q ? 0 : bn.includes(q) || q.includes(bn) ? 1 : 2;
      return ae - be;
    })
    .slice(0, MAX_PRODUCT_ENRICH);

  if (!need.length) return offers;

  const byUrl = new Map<string, PartOffer>();
  await Promise.all(
    need.map(async (o) => {
      try {
        const res = await fetchText({
          url: o.url!,
          timeoutMs: 14000,
          retries: 0,
          preferCurl: true,
          skipWarmup: true,
          headers: {
            Referer: def.website || o.url!,
            Accept: "text/html",
            "Accept-Language": "ru-RU,ru;q=0.9",
          },
        });
        if (!res.ok || res.blocked || !res.text) return;
        const parsed = parseApsProductPage(res.text, {
          supplier: def.id,
          supplierName: def.name,
          baseUrl: def.website || "https://www.aps.md",
          article: o.article,
          currency: "MDL",
        });
        if (parsed.price == null) return;
        byUrl.set(o.url!, {
          ...o,
          price: parsed.price,
          priceConfidence: "high",
          rawPriceText: `${parsed.price} MDL`,
          stock: parsed.stock !== "unknown" ? parsed.stock : o.stock,
          delivery: parsed.warehouse || o.delivery,
          name: parsed.name && parsed.name.length > 2 ? parsed.name : o.name,
        });
      } catch {
        /* ignore single product fail */
      }
    })
  );

  if (!byUrl.size) return offers;
  return offers.map((o) => (o.url && byUrl.has(o.url) ? byUrl.get(o.url)! : o));
}

export async function searchApsPlatform(
  def: SupplierDef,
  code: string
): Promise<SupplierSearchResult> {
  const started = Date.now();
  const article = articleForUrl(code);
  if (article.length < 3) {
    return {
      supplier: def.id,
      supplierName: def.name,
      ok: false,
      error: "Артикул слишком короткий",
      durationMs: 0,
      offers: [],
    };
  }

  const base = (def.website || "https://www.aps.md").replace(/\/$/, "");
  const searchUrl =
    def.searchUrl?.replace("{q}", encodeURIComponent(article)) ||
    `${base}/search_products/?query=${encodeURIComponent(article)}`;

  try {
    const res = await fetchText({
      url: searchUrl,
      timeoutMs: 18000,
      retries: 1,
      preferCurl: true,
      skipWarmup: true,
      headers: {
        Referer: base + "/",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,ro;q=0.8,en;q=0.7",
      },
    });

    if (res.blocked) {
      return {
        supplier: def.id,
        supplierName: def.name,
        ok: true,
        blocked: true,
        error: `WAF (${res.strategy})`,
        durationMs: Date.now() - started,
        offers: [shell(def, article, searchUrl)],
      };
    }
    if (!res.ok || !res.text) {
      return {
        supplier: def.id,
        supplierName: def.name,
        ok: false,
        error: `HTTP ${res.status}`,
        durationMs: Date.now() - started,
        offers: [],
      };
    }

    const ctx = {
      supplier: def.id,
      supplierName: def.name,
      baseUrl: base,
      article,
      currency: "MDL" as const,
    };

    let offers = dedupeOffers([
      ...parseApsPlatform(res.text, ctx),
      ...parseSchemaProducts(res.text, ctx),
    ]);

    // APS list often has brand+code without priceroz → product page (open)
    const missingPrices = offers.filter((o) => o.price == null).length;
    if (missingPrices > 0 && missingPrices >= Math.min(1, offers.length)) {
      offers = await enrichFromProductPages(def, article, offers);
    }

    offers.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));

    if (!offers.length) {
      offers = [shell(def, article, searchUrl)];
    }

    return {
      supplier: def.id,
      supplierName: def.name,
      ok: true,
      durationMs: Date.now() - started,
      offers,
    };
  } catch (e) {
    return {
      supplier: def.id,
      supplierName: def.name,
      ok: false,
      error: e instanceof Error ? e.message : "Ошибка",
      durationMs: Date.now() - started,
      offers: [],
    };
  }
}
