/**
 * ENORM / APS open TecDoc-style vehicle catalog.
 * Base: /products_by_car/{brand}/{model-slug}/category_{id}/
 */

import * as cheerio from "cheerio";
import { fetchText } from "../http";
import { parseApsPlatform } from "../parse/html-products";
import { parsePrice } from "../normalize";
import type { PartOffer } from "../types";
import { makeToEnormSlug, SERVICE_GROUPS, type ServiceGroup, type ServicePartType } from "./tecdoc-groups";

const ENORM = "https://www.enorm.md";
const APS = "https://www.aps.md";

export interface VehicleModification {
  id: string; // slug e.g. logan-ls-19773
  brandSlug: string;
  name: string; // "DACIA LOGAN (LS_) 1.5 dCi"
  path: string; // /products_by_car/dacia/logan-ls-19773/
  yearHint?: string;
  /** OEM EPC deep-link (catcar.info) for exact VIN unit */
  oemCatalogUrl?: string;
  engine?: string;
  source?: "enorm" | "catcar" | "elcats" | "manual";
}

export interface VehicleCatalogNode {
  id: number;
  name: string;
  path?: string; // leaf category path
  children?: VehicleCatalogNode[];
}

function abs(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function getHtml(url: string): Promise<string | null> {
  const res = await fetchText({
    url,
    timeoutMs: 20000,
    retries: 1,
    headers: { Referer: ENORM + "/" },
  });
  if (!res.ok || res.blocked) return null;
  return res.text;
}

/** Parse all modification slugs for a brand from ENORM brand page */
export async function listAllBrandModifications(make: string): Promise<VehicleModification[]> {
  const brandSlug = makeToEnormSlug(make);
  if (!brandSlug) return [];

  const listUrl = `${ENORM}/products_by_car/${brandSlug}/`;
  const html = await getHtml(listUrl);
  if (!html) return [];

  const re = new RegExp(`href="(/products_by_car/${brandSlug}/([a-z0-9\\-]+)/)"`, "gi");
  const seen = new Set<string>();
  const all: VehicleModification[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1]!;
    const id = m[2]!;
    if (seen.has(id) || id.includes("COMMON_URL") || id.length < 3) continue;
    if (!/^[a-z0-9\-]+$/i.test(id)) continue;
    seen.add(id);
    // Human label from slug: ceed-hatchback-ed-19775 → CEED hatchback ed
    const label = id
      .replace(/-\d+$/, "")
      .replace(/-/g, " ")
      .replace(/\b([a-z])/g, (c) => c.toUpperCase());
    all.push({ id, brandSlug, name: label, path });
  }
  return all;
}

/**
 * List model modifications for brand matching VIN model + year.
 * If model is empty (typical for non-US VIN via WMI-only decode), returns
 * unique model families so the user can pick (Ceed, Rio, Sportage…).
 */
export async function listModifications(
  make: string,
  model: string,
  year?: string
): Promise<VehicleModification[]> {
  const all = await listAllBrandModifications(make);
  if (!all.length) return [];

  const modelKey = (model || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
  const modelTokens = (model || "")
    .toLowerCase()
    .split(/[\s\-/]+/)
    .filter((t) => t.length >= 2);

  // No model from VIN (WMI-only, typical for MD/EU cars):
  // return all engines sorted — user filters by "ceed", "rio", "1.6" in UI.
  if (!modelTokens.length) {
    return all
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 250);
  }

  // score by model name match
  const scored = all
    .map((mod) => {
      const slug = mod.id.toLowerCase();
      let score = 0;
      if (modelKey && slug.includes(modelKey)) score += 50;
      for (const t of modelTokens) {
        if (slug.includes(t)) score += 15;
      }
      if (year && slug.includes(year)) score += 10;
      if (/\b(ii|iii|iv|v|vi|vii|viii|x|nj|ls|sd|ed|jd|jd)\b/i.test(slug)) score += 2;
      return { mod, score };
    })
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score);

  const top = (scored.length ? scored : all.map((mod) => ({ mod, score: 0 })))
    .slice(0, 60)
    .map((x) => x.mod);

  // hydrate titles for top candidates (readable engine names)
  await Promise.all(
    top.slice(0, 15).map(async (mod) => {
      const page = await getHtml(ENORM + mod.path);
      if (!page) return;
      const h1 = page.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
      if (h1) {
        mod.name = h1.replace(/^Подбор запчастей для\s+/i, "").trim();
      }
    })
  );

  return top;
}

/** Root assembly groups for a vehicle (from productstree) */
export async function loadVehicleRootCategories(vehiclePath: string): Promise<VehicleCatalogNode[]> {
  const html = await getHtml(ENORM + vehiclePath);
  if (!html) {
    // fallback static TecDoc-like groups
    return SERVICE_GROUPS.filter((g) => g.enormId).map((g) => ({
      id: g.enormId!,
      name: g.nameRu,
    }));
  }

  const nodes: VehicleCatalogNode[] = [];
  const re = /id="cat_(\d+)"[\s\S]{0,400}?class="name"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{2,60})/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = re.exec(html))) {
    const id = Number(m[1]);
    const name = m[2]!.trim();
    if (!id || seen.has(id) || name.length < 2) continue;
    seen.add(id);
    nodes.push({ id, name });
  }

  if (!nodes.length) {
    return SERVICE_GROUPS.filter((g) => g.enormId).map((g) => ({
      id: g.enormId!,
      name: g.nameRu,
    }));
  }
  return nodes;
}

/** Children of a category via AJAX inner list */
export async function loadCategoryChildren(
  vehiclePath: string,
  categoryId: number
): Promise<VehicleCatalogNode[]> {
  const url = `${ENORM}${vehiclePath}?category=${categoryId}&listtype=inner&script=yes`;
  const html = await getHtml(url);
  if (!html) return [];

  const nodes: VehicleCatalogNode[] = [];
  // leaf links: /products_by_car/.../category_478/
  const linkRe = /href="([^"]*category_(\d+)\/)"[^>]*>([^<]+)/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = linkRe.exec(html))) {
    const id = Number(m[2]);
    const name = m[3]!.trim();
    const path = m[1]!.startsWith("http") ? new URL(m[1]!).pathname : m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, name, path });
  }

  // non-leaf cat_ ids without path yet
  if (!nodes.length) {
    const re = /id="cat_(\d+)"[\s\S]{0,350}?>([А-Яа-яA-Za-z0-9 /.\-]{2,50})</gi;
    while ((m = re.exec(html))) {
      const id = Number(m[1]);
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push({ id, name: m[2]!.trim() });
    }
  }

  return nodes;
}

/** Products for vehicle + leaf category (with prices from ENORM) */
export async function loadVehicleCategoryProducts(
  vehiclePath: string,
  categoryId: number
): Promise<{ offers: PartOffer[]; pageUrl: string }> {
  const path = vehiclePath.endsWith("/") ? vehiclePath : vehiclePath + "/";
  const pageUrl = `${ENORM}${path}category_${categoryId}/`;
  const html = await getHtml(pageUrl);
  if (!html) return { offers: [], pageUrl };

  const offers = parseApsPlatform(html, {
    supplier: "enorm",
    supplierName: "ENORM",
    baseUrl: ENORM,
    article: "",
    currency: "MDL",
  });

  // If parse missed, regex harvest
  if (offers.length < 3) {
    const $ = cheerio.load(html);
    $("table.productslist tr").each((_, el) => {
      const row = $(el);
      const price = parsePrice(row.find(".priceroz").text());
      if (!price || price <= 0) return;
      const brand = row.find("td.supplier .supplier").first().text().trim() || "—";
      const art = row.find("td.code a").first().text().trim();
      const name = row.find("td.name .name a").first().text().trim() || art;
      const href = row.attr("data-href") || row.find("a").attr("href");
      offers.push({
        supplier: "enorm",
        supplierName: "ENORM",
        brand,
        article: art,
        name,
        price,
        currency: "MDL",
        stock: /✔/.test(row.find(".quantity").text()) ? "in_stock" : "unknown",
        url: href ? abs(ENORM, href) : pageUrl,
      });
    });
  }

  return { offers, pageUrl };
}

/** Resolve service part type → ENORM category products for vehicle */
export async function loadPartsForServiceType(
  vehiclePath: string,
  partType: ServicePartType
): Promise<{ offers: PartOffer[]; pageUrl: string; categoryId?: number }> {
  if (partType.enormId) {
    // Prefer leaf category URL
    const leaf = await loadVehicleCategoryProducts(vehiclePath, partType.enormId);
    if (leaf.offers.length) return { ...leaf, categoryId: partType.enormId };

    // Maybe it's a parent — load children and pick matching name
    const children = await loadCategoryChildren(vehiclePath, partType.enormId);
    const match =
      children.find((c) => c.name.toLowerCase().includes(partType.nameRu.toLowerCase().slice(0, 6))) ||
      children[0];
    if (match) {
      const r = await loadVehicleCategoryProducts(vehiclePath, match.id);
      return { ...r, categoryId: match.id };
    }
  }

  // Parent group id from SERVICE_GROUPS
  const parent = SERVICE_GROUPS.find((g) => g.children.some((c) => c.id === partType.id));
  if (parent?.enormId) {
    const children = await loadCategoryChildren(vehiclePath, parent.enormId);
    const match = children.find(
      (c) =>
        c.name.toLowerCase().includes(partType.nameRu.toLowerCase().slice(0, 5)) ||
        partType.nameRu.toLowerCase().includes(c.name.toLowerCase().slice(0, 5))
    );
    if (match) {
      const r = await loadVehicleCategoryProducts(vehiclePath, match.id);
      return { ...r, categoryId: match.id };
    }
  }

  return { offers: [], pageUrl: ENORM + vehiclePath };
}

/** Also try APS same paths (shared CMS) */
export async function loadVehicleCategoryProductsAps(
  vehiclePath: string,
  categoryId: number
): Promise<PartOffer[]> {
  const path = vehiclePath.endsWith("/") ? vehiclePath : vehiclePath + "/";
  const pageUrl = `${APS}${path}category_${categoryId}/`;
  const html = await getHtml(pageUrl);
  if (!html) return [];
  return parseApsPlatform(html, {
    supplier: "aps",
    supplierName: "APS",
    baseUrl: APS,
    article: "",
    currency: "MDL",
  });
}

export { ENORM, APS };
