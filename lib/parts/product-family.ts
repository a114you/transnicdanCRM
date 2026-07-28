/**
 * Product family (part type) — used to reject false TecDoc "crosses"
 * e.g. GDB199 (brake pads) must not pull thermostats / shock boots / propshafts
 * that only share a numeric SKU like 900007.
 */

import { normalizeArticle } from "./normalize";
import type { PartOffer } from "./types";

export type ProductFamily =
  | "brake_pads"
  | "brake_discs"
  | "brake_accessories"
  | "oil_filter"
  | "air_filter"
  | "cabin_filter"
  | "fuel_filter"
  | "thermostat"
  | "shock_boot"
  | "shock_absorber"
  | "propshaft"
  | "bellow"
  | "sensor"
  | "bearing"
  | "belt"
  | "wiper"
  | "lamp"
  | "unknown";

/** Families that may appear together as legitimate related lines (not price competitors) */
const RELATED: Partial<Record<ProductFamily, ProductFamily[]>> = {
  brake_pads: ["brake_accessories"],
  brake_accessories: ["brake_pads"],
};

const RULES: Array<{ family: ProductFamily; re: RegExp; weight: number }> = [
  // Specific first
  {
    family: "brake_accessories",
    // FRENKIT 900007 "Комплектующие, колодки…" — NOT a pad substitute
    // Note: JS \w is ASCII-only — use [а-яёa-z]* for Cyrillic tails
    re: /комплектующ[а-яёa-z]*[,\s]+(?:к\s*)?колод|комплектующ[а-яёa-z]*[,\s]+(?:дисков|тормоз)|fitting\s*kit|akcesori[a-z]*[^\n]{0,20}placu|accessory\s*(?:kit|set)[^\n]{0,12}pad|ремкомплект[а-яёa-z]*\s*колод|монтажн[а-яёa-z]*\s*комплект[а-яёa-z]*\s*колод|hardware\s*kit[^\n]{0,12}pad|set akcesori/i,
    weight: 45,
  },
  {
    family: "brake_pads",
    // "Комплект тормозных колодок, дисковый тормоз" — pad set (not only "колодк")
    re: /колодк|тормозн[а-яёa-z]*\s*колод|комплект[а-яёa-z]*\s*тормозн|placu[tț]e\s*fr|klock(?:ów|ow)?\s*hamul|brake\s*pads?|pastil(?:le|e)|set klock|frana\s*tarczowe|placute|set klocków|klocków hamul|дисков[а-яёa-z]*\s*тормоз/i,
    weight: 25,
  },
  {
    family: "brake_discs",
    re: /диск[а-яёa-z]*\s*тормоз|тормозн[а-яёa-z]*\s*диск|brake\s*disc|dis[ck]uri?\s*fr|rotor/i,
    weight: 25,
  },
  {
    family: "thermostat",
    re: /термостат|thermostat|calorstat|терморегулятор\s*охлажд/i,
    weight: 40,
  },
  {
    family: "shock_boot",
    re: /пыльн|пылезащит|protection\s*kit|dust\s*(?:cover|boot|kit)|отбойник|сервисн[а-яёa-z]*\s*комплект[а-яёa-z]*\s*аморт|буфер,?\s*амортиз|пыльник\s*аморт/i,
    weight: 40,
  },
  {
    family: "shock_absorber",
    re: /амортизатор(?!\s*сервис)|shock\s*absorber|gas\s*spring|стойк[а-яёa-z]*\s*аморт/i,
    weight: 25,
  },
  {
    family: "propshaft",
    re: /кардан|propshaft|drive\s*shaft|полуось|приводн[а-яёa-z]*\s*вал/i,
    weight: 40,
  },
  {
    family: "bellow",
    re: /пыльник(?!\s*аморт)|bellow|гофра\s*рулев|чехол\s*шарнир/i,
    weight: 30,
  },
  {
    family: "sensor",
    re: /датчик|sensor|абс\b|abs\s*sensor|частот[а-яёa-z]*\s*вращ/i,
    weight: 30,
  },
  {
    family: "oil_filter",
    re: /масл[а-яёa-z]*\s*фильтр|oil\s*filter|filtru\s*ulei|filtr\s*oleju/i,
    weight: 25,
  },
  {
    family: "air_filter",
    re: /воздушн[а-яёa-z]*\s*фильтр|air\s*filter|filtru\s*aer/i,
    weight: 25,
  },
  {
    family: "cabin_filter",
    re: /салонн[а-яёa-z]*\s*фильтр|cabin\s*filter|filtru\s*habitac|pollen/i,
    weight: 25,
  },
  {
    family: "fuel_filter",
    re: /топливн[а-яёa-z]*\s*фильтр|fuel\s*filter|filtru\s*combust/i,
    weight: 25,
  },
  {
    family: "bearing",
    re: /подшипник|bearing|ступиц/i,
    weight: 20,
  },
  {
    family: "belt",
    re: /ремень|belt|curea|ролик\s*натяж/i,
    weight: 20,
  },
  {
    family: "wiper",
    re: /дворник|wiper|стеклоочист|ștergător|stergator/i,
    weight: 20,
  },
  {
    family: "lamp",
    re: /ламп[аыу]|bulb|bec\b|фара(?!\s*противотум)/i,
    weight: 15,
  },
];

/** Article prefixes that strongly imply family (before name is known) */
const ARTICLE_HINTS: Array<{ family: ProductFamily; re: RegExp }> = [
  { family: "brake_pads", re: /^(?:GDB|FDB|LP|5SP|C1[A-Z]|0986|13\.0460|23115|571)/i },
  { family: "oil_filter", re: /^(?:OC|W\d|HU|OX|OP|CU|LF)/i },
  { family: "air_filter", re: /^(?:C\d{4,}|LX\d)/i },
  { family: "fuel_filter", re: /^(?:WK|KL)/i },
];

export function detectProductFamily(text: string, article?: string): ProductFamily {
  const blob = `${text || ""} ${article || ""}`;
  let best: ProductFamily = "unknown";
  let bestW = 0;
  for (const r of RULES) {
    if (r.re.test(blob) && r.weight > bestW) {
      best = r.family;
      bestW = r.weight;
    }
  }
  if (best !== "unknown") return best;

  const art = normalizeArticle(article || "");
  if (art) {
    for (const h of ARTICLE_HINTS) {
      if (h.re.test(art) || h.re.test(article || "")) return h.family;
    }
  }
  return "unknown";
}

export function familyFromQueryCode(query: string): ProductFamily {
  const q = (query || "").trim();
  for (const h of ARTICLE_HINTS) {
    if (h.re.test(q) || h.re.test(normalizeArticle(q))) return h.family;
  }
  // GDB199 style after normalize keeps letters
  const n = normalizeArticle(q);
  if (/^GDB|^FDB|^LP\d|^5SP/i.test(n)) return "brake_pads";
  if (/^OC\d|^W\d|^HU/i.test(n)) return "oil_filter";
  return "unknown";
}

export function familiesCompatible(a: ProductFamily, b: ProductFamily): boolean {
  if (a === "unknown" || b === "unknown") return false;
  if (a === b) return true;
  return RELATED[a]?.includes(b) === true;
}

/** Same main product line (accessories do NOT count as price-competing pads) */
export function familiesSameCore(a: ProductFamily, b: ProductFamily): boolean {
  if (a === "unknown" || b === "unknown") return false;
  return a === b;
}

/**
 * Infer expected family for a search:
 * 1) from exact article hits' names
 * 2) else from query code pattern
 */
export function inferSearchFamily(query: string, offers: PartOffer[]): ProductFamily {
  const q = normalizeArticle(query);
  const votes = new Map<ProductFamily, number>();

  for (const o of offers) {
    if (o.isShell) continue;
    const art = normalizeArticle(o.article || "");
    const isExact = art === q;
    const fam = detectProductFamily(`${o.name || ""} ${o.brand || ""}`, o.article);
    if (fam === "unknown") continue;
    const w = isExact ? 5 : o.isAnalog ? 2 : 1;
    votes.set(fam, (votes.get(fam) || 0) + w);
  }

  let best: ProductFamily = "unknown";
  let bestN = 0;
  for (const [f, n] of votes) {
    if (n > bestN) {
      best = f;
      bestN = n;
    }
  }
  if (best !== "unknown" && bestN >= 2) return best;
  if (best !== "unknown") return best;

  return familyFromQueryCode(query);
}

export function offerFamily(o: PartOffer): ProductFamily {
  return detectProductFamily(`${o.name || ""} ${o.brand || ""}`, o.article);
}

/**
 * True if this cross/analog offer belongs to the search product line.
 * unknown name → only allow if article strongly hints same family as expected.
 */
export function offerMatchesSearchFamily(
  offer: PartOffer,
  expected: ProductFamily
): boolean {
  if (expected === "unknown") return true; // cannot gate
  const fam = offerFamily(offer);
  if (fam === expected) return true;
  // accessories related to pads — keep but caller may demote for bestPrice
  if (familiesCompatible(fam, expected) && fam !== "unknown") return true;
  // If name has no signal, fall back to article prefix vs expected
  if (fam === "unknown") {
    const hinted = familyFromQueryCode(offer.article || "");
    return hinted === expected || hinted === "unknown";
  }
  return false;
}
