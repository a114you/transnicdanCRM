/**
 * VIN → OEM catalog (elcats primary, catcar fallback) → factory P/Ns → MD prices.
 *
 * Rules (workshop-critical):
 *  1) Vehicle identity ONLY from OEM EPC (elcats.ru = full modern base + real names;
 *     catcar.info = legacy fallback, often ≤2018).
 *  2) Part codes ONLY from OEM unit tables / callbacks for that VIN (full articles).
 *  3) Supplier search: STRICT exact article match only. No “analogs”, no prefix junk.
 */

import { searchAllSuppliers } from "../suppliers";
import { type RankedOffer } from "../match";
import { articlesMatch, normalizeArticle } from "../normalize";
import type { PartOffer, VinDecodeResult } from "../types";
import {
  findPartType,
  makeToEnormSlug,
  SERVICE_GROUPS,
  type ServiceGroup,
  type ServicePartType,
} from "./tecdoc-groups";
import {
  loadCategoryChildren,
  type VehicleCatalogNode,
  type VehicleModification,
} from "./enorm-car";
import { isValidVin, normalizeVin } from "../normalize";

export interface VinSessionVehicle extends VinDecodeResult {
  brandSlug?: string | null;
}

export interface VinModelsResponse {
  vehicle: VinSessionVehicle;
  modifications: VehicleModification[];
  tookMs: number;
}

export interface VinCatalogResponse {
  vehiclePath: string;
  vehicleName: string;
  groups: ServiceGroup[];
  rootNodes: VehicleCatalogNode[];
  maintenance: ServicePartType[];
  oemGroups?: Array<{ id?: string; title: string; url: string }>;
  oemUnits?: Array<{
    title: string;
    groupId: string;
    rootId?: string;
    rootTitle?: string;
    navNode?: {
      id: string;
      title: string;
      action: string;
      fields: Record<string, string>;
    };
  }>;
  /** Brand-agnostic nav payloads for opening EPC nodes */
  oemNavNodes?: Array<{
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
    rootId?: string;
    rootTitle?: string;
  }>;
}

export interface VinPartsCompareResponse {
  vehiclePath: string;
  vehicleName?: string;
  partType: ServicePartType;
  categoryId?: number;
  sourceUrl?: string;
  /** Exact OEM factory codes for this VIN + part type */
  articles: string[];
  /** OEM rows with names (for UI) */
  oemParts?: Array<{ article: string; name: string; unitTitle?: string }>;
  vehicleOffers: RankedOffer[];
  /** ONLY exact OEM matches from MD suppliers */
  offers: RankedOffer[];
  bestPrice: number | null;
  bestSupplier: string | null;
  inStockCount: number;
  suppliersOk: number;
  suppliersTotal: number;
  tookMs: number;
  explanation: string;
}

/** Strict: offer article must equal query after normalize (no prefix / no “looks similar”). */
function isStrictOemMatch(query: string, offerArticle: string): boolean {
  const q = normalizeArticle(query);
  const a = normalizeArticle(offerArticle);
  if (!q || !a || q.length < 5) return false;
  return q === a;
}

function toExactRanked(o: PartOffer, query: string): RankedOffer {
  return {
    ...o,
    isAnalog: false,
    matchType: "exact",
    matchScore: 100,
    priceConfidence: o.priceConfidence || "high",
  };
}

/**
 * OEM-only VIN decode. No TecDoc / NHTSA / chassi model guessing.
 * Primary: elcats.ru (modern years + real category/part names).
 * Fallback: catcar.info (older coverage).
 */
export async function vinDecodeAndModels(rawVin: string): Promise<VinModelsResponse> {
  const started = Date.now();
  const vin = normalizeVin(rawVin);

  if (!isValidVin(vin)) {
    return {
      vehicle: {
        vin,
        valid: false,
        error: "VIN должен содержать 17 символов (без I, O, Q)",
      },
      modifications: [],
      tookMs: Date.now() - started,
    };
  }

  // 1) Elcats — full modern OEM base
  const { decodeVinElcats } = await import("./elcats-oem");
  const elcats = await decodeVinElcats(vin).catch(() => null);
  const elPrimary = elcats?.variants?.[0];

  if (elcats && elPrimary) {
    const make = elcats.make;
    const brandSlug = makeToEnormSlug(make) || elcats.brandSlug;
    const info = elPrimary.info;

    const vehicle: VinSessionVehicle = {
      vin,
      valid: true,
      make,
      model: info.model,
      modelYear: info.modelYear,
      engine: [info.displacement, info.engine].filter(Boolean).join(" ") || undefined,
      fuel: info.fuel,
      bodyClass: info.body,
      productionDate: info.productionDate,
      transmission: info.transmission,
      brandSlug,
      error:
        `OEM (elcats): ${make} ${info.model || ""}` +
        (info.productionDate ? ` · выпуск ${info.productionDate}` : "") +
        (info.engine || info.displacement
          ? ` · ${[info.displacement, info.engine].filter(Boolean).join(" ")}`
          : "") +
        `. Дерево категорий и заводские названия — из оригинального каталога.`,
      raw: {
        Source: "elcats-oem",
        OemSource: elcats.sourceUrl,
        OemBrand: elcats.brandSlug,
        OemModel: info.model || "",
        OemModelCode: info.modelCode || "",
        OemEngine: info.engine || "",
        OemDate: info.productionDate || "",
        OemCatalog: elPrimary.groupUrl,
        OemModelGuid: elPrimary.modelGuid,
        WMI: vin.slice(0, 3),
      },
    };

    const modifications: VehicleModification[] = elcats.variants.map((v) => ({
      id: v.id,
      brandSlug: brandSlug || v.brandSlug,
      name: v.name,
      path: "",
      yearHint: v.info.modelYear || v.info.productionDate,
      oemCatalogUrl: v.groupUrl,
      engine: v.info.engine || v.info.displacement,
      source: "elcats" as const,
    }));

    return { vehicle, modifications, tookMs: Date.now() - started };
  }

  // 2) Catcar fallback (legacy / brands not on elcats)
  const { decodeVinCatcar } = await import("./catcar-vin");
  const catcar = await decodeVinCatcar(vin).catch(() => null);
  const primary = catcar?.variants?.[0];

  if (!catcar || !primary) {
    return {
      vehicle: {
        vin,
        valid: true,
        make: elcats?.make || catcar?.make,
        error:
          elcats?.error ||
          catcar?.error ||
          "OEM-каталоги (elcats / catcar) не распознали VIN. Проверьте код.",
        raw: {
          Source: "oem-miss",
          ElcatsError: elcats?.error || "",
          CatcarSource: catcar?.sourceUrl || "",
        },
      },
      modifications: [],
      tookMs: Date.now() - started,
    };
  }

  const make = catcar.make;
  const brandSlug = makeToEnormSlug(make) || catcar.brandSlug;

  const vehicle: VinSessionVehicle = {
    vin,
    valid: true,
    make,
    model: primary.model,
    modelYear: primary.modelYear,
    engine: [primary.displacement, primary.engine].filter(Boolean).join(" ") || undefined,
    fuel: primary.fuel,
    bodyClass: primary.body,
    productionDate: primary.productionDate,
    transmission: primary.transmission,
    brandSlug,
    error:
      `OEM (catcar fallback): ${make} ${primary.model || ""}` +
      (primary.productionDate ? ` · выпуск ${primary.productionDate}` : "") +
      `. Внимание: catcar часто без моделей после ~2018 — для новых авто elcats обязателен.`,
    raw: {
      Source: "catcar-fallback",
      ElcatsError: elcats?.error || "no-hit",
      CatcarSource: catcar.sourceUrl,
      CatcarBrand: catcar.brandSlug,
      OemModel: primary.model || "",
      OemEngine: primary.engine || "",
      OemDate: primary.productionDate || "",
      OemCatalog: primary.catalogUrl || "",
      WMI: vin.slice(0, 3),
    },
  };

  const modifications: VehicleModification[] = catcar.variants.map((v) => ({
    id: v.id,
    brandSlug: brandSlug || catcar.brandSlug,
    name: v.name,
    path: "",
    yearHint: v.modelYear || v.productionDate,
    oemCatalogUrl: v.catalogUrl,
    engine: v.engine || v.displacement,
    source: "catcar" as const,
  }));

  return {
    vehicle,
    modifications,
    tookMs: Date.now() - started,
  };
}

export async function vinCatalog(
  vehiclePath: string,
  vehicleName?: string,
  options?: { oemCatalogUrl?: string }
): Promise<VinCatalogResponse> {
  const maintenance = SERVICE_GROUPS.flatMap((g) => g.children.filter((c) => c.maintenance));

  let oemGroups: VinCatalogResponse["oemGroups"];
  let oemUnits: VinCatalogResponse["oemUnits"];
  let oemNavNodes: VinCatalogResponse["oemNavNodes"];
  const catalogUrl = options?.oemCatalogUrl || "";

  if (catalogUrl.includes("elcats.ru")) {
    try {
      const { loadElcatsCatalogTree } = await import("./elcats-oem");
      const tree = await loadElcatsCatalogTree(catalogUrl);
      oemGroups = tree.roots.map((r) => ({
        id: r.id,
        title: r.title,
        url: `${catalogUrl}#${r.id}`,
      }));
      oemUnits = tree.units.map((u) => ({
        title: u.title,
        groupId: u.groupId,
        rootId: u.rootId,
        rootTitle: u.rootTitle,
        navNode: u.navNode,
      }));
      oemNavNodes = tree.navNodes;
    } catch {
      /* optional */
    }
  } else if (catalogUrl) {
    try {
      const { parseCatcarGroupItems } = await import("./catcar-oem-parts");
      const { fetchText } = await import("../http");
      const res = await fetchText({
        url: catalogUrl,
        timeoutMs: 22000,
        retries: 1,
        headers: { Referer: "https://www.catcar.info/", Accept: "text/html" },
      });
      if (res.ok && res.text) {
        oemGroups = parseCatcarGroupItems(res.text);
      }
    } catch {
      /* optional */
    }
  }

  return {
    vehiclePath: vehiclePath || catalogUrl || "",
    vehicleName: vehicleName || vehiclePath || "OEM",
    groups: SERVICE_GROUPS,
    rootNodes: [],
    maintenance,
    oemGroups,
    oemUnits,
    oemNavNodes,
  };
}

export async function vinCategoryChildren(
  vehiclePath: string,
  categoryId: number
): Promise<VehicleCatalogNode[]> {
  return loadCategoryChildren(vehiclePath, categoryId);
}

/**
 * OEM codes for VIN+part → STRICT multi-supplier exact match only.
 */
export async function comparePartsForVehicle(
  vehiclePath: string,
  partTypeId: string,
  options?: { vehicleName?: string; maxArticles?: number; oemCatalogUrl?: string }
): Promise<VinPartsCompareResponse> {
  const started = Date.now();
  const partType = findPartType(partTypeId);
  if (!partType) {
    return emptyCompare(
      vehiclePath,
      { id: partTypeId, nameRu: partTypeId, nameRo: partTypeId },
      started,
      "Неизвестный тип запчасти"
    );
  }

  if (!options?.oemCatalogUrl) {
    return emptyCompare(
      vehiclePath,
      partType,
      started,
      "Нет OEM-каталога для VIN. Сначала декодируйте VIN (elcats / catcar)."
    );
  }

  // 1) Factory OEM numbers only — elcats first (full codes + names), catcar fallback
  let oemList: Array<{ article: string; name: string; unitTitle?: string; score: number }> = [];
  let oemError: string | undefined;
  let sourceUrl = options.oemCatalogUrl;

  if (options.oemCatalogUrl.includes("elcats.ru")) {
    const { findElcatsOemPartsForPartType } = await import("./elcats-oem");
    const oem = await findElcatsOemPartsForPartType(options.oemCatalogUrl, partTypeId, {
      maxUnits: 6,
      maxArticles: options?.maxArticles ?? 8,
      maxExpand: 14,
    });
    oemError = oem.error;
    sourceUrl = oem.catalogUrl;
    // score≥6 = real target line (e.g. PAD KIT), not hubs/bolts that share the axle unit
    const primaryOem = oem.parts.filter((p) => p.score >= 6);
    oemList = (primaryOem.length ? primaryOem : oem.parts.filter((p) => p.score >= 5)).slice(
      0,
      options?.maxArticles ?? 6
    );
  } else {
    const { findOemPartsForPartType } = await import("./catcar-oem-parts");
    const oem = await findOemPartsForPartType(options.oemCatalogUrl, partTypeId, {
      maxUnits: 8,
      maxArticles: options?.maxArticles ?? 6,
    });
    oemError = oem.error;
    const primaryOem = oem.parts.filter((p) => p.score >= 6);
    oemList = (primaryOem.length ? primaryOem : oem.parts.filter((p) => p.score >= 4)).slice(
      0,
      options?.maxArticles ?? 4
    );
  }

  const pick = oemList.map((p) => p.article);

  if (!pick.length) {
    return {
      vehiclePath,
      vehicleName: options?.vehicleName,
      partType,
      sourceUrl,
      articles: [],
      oemParts: [],
      vehicleOffers: [],
      offers: [],
      bestPrice: null,
      bestSupplier: null,
      inStockCount: 0,
      suppliersOk: 0,
      suppliersTotal: 0,
      tookMs: Date.now() - started,
      explanation:
        oemError ||
        `В OEM-каталоге нет явного кода для «${partType.nameRu}». Откройте EPC-узел вручную.`,
    };
  }

  // 2) Search ALL quality MD suppliers — then keep ONLY exact article match
  const { defaultSearchSupplierIds } = await import("../suppliers/catalog");
  const { articleSearchVariants } = await import("../suppliers");
  // All scrapable open catalogs (+ WAF only if proxy/unlock present)
  let supplierIds = defaultSearchSupplierIds("all");
  // Prefer shops that stock OEM / quality stock first
  supplierIds = [
    "koreaauto",
    "proparts",
    "procar",
    "autodoctor",
    "enorm",
    "aps",
    "autoresident",
    "allpiese",
    "autoport",
    "daac",
    "niponauto",
    ...supplierIds,
  ];
  supplierIds = [...new Set(supplierIds)];

  // Search each OEM form shops understand (hyphen / compact / spaced MB)
  const searchCodes = [...new Set(pick.flatMap((c) => articleSearchVariants(c)))];

  const batches = await Promise.all(
    searchCodes.map((code) => searchAllSuppliers(code, supplierIds, "all"))
  );

  const exactOffers: RankedOffer[] = [];
  const seen = new Set<string>();
  // Allowed OEM set (normalized) — never accept other articles
  const allowedOem = new Set(pick.map((c) => normalizeArticle(c)));

  for (let i = 0; i < batches.length; i++) {
    const code = searchCodes[i]!;
    for (const r of batches[i]!) {
      for (const o of r.offers) {
        const artN = normalizeArticle(o.article);
        // Strict: offer.article must be one of our OEM codes (not Bosch/Meyle brand code alone)
        const matchesOem =
          allowedOem.has(artN) ||
          isStrictOemMatch(code, o.article) ||
          // Some shops put OEM in name only — accept if article empty-ish but name has full OEM
          (!!o.name &&
            pick.some((oem) => {
              const n = normalizeArticle(oem);
              const nameN = normalizeArticle(o.name || "");
              return nameN.includes(n) && n.length >= 8 && articlesMatch(o.article, oem);
            }));
        if (!matchesOem) continue;
        // Double-check: article must equal an OEM we asked for (kill wrong brand P/Ns)
        if (!allowedOem.has(artN) && !pick.some((oem) => isStrictOemMatch(oem, o.article))) {
          continue;
        }
        if (o.price == null || o.price <= 0) continue;
        const cur = (o.currency || "MDL").toUpperCase();
        if (cur !== "MDL" && cur !== "L" && cur !== "LEI" && cur !== "EUR") continue;
        const k = `${o.supplier}|${artN}|${o.price}|${(o.name || "").slice(0, 40)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        // Label: aftermarket kit listed under OEM number is still "exact OEM search hit"
        // but not "KIA original box" — show brand in UI via offer.brand
        exactOffers.push(
          toExactRanked(
            {
              ...o,
              article: pick.find((oem) => isStrictOemMatch(oem, o.article)) || o.article,
              isAnalog: false,
            },
            code
          )
        );
      }
    }
  }

  exactOffers.sort((a, b) => {
    const ap = a.price != null && a.price > 0 ? 0 : 1;
    const bp = b.price != null && b.price > 0 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const st =
      (a.stock === "in_stock" ? 0 : 1) - (b.stock === "in_stock" ? 0 : 1);
    if (st !== 0) return st;
    return (a.price ?? 1e12) - (b.price ?? 1e12);
  });

  const priced = exactOffers.filter((o) => o.price != null && o.price > 0);
  const bestPrice = priced.length ? Math.min(...priced.map((o) => o.price!)) : null;
  const best = priced.find((o) => o.price === bestPrice);
  const suppliersWith = new Set(exactOffers.map((o) => o.supplier));

  const oemLabel = oemList
    .map((p) => `${p.article} — ${p.name}`)
    .slice(0, 5)
    .join("; ");

  return {
    vehiclePath,
    vehicleName: options?.vehicleName,
    partType,
    sourceUrl,
    articles: pick,
    oemParts: oemList.map((p) => ({
      article: p.article,
      name: p.name,
      unitTitle: p.unitTitle,
    })),
    vehicleOffers: [],
    offers: exactOffers.slice(0, 100),
    bestPrice,
    bestSupplier: best?.supplier ?? null,
    inStockCount: exactOffers.filter((o) => o.stock === "in_stock" || o.stock === "order").length,
    suppliersOk: suppliersWith.size,
    suppliersTotal: supplierIds.length,
    tookMs: Date.now() - started,
    explanation:
      `OEM с завода (elcats/catcar): ${oemLabel}. ` +
      (exactOffers.length
        ? `В MD-магазинах показаны ТОЛЬКО точные совпадения этих кодов (${exactOffers.length} поз., ${suppliersWith.size} пост.). Аналоги/чужой кросс отключены.`
        : `Точный OEM-код есть, но открытые MD-магазины не отдали цену по этому номеру (часто нужен B2B-логин). Код скопируйте и ищите вручную / в KoreaAuto.`),
  };
}

function emptyCompare(
  vehiclePath: string,
  partType: ServicePartType,
  started: number,
  msg: string
): VinPartsCompareResponse {
  return {
    vehiclePath,
    partType,
    articles: [],
    oemParts: [],
    vehicleOffers: [],
    offers: [],
    bestPrice: null,
    bestSupplier: null,
    inStockCount: 0,
    suppliersOk: 0,
    suppliersTotal: 0,
    tookMs: Date.now() - started,
    explanation: msg,
  };
}

export type { ServiceGroup, ServicePartType, VehicleModification, VehicleCatalogNode };
