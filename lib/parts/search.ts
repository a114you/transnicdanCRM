import {
  extractTrustedAnalogs,
  filterExpandBatch,
  filterOffersBySearchFamily,
  tagExpandedOffers,
} from "./analogs";
import { cacheGet, cacheKey, cacheSet } from "./cache";
import { groupByMatch, isShellOffer, rankAndClassify } from "./match";
import { normalizeArticle } from "./normalize";
import {
  isJunkOem,
  isPlausibleOem,
  oemSearchVariants,
} from "./oem-quality";
import {
  categoryLinksFor,
  coreSearchSupplierIds,
  getSupplier,
  UNIFIED_CATEGORIES,
  type SearchPhase,
} from "./suppliers/catalog";
import { enabledSuppliers, searchAllSuppliers } from "./suppliers";
import type { PartOffer, PartsSearchResponse, SupplierId } from "./types";

const FALLBACK_SEARCH_URL: Record<string, string> = {
  proparts: "https://proparts.md/search/number/?article={q}",
  autodoctor: "https://autodoctor.md/shop/search/products/{q}",
  automall: "https://www.automall.md/Catalog/Search?number={q}",
  enorm: "https://www.enorm.md/search_products/?query={q}",
  aps: "https://www.aps.md/search_products/?query={q}",
  autoresident: "https://www.autoresident.md/search_products/?query={q}",
  allpiese: "https://allpiese.md/search?q={q}",
  niponauto: "https://niponauto.md/ru/search?key={q}",
  autoport: "https://autoport.md/?s={q}",
  daac: "https://daac-piese.md/ru/poisk?search={q}",
  procar: "https://procar.md/search?q={q}",
  aproteh: "https://aproteh.md/poisk/?search={q}",
  koreaauto: "https://koreaauto.md/?s={q}",
  autodoc_md: "https://autodoc.md/index.php?route=product/search&search={q}",
};

function searchUrlForSupplier(supplierId: string, query: string): string | undefined {
  const q = encodeURIComponent(query.trim());
  const def = getSupplier(supplierId);
  if (def?.searchUrl) return def.searchUrl.replace("{q}", q);
  const tpl = FALLBACK_SEARCH_URL[supplierId];
  if (tpl) return tpl.replace("{q}", q);
  if (def?.website) return def.website;
  return undefined;
}

function ensureOfferUrl(offer: PartsSearchResponse["offers"][0], query: string) {
  if (offer.url) return offer;
  const url = searchUrlForSupplier(offer.supplier, query);
  return url ? { ...offer, url } : offer;
}

/** Always-on MD shop deep-links — same as typing the code into Google/browser. */
function buildAlwaysShopLinks(
  query: string,
  results: PartsSearchResponse["results"],
  shells: PartOffer[]
): Array<{ supplier: string; supplierName: string; url: string; label: string }> {
  const map = new Map<
    string,
    { supplier: string; supplierName: string; url: string; label: string }
  >();

  const add = (supplier: string, supplierName: string, url?: string | null) => {
    if (!url || map.has(supplier)) return;
    if (/webmall|pmr|pandashop/i.test(supplier)) return;
    if (/anvelope|autoshina|masterlux/i.test(supplier) && !/R\d{2}|\/\d{2}/i.test(query)) {
      return;
    }
    map.set(supplier, {
      supplier,
      supplierName,
      url,
      label: `Открыть ${query} на ${supplierName}`,
    });
  };

  for (const s of shells) {
    add(s.supplier, s.supplierName, s.url);
  }
  for (const r of results) {
    const fromOffer = r.offers?.find((o) => o.url)?.url;
    add(r.supplier, r.supplierName, fromOffer || searchUrlForSupplier(r.supplier, query));
  }
  // Core catalog always — even if supplier timed out / returned empty
  for (const id of coreSearchSupplierIds()) {
    const def = getSupplier(id);
    if (!def) continue;
    add(id, def.name, searchUrlForSupplier(id, query));
  }
  // Any other enabled scrapable that ran this phase
  for (const r of results) {
    add(r.supplier, r.supplierName, searchUrlForSupplier(r.supplier, query));
  }

  return [...map.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ru"));
}

function dedupeGlobal(offers: PartsSearchResponse["offers"]) {
  const seen = new Set<string>();
  const out: typeof offers = [];
  for (const o of offers) {
    const key = [
      o.supplier,
      normalizeArticle(o.article),
      (o.brand || "").toUpperCase().slice(0, 20),
      o.price ?? "np",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/** Moldova only: MDL / lei. Never PMR / RUB / foreign twins. */
export function isMoldovaCurrency(o: PartOffer): boolean {
  const cur = (o.currency || "MDL").toUpperCase().replace(/\s/g, "");
  if (!cur || cur === "MDL" || cur === "L" || cur === "LEI" || cur === "LEU") return true;
  return false;
}

/**
 * Trust for bestPrice: real MDL card price.
 * Do NOT drop medium/low confidence — many parsers mark unauth/partial as low
 * and the UI then looked "empty" while shops had prices in browser.
 */
function isTrustedPriced(o: PartOffer): o is PartOffer & { price: number } {
  if (o.isShell) return false;
  if (o.price == null || !(o.price > 0)) return false;
  if (o.price < 3 || o.price > 50_000) return false;
  if (!isMoldovaCurrency(o)) return false;
  if (/webmall|pmr|pandashop/i.test(o.supplier)) return false;
  // Only reject "low" if it is a shell-style harvest without brand/article
  if (o.priceConfidence === "low") {
    const brand = (o.brand || "").trim();
    if (!brand || brand === "—" || !o.article) return false;
  }
  return true;
}

/** Drop non-MDL priced rows from comparison tables entirely */
function filterMoldovaOffers(offers: PartOffer[]): PartOffer[] {
  return offers.filter((o) => {
    // Never surface PMR twin as its own supplier row
    if (/webmall|pmr/i.test(o.supplier)) return false;
    if (o.isShell) return true;
    if (o.price == null) return true; // link / «см. на сайте» OK
    // Guard: rub labeled as MDL
    if (/руб|RUB|PRB/i.test(o.rawPriceText || "") || /руб|RUB/i.test(o.currency || "")) {
      return false;
    }
    return isMoldovaCurrency(o);
  });
}

function summarize(
  query: string,
  normalized: string,
  started: number,
  results: PartsSearchResponse["results"],
  phase: SearchPhase = "all",
  expandedAnalogs?: PartsSearchResponse["expandedAnalogs"]
): PartsSearchResponse {
  // Strip junk + shell placeholders from main tables
  const flatAll = results
    .flatMap((r) => r.offers)
    .map((o) => ensureOfferUrl(o, query));
  // Never show PMR / foreign currency prices in MD comparison
  const mdOnly = filterMoldovaOffers(flatAll);
  const shells = mdOnly.filter(isShellOffer);
  let flat = mdOnly.filter((o) => !isShellOffer(o));
  // Family gate only for CROSS noise (GDB pads ≠ thermostat). Exact codes always kept.
  flat = filterOffersBySearchFamily(flat, query, { allowRelated: false });
  const ranked = rankAndClassify(flat, query); // drops weak + non-auto junk
  const groups = groupByMatch(ranked);

  const offers = dedupeGlobal([...groups.exact, ...groups.cross]);
  // Exact with real price first in mind — keep free exact only as secondary info
  const exactOffers = dedupeGlobal(groups.exact);
  const crossOffers = dedupeGlobal(groups.cross);

  // ALWAYS shop deep-links (browser parity) — even when we already have prices
  const shopLinks = buildAlwaysShopLinks(query, results, shells);

  // bestPrice: MDL only, same-family already filtered; prefer not sub-10 MDL noise
  // unless it's an exact match (rare legit cheap part)
  const priced = offers.filter(isTrustedPriced).filter((o) => {
    if (o.price != null && o.price < 15 && o.matchType !== "exact") {
      // 3.96 MDL propshaft as "pad analog" — reject cheap cross outliers
      const art = normalizeArticle(o.article || "");
      const q = normalizeArticle(query);
      if (art !== q) return false;
    }
    return true;
  });
  const exactPriced = exactOffers.filter(isTrustedPriced);
  const bestPrice = priced.length ? Math.min(...priced.map((o) => o.price)) : null;
  const bestExactPrice = exactPriced.length
    ? Math.min(...exactPriced.map((o) => o.price))
    : null;
  const bestOffer = priced.find((o) => o.price === bestPrice);

  const withLinks = offers.filter((o) => o.url).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.ok && !r.blocked).length;
  const pricedCount = offers.filter((o) => o.price != null && o.price > 0).length;

  let explanation: string;
  if (groups.exact.length || groups.cross.length) {
    explanation =
      `«${query}»: ${exactOffers.length} точных + ${crossOffers.length} аналогов` +
      (pricedCount ? `, ${pricedCount} с ценой MDL` : ", без цен в HTML") +
      `. Прямые ссылки: ${shopLinks.length} магазинов MD.`;
    if (expandedAnalogs?.length) {
      const codes = expandedAnalogs
        .slice(0, 5)
        .map((a) => `${a.brand} ${a.article}`.trim())
        .join(", ");
      explanation += ` · Кроссы (${expandedAnalogs.length}): ${codes}.`;
    }
    if (phase === "core") {
      explanation += " Ядро; догрузка…";
    }
  } else {
    explanation =
      `По «${query}» парсеры не вытащили карточки (сайт отдал пусто/JS/логин). ` +
      `Ниже ${shopLinks.length} прямых ссылок на поиск у поставщиков MD — как в браузере.`;
    if (blocked) explanation += ` WAF: ${blocked}.`;
    if (failed) explanation += ` Ошибки: ${failed}.`;
  }

  return {
    query,
    normalized,
    tookMs: Date.now() - started,
    results,
    offers,
    exactOffers,
    crossOffers,
    bestPrice,
    bestExactPrice,
    bestSupplier: bestOffer?.supplier ?? null,
    inStockCount: offers.filter((o) => o.stock === "in_stock" || o.stock === "order").length,
    suppliersTotal: results.length,
    suppliersOk: results.filter((r) => r.ok && r.offers.some((o) => o.price != null || o.url)).length,
    shopLinks: shopLinks.length ? shopLinks : undefined,
    explanation,
    phase,
    cached: false,
    cachedAt: null,
    expandedAnalogs: expandedAnalogs?.length ? expandedAnalogs : undefined,
  };
}

function mergeSupplierResults(
  batches: PartsSearchResponse["results"][]
): PartsSearchResponse["results"] {
  const bySupplier = new Map<string, PartsSearchResponse["results"][0]>();
  for (const batch of batches) {
    for (const r of batch) {
      const prev = bySupplier.get(r.supplier);
      if (!prev) {
        bySupplier.set(r.supplier, { ...r, offers: [...r.offers] });
      } else {
        prev.offers.push(...r.offers);
        prev.ok = prev.ok || r.ok;
        prev.blocked = prev.blocked || r.blocked;
        if (!prev.error && r.error) prev.error = r.error;
        prev.durationMs = Math.max(prev.durationMs, r.durationMs);
      }
    }
  }
  return [...bySupplier.values()];
}

/**
 * After primary OEM hit: take trusted analog codes from cross tabs and
 * re-search them on core MD shops (prices for FEBI/MANN/… across everyone).
 */
async function expandByTrustedAnalogs(
  query: string,
  primaryNormalized: string,
  primaryResults: PartsSearchResponse["results"],
  phase: SearchPhase
): Promise<{
  results: PartsSearchResponse["results"];
  expandedAnalogs: PartsSearchResponse["expandedAnalogs"];
}> {
  const cleanOnly = (rows: PartsSearchResponse["results"]) =>
    rows.map((r) => ({
      ...r,
      offers: filterOffersBySearchFamily(r.offers, primaryNormalized, {
        allowRelated: false,
      }),
    }));

  const disabled =
    process.env.PARTS_ANALOG_EXPAND === "0" ||
    process.env.PARTS_ANALOG_EXPAND === "false";
  if (disabled) {
    return { results: cleanOnly(primaryResults), expandedAnalogs: undefined };
  }
  // Skip expansion on tiny secondary/waf-only probes — still family-clean
  if (phase === "secondary" || phase === "waf") {
    return { results: cleanOnly(primaryResults), expandedAnalogs: undefined };
  }

  const flat = primaryResults.flatMap((r) => r.offers).filter((o) => !isShellOffer(o));
  // Family-cleaned primary first so seeds don't come from thermostat noise
  const flatClean = filterOffersBySearchFamily(flat, primaryNormalized, {
    allowRelated: false,
  });
  const maxAnalogs = Math.max(
    1,
    Math.min(Number(process.env.PARTS_ANALOG_MAX || 4), 6)
  );
  const seeds = extractTrustedAnalogs(flatClean, primaryNormalized, { max: maxAnalogs });
  if (!seeds.length) {
    // Still return family-filtered primary (strip wrong-family "analogs" from ENORM page)
    const cleanedPrimary = primaryResults.map((r) => ({
      ...r,
      offers: filterOffersBySearchFamily(r.offers, primaryNormalized, {
        allowRelated: false,
      }),
    }));
    return { results: cleanedPrimary, expandedAnalogs: undefined };
  }

  // Expand only on shops that return real priced cards for aftermarket codes
  const expandIds = [
    "proparts",
    "enorm",
    "autodoctor",
    "procar",
    "allpiese",
    "aps",
    "autoresident",
  ].filter((id) => coreSearchSupplierIds().includes(id) || enabledSuppliers("core").includes(id));

  const analogResults: PartsSearchResponse["results"][] = [];
  const conc = Math.max(1, Math.min(Number(process.env.PARTS_ANALOG_CONCURRENCY || 2), 4));
  let idx = 0;
  async function worker() {
    while (idx < seeds.length) {
      const i = idx++;
      const seed = seeds[i];
      if (!seed) break;
      try {
        const batch = await searchAllSuppliers(seed.article, expandIds, "core");
        for (const r of batch) {
          r.offers = filterExpandBatch(r.offers, seed, primaryNormalized);
        }
        analogResults.push(batch);
      } catch {
        /* skip failed analog code */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, seeds.length) }, () => worker()));

  // Clean primary rows before merge
  const cleanedPrimary = primaryResults.map((r) => ({
    ...r,
    offers: filterOffersBySearchFamily(r.offers, primaryNormalized, {
      allowRelated: false,
    }),
  }));

  const merged = mergeSupplierResults([cleanedPrimary, ...analogResults]);
  const seedArts = seeds.map((s) => s.article);
  const expectedFam = seeds[0]?.family;
  for (const r of merged) {
    r.offers = tagExpandedOffers(r.offers, seedArts, primaryNormalized, expectedFam);
    r.offers = filterOffersBySearchFamily(r.offers, primaryNormalized, {
      allowRelated: false,
    });
  }

  return {
    results: merged,
    expandedAnalogs: seeds.map((s) => ({
      article: s.article,
      brand: s.brand,
      sourceSupplier: s.sourceSupplier,
      score: s.score,
    })),
  };
}

export async function searchPartsByCode(
  rawQuery: string,
  options?: {
    suppliers?: SupplierId[];
    skipCache?: boolean;
    phase?: SearchPhase;
  }
): Promise<PartsSearchResponse> {
  const started = Date.now();
  const phase: SearchPhase = options?.phase || "all";
  const normalized = normalizeArticle(rawQuery);
  if (normalized.length < 3) {
    return {
      query: rawQuery,
      normalized,
      tookMs: 0,
      results: [],
      offers: [],
      exactOffers: [],
      crossOffers: [],
      bestPrice: null,
      bestSupplier: null,
      inStockCount: 0,
      suppliersTotal: 0,
      suppliersOk: 0,
      explanation: "Введите артикул (минимум 3 символа)",
      phase,
      cached: false,
    };
  }

  // OCR / placeholder junk — don't spam 20 shops for 30s
  if (isJunkOem(normalized) || !isPlausibleOem(normalized)) {
    return {
      query: rawQuery,
      normalized,
      tookMs: Date.now() - started,
      results: [],
      offers: [],
      exactOffers: [],
      crossOffers: [],
      bestPrice: null,
      bestSupplier: null,
      inStockCount: 0,
      suppliersTotal: 0,
      suppliersOk: 0,
      explanation:
        `«${rawQuery}» не похож на заводской OEM (часто ошибка OCR картинки elcats: NO000… / нули). ` +
        `Откройте карточку детали снова или введите код вручную (например A639… / N910…).`,
      phase,
      cached: false,
    };
  }

  const suppliers = options?.suppliers?.length
    ? options.suppliers
    : enabledSuppliers(phase);
  const variants = oemSearchVariants(rawQuery);
  const primary = variants[0] || normalized;
  const key = cacheKey(`${phase}:${primary}`, suppliers);

  if (!options?.skipCache) {
    const cached = cacheGet(key);
    if (cached) {
      return {
        ...cached,
        tookMs: Date.now() - started,
        cached: true,
        phase,
      };
    }
  }

  // Primary form first — all scrapable MD shops for this phase
  let results = await searchAllSuppliers(primary, suppliers, phase);

  // If zero priced exact and we have alternates (N/O OCR, N without prefix) — try next
  let bestPrimary = results;
  let bestPrimaryNorm = primary;
  {
    const probe = summarize(rawQuery.trim(), primary, started, results, phase);
    const priced = (probe.exactOffers || []).some(
      (o) => o.price != null && o.price > 0
    );
    if (!priced && variants.length > 1) {
      for (let i = 1; i < variants.length; i++) {
        const alt = variants[i]!;
        const altResults = await searchAllSuppliers(alt, suppliers, phase);
        const altResp = summarize(rawQuery.trim(), alt, started, altResults, phase);
        const altPriced = (altResp.exactOffers || []).some(
          (o) => o.price != null && o.price > 0
        );
        const better =
          altPriced ||
          (altResp.exactOffers?.length || 0) > (probe.exactOffers?.length || 0);
        if (better) {
          bestPrimary = altResults;
          bestPrimaryNorm = alt;
          if (altPriced) break;
        }
      }
    }
  }

  // TecDoc-style: pull analog codes from cross tabs → re-search across MD
  const expanded = await expandByTrustedAnalogs(
    rawQuery.trim(),
    bestPrimaryNorm,
    bestPrimary,
    phase
  );

  let response = summarize(
    rawQuery.trim(),
    bestPrimaryNorm,
    started,
    expanded.results,
    phase,
    expanded.expandedAnalogs
  );

  if (bestPrimaryNorm !== primary) {
    response = {
      ...response,
      explanation:
        (response.explanation || "") + ` · искали также как ${bestPrimaryNorm}`,
    };
  }

  // Clearer empty state for MB standard hardware that MD rarely stocks by NO/N0 code
  if (
    !(response.exactOffers || []).some((o) => o.price != null && o.price > 0) &&
    /^N/i.test(bestPrimaryNorm)
  ) {
    response = {
      ...response,
      explanation:
        (response.explanation || "") +
        " · MB-стандарт (Normteil N…): в MD часто нет по этому коду — смотрите размер в описании (M8×20…) или замену A-номера на схеме.",
    };
  }

  if ((response.offers?.length || 0) > 0) {
    const storedAt = Date.now();
    cacheSet(key, { ...response, cachedAt: storedAt, cached: false });
    response.cachedAt = storedAt;
  }

  return response;
}

/** Merge core + secondary responses (client expand path or server all) */
export function mergeSearchResponses(
  a: PartsSearchResponse,
  b: PartsSearchResponse
): PartsSearchResponse {
  const bySupplier = new Map<string, PartsSearchResponse["results"][0]>();
  for (const r of [...a.results, ...b.results]) {
    const prev = bySupplier.get(r.supplier);
    if (!prev) {
      bySupplier.set(r.supplier, { ...r, offers: [...r.offers] });
    } else {
      prev.offers.push(...r.offers);
      prev.ok = prev.ok || r.ok;
      prev.blocked = prev.blocked || r.blocked;
      if (!prev.error && r.error) prev.error = r.error;
      prev.durationMs = Math.max(prev.durationMs, r.durationMs);
    }
  }
  const results = [...bySupplier.values()];
  const started = Date.now() - Math.max(a.tookMs, b.tookMs);
  return summarize(a.query || b.query, a.normalized || b.normalized, started, results, "all");
}

export async function compareCategory(
  categoryId: string,
  options?: { skipCache?: boolean; maxHints?: number }
): Promise<import("./types").CategoryCompareResponse> {
  const started = Date.now();
  const cat = UNIFIED_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) {
    return {
      categoryId,
      categoryNameRu: categoryId,
      categoryNameRo: categoryId,
      tookMs: 0,
      queries: [],
      results: [],
      offers: [],
      bestPrice: null,
      inStockCount: 0,
      supplierLinks: categoryLinksFor(categoryId).map((l) => ({
        supplierId: l.supplierId,
        name: l.name,
        url: l.url,
        hasScrape: l.scrape !== "none",
      })),
    };
  }

  const hints = cat.searchHints.slice(0, options?.maxHints ?? 2);
  const suppliers = enabledSuppliers("core");
  const cacheK = cacheKey(`cat:${categoryId}:${hints.join(",")}`, suppliers);

  if (!options?.skipCache) {
    const cached = cacheGet(cacheK);
    if (cached) {
      return {
        categoryId,
        categoryNameRu: cat.nameRu,
        categoryNameRo: cat.nameRo,
        tookMs: Date.now() - started,
        queries: hints,
        results: cached.results,
        offers: cached.offers,
        bestPrice: cached.bestPrice,
        bestSupplier: cached.bestSupplier,
        inStockCount: cached.inStockCount,
        supplierLinks: categoryLinksFor(categoryId).map((l) => ({
          supplierId: l.supplierId,
          name: l.name,
          url: l.url,
          hasScrape: l.scrape !== "none",
        })),
      };
    }
  }

  const batches = await Promise.all(hints.map((h) => searchAllSuppliers(h, suppliers, "core")));
  const bySupplier = new Map<string, (typeof batches)[0][0]>();
  for (const batch of batches) {
    for (const r of batch) {
      const prev = bySupplier.get(r.supplier);
      if (!prev) {
        bySupplier.set(r.supplier, { ...r, offers: [...r.offers] });
      } else {
        prev.offers.push(...r.offers);
        prev.ok = prev.ok || r.ok;
        prev.blocked = prev.blocked || r.blocked;
        prev.durationMs += r.durationMs;
      }
    }
  }

  const results = [...bySupplier.values()];
  const summary = summarize(hints[0] || categoryId, categoryId, started, results, "core");

  if (summary.offers.length > 0) {
    cacheSet(cacheK, summary);
  }

  return {
    categoryId,
    categoryNameRu: cat.nameRu,
    categoryNameRo: cat.nameRo,
    tookMs: Date.now() - started,
    queries: hints,
    results: summary.results,
    offers: summary.offers,
    bestPrice: summary.bestPrice,
    bestSupplier: summary.bestSupplier,
    inStockCount: summary.inStockCount,
    supplierLinks: categoryLinksFor(categoryId).map((l) => ({
      supplierId: l.supplierId,
      name: l.name,
      url: l.url,
      hasScrape: l.scrape !== "none",
    })),
  };
}
