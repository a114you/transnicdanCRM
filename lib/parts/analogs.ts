/**
 * Trusted TecDoc-style analog extraction from MD supplier results.
 *
 * Rules (hard-learned from GDB199 mess):
 *  - Only platform-marked analog/cross rows (isAnalog), not whole ENORM page
 *  - Same product family as the query (pads ≠ thermostat ≠ shock boot)
 *  - Numeric-only codes that collide across catalogs (900007) need brand+family
 *  - Re-search results must match seed article AND family (not random SKU hits)
 */

import { isNonAutoJunkName, isLikelyGeneralistJunk, textContainsArticle } from "./match";
import { normalizeArticle } from "./normalize";
import { isJunkOem, isPlausibleOem } from "./oem-quality";
import {
  detectProductFamily,
  familiesSameCore,
  familyFromQueryCode,
  inferSearchFamily,
  offerMatchesSearchFamily,
  type ProductFamily,
} from "./product-family";
import type { PartOffer } from "./types";

/** Suppliers whose "analog" / cross rows are TecDoc-class */
export const TECDOC_CROSS_SOURCES = new Set([
  "proparts",
  "enorm",
  "aps",
  "autoresident",
  "autodoctor",
  "procar",
  "automall",
  "allpiese",
  "daac",
  // nipon/korea often return multi-SKU noise for short codes — seed only if family OK
  "koreaauto",
]);

const TECDOC_BRAND =
  /^(?:BOSCH|MANN(?:-FILTER)?|MAHLE|KNECHT|FILTRON|TRW|FEBI(?:\s*BILSTEIN)?|SACHS|KYB|NGK|DENSO|GATES|SKF|VALEO|HELLA|NISSENS|SNR|RUVILLE|CONTITECH|DAYCO|SWAG|HENGST|PURFLUX|BREMBO|TEXTAR|FERODO|JURID|DELPHI|ATE|JAPANPARTS|BLUE\s*PRINT|WIX|KOLBENSCHMIDT|MONROE|LEMF[OÖ]RDER|MOOG|INA|FAG|LUK|CONTINENTAL|PIERBURG|VICTOR\s*REINZ|ELRING|CORTECO|KAVO(?:\s*PARTS)?|ENERGY|ABE|SAMKO|ICER|FRENKIT|QUICK\s*BRAKE|DENCKERMANN|TOMEX|FOMAR|KRAFT|METELLI|LPR|LUCAS|HERTH\+?BUSS|MEYLE|STABILUS|OPTIMAL|NK|MAPCO|A\.?B\.?S\.?|ASAM|JAPKO|NIPPARTS|PARTS-?MALL|MOBIS|OEM|ORIGINAL)$/i;

export interface AnalogCandidate {
  article: string;
  brand: string;
  name: string;
  sourceSupplier: string;
  score: number;
  family: ProductFamily;
}

function brandLooksTrusted(brand: string, name: string): boolean {
  const b = (brand || "").trim().replace(/\s+/g, " ");
  if (b && b !== "—" && TECDOC_BRAND.test(b)) return true;
  if (TECDOC_BRAND.test(name || "")) return true;
  if (/^[A-Z][A-Z0-9+.\-]{1,18}$/i.test(b) && b.length >= 2 && b !== "—") {
    if (!/^\d+$/.test(b) && !/^(SET|KIT|THE|AND|NEW|OEM|НОМЕР)$/i.test(b)) return true;
  }
  return false;
}

function articleLooksLikePartCode(raw: string): boolean {
  const a = normalizeArticle(raw);
  if (!a || a.length < 4 || a.length > 28) return false;
  if (isJunkOem(a)) return false;
  if (!/\d/.test(a)) return false;
  if (/^\d{1,3}W\d{2}$/i.test(a)) return false;
  if (/^(DOT|ATF|G\d{2})/i.test(a) && a.length <= 6) return false;
  // Pure short numbers collide across catalogs (900007 = pads kit AND exhaust AND carpet)
  if (/^\d{4,7}$/.test(a) && a.length <= 7) {
    // allow only with strong brand later — mark as fragile
  }
  if (!isPlausibleOem(a) && !/^[A-Z]{1,6}\d/i.test(a) && !/^\d{5,}[A-Z0-9]*$/i.test(a)) {
    return false;
  }
  return true;
}

function isFragileNumericCode(raw: string): boolean {
  const a = normalizeArticle(raw);
  // Short pure-digit codes collide heavily (900007, 13017, 32122 is ok length 5 but still)
  return /^\d{4,8}$/.test(a);
}

/**
 * Score an offer as a cross/analog seed for re-search.
 * Requires isAnalog + same product family as search.
 */
export function scoreAnalogSeed(
  offer: PartOffer,
  query: string,
  expectedFamily: ProductFamily
): number {
  if (!offer || offer.isShell) return 0;
  const name = offer.name || "";
  if (isNonAutoJunkName(name) || isLikelyGeneralistJunk(name)) return 0;

  const q = normalizeArticle(query);
  const art = normalizeArticle(offer.article || "");
  if (!q || !art || art === q) return 0;
  if (!articleLooksLikePartCode(offer.article)) return 0;
  if (!TECDOC_CROSS_SOURCES.has(offer.supplier)) return 0;

  // HARD: only platform-marked analog/cross rows become expand seeds
  if (!offer.isAnalog) return 0;

  const fam = detectProductFamily(`${name} ${offer.brand || ""}`, offer.article);
  if (expectedFamily !== "unknown") {
    if (fam !== "unknown" && !familiesSameCore(fam, expectedFamily)) {
      // Allow pad fitting kits as seeds only if we want accessories — we don't for expand
      return 0;
    }
    // Name says "thermostat" while searching pads — kill
    if (fam !== "unknown" && fam !== expectedFamily) return 0;
  } else if (fam === "thermostat" || fam === "propshaft" || fam === "shock_boot") {
    // Without expected family, still drop classic false-cross types for letter+digit queries like GDB
    const qFam = familyFromQueryCode(query);
    if (qFam !== "unknown" && fam !== qFam) return 0;
  }

  let score = 40; // isAnalog base

  if (!brandLooksTrusted(offer.brand || "", name)) {
    if (!(offer.price != null && offer.price > 0)) return 0;
    score -= 15;
  } else {
    score += 25;
  }

  if (name.length >= 4) score += 5;
  if (textContainsArticle(name, offer.article)) score += 8;

  // Family match bonus
  if (expectedFamily !== "unknown" && fam === expectedFamily) score += 25;
  if (fam === "unknown" && expectedFamily !== "unknown") {
    // Fragile: no name signal — only keep strong brands + non-fragile articles
    if (isFragileNumericCode(offer.article)) score -= 35;
    else score -= 10;
  }

  if (offer.price != null && offer.price > 0) score += 12;
  if (offer.priceConfidence === "high") score += 5;

  // Prefer pad-like brands for brake queries etc. already handled by family

  // Numeric collision codes need higher bar
  if (isFragileNumericCode(offer.article)) {
    if (fam === "unknown") return 0;
    if (fam !== expectedFamily && expectedFamily !== "unknown") return 0;
    score -= 5;
  }

  // Drop pure accessories as expand seeds (FRENKIT 900007 fitting kit ≠ pad substitute)
  if (fam === "brake_accessories") return 0;
  if (fam === "shock_boot" || fam === "thermostat" || fam === "propshaft" || fam === "sensor" || fam === "bellow") {
    return 0;
  }
  // Name text hard rejects even if family parser missed
  if (/термостат|thermostat|пылезащит|пыльн|propshaft|кардан|коврик|выхлоп/i.test(name)) {
    if (expectedFamily === "brake_pads" || expectedFamily === "oil_filter" || /^GDB|^FDB|^OC/i.test(query)) {
      return 0;
    }
  }

  return score >= 55 ? score : 0;
}

export function extractTrustedAnalogs(
  offers: PartOffer[],
  query: string,
  options?: { max?: number }
): AnalogCandidate[] {
  const max = Math.max(1, Math.min(options?.max ?? 4, 6));
  const q = normalizeArticle(query);
  const expected = inferSearchFamily(query, offers);
  const byArticle = new Map<string, AnalogCandidate>();

  for (const o of offers) {
    const score = scoreAnalogSeed(o, query, expected);
    if (score <= 0) continue;
    const art = normalizeArticle(o.article);
    if (!art || art === q) continue;

    const fam = detectProductFamily(`${o.name || ""} ${o.brand || ""}`, o.article);
    const prev = byArticle.get(art);
    if (!prev || score > prev.score) {
      byArticle.set(art, {
        article: (o.article || art).trim(),
        brand: (o.brand || "—").trim(),
        name: (o.name || "").slice(0, 120),
        sourceSupplier: o.supplier,
        score,
        family: fam === "unknown" ? expected : fam,
      });
    }
  }

  return [...byArticle.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/**
 * After re-search of an analog code: keep only rows that are the same part line.
 * Rejects SACHS 900007 shock boot when seed was FRENKIT pad kit, etc.
 */
export function filterExpandBatch(
  offers: PartOffer[],
  seed: AnalogCandidate,
  originalQuery: string
): PartOffer[] {
  const seedArt = normalizeArticle(seed.article);
  const q = normalizeArticle(originalQuery);
  const expected = seed.family !== "unknown" ? seed.family : familyFromQueryCode(originalQuery);

  return offers.filter((o) => {
    if (o.isShell) return false;
    const art = normalizeArticle(o.article || "");
    if (!art || art === q) return false;
    // Article must match seed (allow separator differences)
    if (art !== seedArt) {
      // some shops prefix brand: SM-5SP190
      if (!art.endsWith(seedArt) && !seedArt.endsWith(art)) return false;
      if (Math.abs(art.length - seedArt.length) > 4) return false;
    }

    const fam = detectProductFamily(`${o.name || ""} ${o.brand || ""}`, o.article);
    if (expected !== "unknown") {
      if (fam !== "unknown" && !familiesSameCore(fam, expected)) return false;
      if (fam === "unknown" && isFragileNumericCode(o.article || "")) {
        // require brand close to seed brand for naked numeric
        const sb = normalizeArticle(seed.brand);
        const ob = normalizeArticle(o.brand || "");
        if (sb && ob && sb !== ob && !ob.includes(sb) && !sb.includes(ob)) return false;
      }
    }

    // Name must not clearly be wrong family
    if (!offerMatchesSearchFamily(o, expected) && fam !== "unknown") return false;

    // Prefer brand match for fragile codes
    if (isFragileNumericCode(seed.article)) {
      const sb = (seed.brand || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const ob = (o.brand || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (sb.length >= 2 && ob.length >= 2) {
        if (!ob.includes(sb.slice(0, 4)) && !sb.includes(ob.slice(0, 4))) {
          // different brand on numeric SKU = different part in another catalog
          if (fam !== expected) return false;
        }
      }
    }

    if (isNonAutoJunkName(o.name || "")) return false;
    return true;
  }).map((o) => ({
    ...o,
    isAnalog: true,
  }));
}

/** Tag primary-search offers that are true same-family analogs */
export function tagExpandedOffers(
  offers: PartOffer[],
  analogArticles: string[],
  originalQuery: string,
  expectedFamily?: ProductFamily
): PartOffer[] {
  const set = new Set(analogArticles.map((a) => normalizeArticle(a)));
  const q = normalizeArticle(originalQuery);
  const fam =
    expectedFamily && expectedFamily !== "unknown"
      ? expectedFamily
      : familyFromQueryCode(originalQuery);

  return offers.map((o) => {
    const art = normalizeArticle(o.article || "");
    if (!art || art === q) return o;
    if (set.has(art)) {
      if (fam !== "unknown" && !offerMatchesSearchFamily(o, fam)) {
        return o; // do not promote wrong family
      }
      return { ...o, isAnalog: true };
    }
    return o;
  });
}

/**
 * Final gate for cross rows in UI: same family as search.
 * Drops thermostats / boots / propshafts from GDB199 results.
 */
export function filterOffersBySearchFamily(
  offers: PartOffer[],
  query: string,
  options?: { allowRelated?: boolean }
): PartOffer[] {
  const q = normalizeArticle(query);
  const expected = inferSearchFamily(query, offers);
  const qFam = familyFromQueryCode(query);
  const target = expected !== "unknown" ? expected : qFam;

  // No strong family signal → keep everything (don't invent empty UI)
  if (target === "unknown") return offers;

  return offers.filter((o) => {
    const art = normalizeArticle(o.article || "");
    // exact code always kept
    if (art === q) return true;
    // near-exact suffix (OC90OF)
    if (art.startsWith(q) && art.length - q.length <= 4) return true;

    const fam = detectProductFamily(`${o.name || ""} ${o.brand || ""}`, o.article);
    if (fam === target) return true;
    if (familiesSameCore(fam, target)) return true;

    if (options?.allowRelated && fam === "brake_accessories" && target === "brake_pads") {
      return false;
    }

    if (fam === "unknown") {
      // Keep priced MD rows and marked analogs — empty family text is common
      if (o.price != null && o.price > 0) return true;
      if (o.isAnalog && !/термостат|пыльн|кардан|propshaft|thermostat/i.test(o.name || "")) {
        return true;
      }
      return false;
    }

    // Hard mismatch (pads → thermostat): drop
    return false;
  });
}

export { inferSearchFamily, type ProductFamily };
