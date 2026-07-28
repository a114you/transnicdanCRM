import { articleForUrl, parsePrice } from "../normalize";
import { fetchText } from "../http";
import type { PartOffer, SupplierSearchResult } from "../types";

const BASE = "https://proparts.md";
const SUPPLIER = "proparts" as const;
const SUPPLIER_NAME = "ProParts";

function decodeDataLink(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined;
  try {
    const path = Buffer.from(encoded, "base64").toString("utf8");
    if (path.startsWith("http")) return path;
    return path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;
  } catch {
    return undefined;
  }
}

function extractBrands(html: string, article: string): string[] {
  const brands: string[] = [];
  const seen = new Set<string>();
  const re = /search\/number\/\?article=[^"'&\s]+&brand=([^"'&\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let brand = decodeURIComponent(m[1]);
    brand = brand.replace(/['");].*$/, "").trim();
    if (!brand || brand.length > 40) continue;
    const key = brand.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push(brand);
  }

  // Prefer known filter brands first when present
  const preferred = ["KNECHT", "MAHLE", "MANN-FILTER", "MANN", "BOSCH", "FILTRON", "HENGST", "TRW", "FEBI"];
  brands.sort((a, b) => {
    const ai = preferred.findIndex((p) => a.toUpperCase().includes(p));
    const bi = preferred.findIndex((p) => b.toUpperCase().includes(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Always try searching without brand-id shortcut if list empty
  if (!brands.length) brands.push("");
  return brands.slice(0, 6);
}

function parseOffers(html: string, article: string): PartOffer[] {
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  // Structured offer cards: data-brand + data-price
  let match: RegExpExecArray | null;
  const priceRe =
    /data-brand="([^"]*)"[^>]*data-price="([^"]*)"[^>]*data-box="([^"]*)"[^>]*data-delivery="([^"]*)"[^>]*class="([^"]*)"/gi;
  while ((match = priceRe.exec(html))) {
    const brand = match[1].trim();
    const price = parsePrice(match[2]);
    const deliveryCode = match[4];
    const classes = match[5];
    if (price == null || price <= 0) continue;

    const start = match.index;
    const chunk = html.slice(start, start + 2200);
    const titleMatch =
      chunk.match(/title="([^"]{3,120})"/i) ||
      chunk.match(/alt="([^"]{3,120})"/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || `${brand} ${article}`;
    const dataLink = chunk.match(/data-link="([^"]+)"/i)?.[1];
    const url = decodeDataLink(dataLink) || `${BASE}/search/number/?article=${encodeURIComponent(article)}&brand=${encodeURIComponent(brand)}`;

    // title often "BRAND ARTICLE" — extract article after brand
    let art = article;
    const titleArt = title.replace(new RegExp(`^${brand}\\s+`, "i"), "").trim();
    if (titleArt) art = titleArt.split(/\s{2,}/)[0].slice(0, 40);

    const isAnalog = /top-price-analog/i.test(classes);
    const stock =
      deliveryCode === "1" || deliveryCode === "0"
        ? ("in_stock" as const)
        : deliveryCode === "4" || Number(deliveryCode) > 1
          ? ("order" as const)
          : ("unknown" as const);

    const key = `${brand}|${art}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      brand: brand || "—",
      article: art,
      name: title,
      price,
      currency: "MDL",
      stock,
      delivery: deliveryCode ? `код доставки ${deliveryCode}` : undefined,
      url,
      isAnalog,
      rawPriceText: `${price} MDL`,
    });
  }

  // Fallback: price-now + brand spans
  if (!offers.length) {
    const nowRe = /<span class="price-now">\s*([^<]+)\s*<\/span>\s*<span class="price-word">\s*MDL\s*<\/span>/gi;
    while ((match = nowRe.exec(html))) {
      const price = parsePrice(match[1]);
      if (price == null || price <= 0) continue;
      const chunk = html.slice(Math.max(0, match.index - 1500), match.index + 100);
      const brand =
        chunk.match(/data-brand="([^"]+)"/i)?.[1] ||
        chunk.match(/g-brand-to-find[^>]*>([^<]+)/i)?.[1]?.trim() ||
        "—";
      const title = chunk.match(/title="([^"]{3,80})"/i)?.[1] || `${brand} ${article}`;
      const key = `${brand}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push({
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        brand,
        article,
        name: title,
        price,
        currency: "MDL",
        stock: "unknown",
        url: `${BASE}/search/number/?article=${encodeURIComponent(article)}`,
        rawPriceText: `${price} MDL`,
      });
    }
  }

  offers.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return offers;
}

export async function searchProparts(code: string): Promise<SupplierSearchResult> {
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
    const listUrl = `${BASE}/search/number/?article=${encodeURIComponent(article)}&ajax=1`;
    const listRes = await fetchText({
      url: listUrl,
      headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/` },
      timeoutMs: 14000,
    });

    if (!listRes.ok) {
      // try non-ajax
      const fallback = await fetchText({
        url: `${BASE}/search/number/?article=${encodeURIComponent(article)}`,
        headers: { Referer: `${BASE}/` },
        timeoutMs: 14000,
      });
      if (!fallback.ok) {
        return {
          supplier: SUPPLIER,
          supplierName: SUPPLIER_NAME,
          ok: true,
          blocked: fallback.blocked,
          error: fallback.blocked ? "Сайт заблокировал запрос" : `HTTP ${fallback.status}`,
          durationMs: Date.now() - started,
          offers: [propartsShell(article)],
        };
      }
      // If already product page with prices
      const directOffers = parseOffers(fallback.text, article);
      if (directOffers.length) {
        return {
          supplier: SUPPLIER,
          supplierName: SUPPLIER_NAME,
          ok: true,
          durationMs: Date.now() - started,
          offers: directOffers,
        };
      }
      const brands = extractBrands(fallback.text, article);
      return await fetchBrandOffers(article, brands, started);
    }

    // Maybe prices already on first response
    const early = parseOffers(listRes.text, article);
    if (early.length) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: early,
      };
    }

    const brands = extractBrands(listRes.text, article);
    return await fetchBrandOffers(article, brands, started);
  } catch (err) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: err instanceof Error ? err.message : "Ошибка ProParts",
      durationMs: Date.now() - started,
      offers: [],
    };
  }
}

function propartsShell(article: string): PartOffer {
  return {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    brand: "—",
    article,
    name: `Открыть ${article} на ProParts`,
    price: null,
    currency: "MDL",
    stock: "unknown",
    url: `${BASE}/search/number/?article=${encodeURIComponent(article)}`,
    priceConfidence: "low",
    isShell: true,
  };
}

async function fetchBrandOffers(
  article: string,
  brands: string[],
  started: number
): Promise<SupplierSearchResult> {
  const targets = brands.filter(Boolean).slice(0, 5);
  if (!targets.length) {
    // last attempt: full page without brand
    const res = await fetchText({
      url: `${BASE}/search/number/?article=${encodeURIComponent(article)}`,
      timeoutMs: 16000,
    });
    const offers = res.ok ? parseOffers(res.text, article) : [];
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      blocked: res.blocked,
      error: offers.length ? undefined : "Нет цен — ссылка на OEM-поиск",
      durationMs: Date.now() - started,
      offers: offers.length ? offers : [propartsShell(article)],
    };
  }

  const pages = await Promise.all(
    targets.map((brand) =>
      fetchText({
        url: `${BASE}/search/number/?article=${encodeURIComponent(article)}&brand=${encodeURIComponent(brand)}`,
        headers: { Referer: `${BASE}/search/number/?article=${encodeURIComponent(article)}` },
        timeoutMs: 16000,
      })
    )
  );

  const all: PartOffer[] = [];
  let anyOk = false;
  let blocked = false;
  for (const page of pages) {
    if (page.blocked) blocked = true;
    if (!page.ok) continue;
    anyOk = true;
    all.push(...parseOffers(page.text, article));
  }

  // Dedupe
  const seen = new Set<string>();
  const offers = all.filter((o) => {
    const k = `${o.brand}|${o.article}|${o.price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  offers.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));

  if (!offers.length) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      blocked: !anyOk && blocked,
      error: anyOk
        ? "Нет цен в HTML — ссылка на OEM-поиск"
        : "Не удалось получить цены — откройте на ProParts",
      durationMs: Date.now() - started,
      offers: [propartsShell(article)],
    };
  }

  return {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    ok: anyOk,
    blocked: !anyOk && blocked,
    error: anyOk ? undefined : "Не удалось получить цены",
    durationMs: Date.now() - started,
    offers: offers.slice(0, 40),
  };
}
