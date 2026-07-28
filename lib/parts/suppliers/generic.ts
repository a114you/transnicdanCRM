/**
 * Generic OEM search for open MD catalogs.
 * Pattern (same idea as AutoMall):
 *   searchUrl?q={OEM}  →  parse HTML  →  priced offers
 *   if empty but page OK → shell deep-link so user opens in browser
 * Tries article variants (dashed / compact) — many shops only match one form.
 */

import { articleForUrl, normalizeArticle } from "../normalize";
import { fetchText } from "../http";
import {
  dedupeOffers,
  parseApsPlatform,
  parseAutomallTiles,
  parseAutoPort,
  parseDaac,
  parseMdlShopCards,
  parseNipon,
  parseProcar,
  parseSchemaProducts,
  parseWooCommerce,
} from "../parse/html-products";
import type { PartOffer, SupplierSearchResult } from "../types";
import type { SupplierDef } from "./catalog";
import { searchApsPlatform } from "./aps";
import { searchAutomall } from "./automall";
import { searchAutodoctor } from "./autodoctor";
import { searchNipon } from "./nipon";
import { searchProparts } from "./proparts";
import { searchFixbox } from "./fixbox";

function baseResult(def: SupplierDef, started: number, partial: Partial<SupplierSearchResult>): SupplierSearchResult {
  return {
    supplier: def.id,
    supplierName: def.name,
    ok: false,
    durationMs: Date.now() - started,
    offers: [],
    ...partial,
  };
}

function buildSearchUrl(def: SupplierDef, code: string): string | null {
  if (!def.searchUrl) return def.website || null;
  return def.searchUrl.replace("{q}", encodeURIComponent(code));
}

/** OEM forms shops accept: 43852-23000, 4385223000, OC90, OC 90 */
function oemForms(code: string): string[] {
  const raw = code.trim();
  if (!raw) return [];
  const noSpace = raw.replace(/\s+/g, "");
  const compact = noSpace.replace(/[-\u2013\u2014./]/g, "");
  const upper = noSpace.toUpperCase();
  const out = [raw, noSpace, compact, upper];
  // 10+ digit compact → try 5-rest dash (Kia/Hyundai style)
  if (/^\d{10,}$/.test(compact)) {
    out.push(`${compact.slice(0, 5)}-${compact.slice(5)}`);
  }
  // already dashed → also compact
  if (noSpace.includes("-")) {
    out.push(noSpace.replace(/-/g, ""));
  }
  // letter+digits: allow spaced "OC 90"
  const m = compact.match(/^([A-Z]+)(\d+[A-Z0-9]*)$/i);
  if (m) out.push(`${m[1]} ${m[2]}`);
  return [...new Set(out.filter((s) => s.length >= 3))].slice(0, 5);
}

function parseGenericHtml(html: string, def: SupplierDef, article: string): PartOffer[] {
  const baseUrl = def.website || "https://example.com";
  const ctx = {
    supplier: def.id,
    supplierName: def.name,
    baseUrl,
    article,
    currency: "MDL" as string,
  };

  switch (def.scrape) {
    case "aps":
      return dedupeOffers([...parseApsPlatform(html, ctx), ...parseSchemaProducts(html, ctx)]);
    case "automall_tiles": {
      // MDL only — PMR twin is disabled in catalog; never mark as PMR
      const tiles = parseAutomallTiles(html, {
        ...ctx,
        currency: "MDL",
      });
      return dedupeOffers(tiles);
    }
    case "woocommerce":
      return dedupeOffers([...parseWooCommerce(html, ctx), ...parseSchemaProducts(html, ctx)]);
    case "mdl_shop":
      return dedupeOffers([
        ...parseMdlShopCards(html, ctx),
        ...parseSchemaProducts(html, ctx),
        ...parseWooCommerce(html, ctx),
      ]);
    case "procar":
      return dedupeOffers([...parseProcar(html, ctx), ...parseSchemaProducts(html, ctx)]);
    case "autoport":
      return dedupeOffers(parseAutoPort(html, ctx));
    case "daac":
      return dedupeOffers([...parseDaac(html, ctx), ...parseSchemaProducts(html, ctx)]);
    case "nipon":
      return dedupeOffers(parseNipon(html, ctx));
    case "schema":
    case "wp_search":
    case "query_search":
    case "autotrade":
      return dedupeOffers([
        ...parseSchemaProducts(html, ctx),
        ...parseWooCommerce(html, ctx),
        ...parseMdlShopCards(html, ctx),
        ...parseProcar(html, ctx),
        ...parseApsPlatform(html, ctx),
      ]);
    default:
      return dedupeOffers([
        ...parseProcar(html, ctx),
        ...parseSchemaProducts(html, ctx),
        ...parseApsPlatform(html, ctx),
        ...parseAutomallTiles(html, ctx),
        ...parseWooCommerce(html, ctx),
        ...parseMdlShopCards(html, ctx),
      ]);
  }
}

function shellOffer(def: SupplierDef, article: string, url: string): PartOffer {
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

/** Open OEM catalogs — prefer curl for flaky TLS; no unlock hammer */
const OPEN_OEM_CURL = new Set([
  "enorm",
  "aps",
  "autoresident",
  "procar",
  "allpiese",
  "daac",
  "niponauto",
  "webmallpmr",
  "aproteh",
  "koreaauto",
  "xpressauto",
  "autotrade",
  "autoport",
  "autoshina",
]);

export async function searchSupplier(def: SupplierDef, code: string): Promise<SupplierSearchResult> {
  const started = Date.now();
  const article = articleForUrl(code);

  if (def.scrape === "none") {
    const link = def.searchUrl
      ? def.searchUrl.replace("{q}", encodeURIComponent(article || code))
      : def.website;
    return baseResult(def, started, {
      ok: true,
      offline: true,
      offers: link
        ? [shellOffer(def, article || code, link)]
        : [],
      error: def.website
        ? "Онлайн-парсер выкл. — откройте поиск на сайте"
        : "Нет сайта / только офлайн",
    });
  }

  if (article.length < 3) {
    return baseResult(def, started, { error: "Артикул слишком короткий" });
  }

  // Specialized engines (already OEM-aware)
  if (def.scrape === "proparts") {
    const r = await searchProparts(code);
    return { ...r, supplier: def.id, supplierName: def.name };
  }
  if (def.scrape === "automall") {
    const r = await searchAutomall(code);
    return { ...r, supplier: def.id, supplierName: def.name };
  }
  if (def.scrape === "autodoctor" || def.id === "autodoctor") {
    const r = await searchAutodoctor(code);
    return { ...r, supplier: def.id, supplierName: def.name };
  }
  if (def.scrape === "nipon" || def.id === "niponauto") {
    const r = await searchNipon(code);
    return { ...r, supplier: def.id, supplierName: def.name };
  }
  if (def.id === "fixbox") {
    const r = await searchFixbox(code);
    return { ...r, supplier: def.id, supplierName: def.name };
  }
  // APS / ENORM / AutoResident — open productslist (+ APS product-page prices)
  if (def.scrape === "aps") {
    return searchApsPlatform(def, code);
  }

  // Slow hosts: DAAC TTFB ~15–18s — one form only, longer fetch budget
  const slowHost = def.id === "daac" || def.id === "autoshina" || def.id === "allpiese";
  const forms = slowHost ? oemForms(article).slice(0, 1) : oemForms(article);
  const hardWaf =
    def.id === "alvadi" || def.id === "agropiese" || def.id === "fixbox";
  const hasUnlock = Boolean(
    process.env.SCRAPINGBEE_API_KEY ||
      process.env.PARTS_SCRAPINGBEE_KEY ||
      process.env.PARTS_UNLOCK_URL ||
      process.env.FLARESOLVERR_URL
  );
  const { hasConfiguredProxy } = await import("../http");
  const hasProxy = hasConfiguredProxy();

  // Skip hard-WAF hosts without bypass — still return shell link
  if (hardWaf && !hasProxy && !hasUnlock && process.env.PARTS_TRY_WAF !== "1") {
    const shell = buildSearchUrl(def, article);
    return baseResult(def, started, {
      ok: true,
      blocked: false,
      offers: shell ? [shellOffer(def, article, shell)] : [],
      error: `WAF (${def.id}) — откройте в браузере: ${shell || def.website || ""}`,
    });
  }

  const fetchTimeoutMs = hardWaf
    ? 22000
    : def.id === "daac"
      ? Number(process.env.PARTS_DAAC_FETCH_MS || 22000)
      : slowHost
        ? 18000
        : 14000;

  try {
    let lastError: string | undefined;
    let lastBlocked = false;
    const allOffers: PartOffer[] = [];

    for (const form of forms) {
      // Leave headroom under supplier hard timeout
      if (Date.now() - started > fetchTimeoutMs + 2000) break;

      const url = buildSearchUrl(def, form);
      if (!url) continue;

      const res = await fetchText({
        url,
        timeoutMs: fetchTimeoutMs,
        forceUnlock: hardWaf && hasUnlock,
        retries: hardWaf ? (hasProxy || hasUnlock ? 2 : 0) : forms.length > 1 ? 0 : slowHost ? 0 : 1,
        preferCurl: hardWaf ? hasProxy || hasUnlock : OPEN_OEM_CURL.has(def.id),
        skipWarmup: true,
        headers: {
          Referer: def.website || url,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,ro;q=0.8,en;q=0.7",
        },
      });

      if (res.blocked) {
        lastBlocked = true;
        lastError = `WAF/антибот (${res.strategy})`;
        continue;
      }
      if (!res.ok) {
        lastError = res.status ? `HTTP ${res.status}` : res.text.slice(0, 120);
        // DAAC sometimes returns empty body slowly then fails — still shell
        if (slowHost) break;
        continue;
      }

      let offers = parseGenericHtml(res.text, def, form);
      offers = offers.filter((o) => o.price == null || (o.price >= 3 && o.price <= 50_000));

      const searchLink = buildSearchUrl(def, form) || def.website;
      const isMdl = (o: PartOffer) =>
        !o.currency || /^(MDL|L|LEI)$/i.test(o.currency);
      offers = offers.map((o) => ({
        ...o,
        url: o.url || searchLink,
        priceConfidence:
          o.priceConfidence ||
          (o.price != null && isMdl(o)
            ? ("high" as const)
            : o.price != null
              ? ("medium" as const)
              : ("low" as const)),
      }));

      allOffers.push(...offers);
      // Enough priced hits — stop trying more forms
      if (offers.some((o) => o.price != null && o.price > 0)) break;
      // Slow hosts: never burn a second 16s attempt
      if (slowHost) break;
    }

    const offers = dedupeOffers(allOffers).slice(0, 40);
    const primaryLink = buildSearchUrl(def, article) || def.website;

    // Always leave a clickable OEM shell when open catalog exists but no cards
    if (!offers.length && primaryLink) {
      return baseResult(def, started, {
        ok: true,
        blocked: lastBlocked,
        offers: [shellOffer(def, article, primaryLink)],
        error: lastBlocked
          ? `${lastError || "WAF"} — ссылка на поиск OEM`
          : lastError
            ? `${lastError} — откройте поиск на сайте`
            : "Каталог открыт; позиций с ценой нет — ссылка на OEM-поиск",
      });
    }

    if (!offers.length) {
      return baseResult(def, started, {
        ok: !lastBlocked,
        blocked: lastBlocked,
        error: lastError || "Нет предложений",
      });
    }

    return baseResult(def, started, {
      ok: true,
      offers,
      error: offers.every((o) => o.price == null)
        ? "Есть позиции/ссылки, розница скрыта (логин?) — откройте на сайте"
        : undefined,
    });
  } catch (err) {
    const shell = buildSearchUrl(def, article);
    return baseResult(def, started, {
      error: err instanceof Error ? err.message : "Ошибка",
      offers: shell ? [shellOffer(def, article, shell)] : [],
      ok: Boolean(shell),
    });
  }
}
