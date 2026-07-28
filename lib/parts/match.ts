import { normalizeArticle } from "./normalize";
import type { PartOffer } from "./types";

/**
 * Why OC90 returns different codes:
 * Suppliers use TecDoc/cross catalogs. Searching "OC90" (Knecht/Mahle oil filter)
 * also returns aftermarket analogs: FEBI 32122, FILTRON OP570/1, BOSCH … —
 * same application, different brand codes.
 *
 * matchType:
 *  - exact  — article equals query (ignoring spaces/dashes)
 *  - cross  — different code, same search hit / marked analog (legitimate substitute)
 *  - weak   — low text relevance (noise; HIDDEN from UI by default)
 */

export type MatchType = "exact" | "cross" | "weak";

export interface RankedOffer extends PartOffer {
  matchType: MatchType;
  matchScore: number; // higher = better
}

/**
 * Non-auto marketplace junk (PandaShop etc.): dolls, puzzles, desk lamps…
 * Better empty results than "exact OEM" = Avengers puzzle.
 */
export function isNonAutoJunkName(name: string): boolean {
  if (!name || name.length < 2) return false;
  return /(?:^|[^а-яa-z])(?:кукл|кукла|игрушк|пазл|puzzle|doll|barbie|avengers|trefl|lego|лего|мягк\w*\s*игруш|радиоуправл|chi\s*toys|honey\s*baby|fantasy\s*patrol|proxxon|настольн\w*\s*ламп|лампа\s*настольн|светильник\s*настольн|настольн\w*\s*светиль|игрушеч|конструктор\s|настольн\w*\s*игр|board\s*game|плюшев)/i.test(
    name
  );
}

/** Known auto-parts / TecDoc brands — boost trust for cross results */
const AUTO_BRAND_HINT =
  /(?:BOSCH|MANN|MAHLE|KNECHT|FILTRON|TRW|FEBI|SACHS|KYB|NGK|DENSO|GATES|SKF|VALEO|HELLA|NISSENS|SNR|RUVILLE|CONTITECH|DAYCO|SWAG|HENGST|PURFLUX|BREMBO|TEXTAR|FERODO|DELPHI|ATE|JAPANPARTS|BLUE\s*PRINT|WIX|KOLBENSCHMIDT|MONROE|LEMF[OÖ]RDER|MOOG|INA|FAG|LUK|CONTINENTAL|PIERBURG|VICTOR\s*REINZ|ELRING|CORTECO|FEBI\s*BILSTEIN|KAVO|ENERGY|ABE|SAMKO)/i;

/**
 * Does product text actually contain the searched code (full, not half "23000" of "43852-23000")?
 */
export function textContainsArticle(text: string, query: string): boolean {
  const q = normalizeArticle(query);
  if (q.length < 3) return false;
  const blob = (text || "").toUpperCase();
  const blobN = normalizeArticle(text || "");
  if (blobN === q || blobN.includes(q)) {
    // reject middle-substring only (82537OC900 for OC90) unless full equality / start
    if (blobN === q) return true;
    const idx = blobN.indexOf(q);
    if (idx === 0) return true;
    if (idx > 0 && /[^A-Z0-9]/.test(blobN[idx - 1] || "")) return true;
    // allow if original has separators around code
  }
  // Flexible: 43852-23000 / 43852 23000 / 4385223000 in original text
  const compact = q.replace(/[^A-Z0-9]/g, "");
  if (compact.length >= 6) {
    // require nearly full code with optional separators
    const parts = compact.match(/^(\d{5})(\d{5,})$/);
    if (parts) {
      const re = new RegExp(
        `${parts[1]}[\\s\\-./]*${parts[2]}`,
        "i"
      );
      if (re.test(blob)) return true;
    }
    const flex = compact.split("").join("[\\s\\-./]*");
    try {
      if (new RegExp(flex, "i").test(blob) && blobN.includes(compact.slice(0, Math.min(8, compact.length)))) {
        // full flexible match of entire code
        const onlyDigitsLetters = blob.replace(/[\s\-./]/g, "");
        if (onlyDigitsLetters.includes(compact)) return true;
      }
    } catch {
      /* ignore */
    }
  }
  // short aftermarket codes (OC90, GDB199)
  if (q.length <= 12 && /^[A-Z]{1,6}\d/i.test(q)) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${q.split("").join("[\\s\\-]*")}(?:[^A-Z0-9]|$)`, "i");
    if (re.test(blob.replace(/\s+/g, " "))) return true;
    if (blobN.includes(q)) {
      const idx = blobN.indexOf(q);
      if (idx === 0 || /[^A-Z0-9]/.test(blobN[idx - 1] || "")) return true;
    }
  }
  return false;
}

/** Shops with real TecDoc/cross catalogs — allowed to return different article codes */
const STRUCTURED_CROSS_SUPPLIERS = new Set([
  "proparts",
  "enorm",
  "procar",
  "autodoctor",
  "aps",
  "autoresident",
  "allpiese",
  "automall",
  "daac",
  "niponauto",
  "koreaauto",
  "aproteh",
]);

/**
 * Hard quality gate: drop marketplace toys / stamped-query garbage.
 * Prefer empty list over dolls as "exact OEM".
 */
/** Shell / "Открыть на Shop" placeholders — not real catalog rows */
export function isShellOffer(offer: PartOffer): boolean {
  if (offer.isShell) return true;
  if (offer.price != null && offer.price > 0) return false;
  const n = offer.name || "";
  return /^открыть\s+/i.test(n) || /open\s+.+\s+on\s+/i.test(n);
}

export function isOfferRelevant(offer: PartOffer, query: string): boolean {
  // Shell links are handled separately (shopLinks) — never exact/cross
  if (isShellOffer(offer)) return false;

  const name = offer.name || "";
  if (isNonAutoJunkName(name)) return false;

  const q = normalizeArticle(query);
  const art = normalizeArticle(offer.article || "");
  if (!q) return false;

  // Exact article match — always keep for MD auto shops (even without price / «см. на сайте»)
  if (art && art === q) {
    if (isNonAutoJunkName(name)) return false;
    if (isLikelyGeneralistJunk(name) && !STRUCTURED_CROSS_SUPPLIERS.has(offer.supplier)) {
      return false;
    }
    // AutoMall catalog rows: brand + article, price null, rawPriceText «см. на сайте»
    if (STRUCTURED_CROSS_SUPPLIERS.has(offer.supplier)) return true;
    // Stamped query on random marketplace: only drop non-catalog shops
    if (
      name.length > 3 &&
      !textContainsArticle(name, query) &&
      !AUTO_BRAND_HINT.test(name) &&
      !AUTO_BRAND_HINT.test(offer.brand || "") &&
      offer.price == null
    ) {
      return false;
    }
    return true;
  }

  if (isLikelyGeneralistJunk(name) && !textContainsArticle(name, query)) return false;

  // Near-exact suffix (OC90OF)
  if (
    art &&
    art.startsWith(q) &&
    art.length - q.length <= 4 &&
    /^[A-Z]*$/i.test(art.slice(q.length))
  ) {
    return !isNonAutoJunkName(name);
  }

  // Name contains full query (e.g. "zamiennik OC90") — keep
  if (textContainsArticle(`${name} ${offer.brand || ""}`, query)) return true;

  // Marked analog/cross tab row — still not automatic (family filter runs later)
  if (offer.isAnalog && !isNonAutoJunkName(name)) {
    if (
      STRUCTURED_CROSS_SUPPLIERS.has(offer.supplier) ||
      AUTO_BRAND_HINT.test(offer.brand || name)
    ) {
      // Reject obvious wrong product lines by name (pads search → thermostat)
      if (isClearlyWrongCrossName(name, query)) return false;
      return true;
    }
  }

  // Structured MD catalog: keep priced cross rows with real brand+article
  // (TecDoc substitutes often omit the query code in the title)
  if (STRUCTURED_CROSS_SUPPLIERS.has(offer.supplier)) {
    if (isNonAutoJunkName(name)) return false;
    if (isClearlyWrongCrossName(name, query)) return false;
    if (art && art.length >= 4 && art !== q) {
      if (textContainsArticle(`${name} ${offer.brand || ""}`, query)) return true;
      // Priced + auto brand + isAnalog-ish OR name looks like a filter/pad/part
      if (
        offer.price != null &&
        offer.price > 0 &&
        (offer.isAnalog ||
          AUTO_BRAND_HINT.test(offer.brand || "") ||
          AUTO_BRAND_HINT.test(name) ||
          /фильтр|filter|колод|pad|аморт|тормоз|масл|oil|рем|belt|подшип|bearing|сцепл|clutch|свеч|spark|насос|pump|датчик|sensor/i.test(
            name
          ))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Hard name-vs-query false crosses (GDB pads vs thermostat / shock boot / propshaft).
 * Lightweight; full family filter is in product-family.ts.
 */
function isClearlyWrongCrossName(name: string, query: string): boolean {
  const q = (query || "").toUpperCase();
  const n = name || "";
  const queryIsPads = /^GDB|^FDB|^LP\d|KOLÓD|KOLOD/i.test(q) || /GDB|FDB/i.test(q);
  const queryIsFilter = /^OC\d|^W\d{2,}|^HU|^OP\d|^WK/i.test(q.replace(/\s/g, ""));
  if (queryIsPads) {
    if (
      /термостат|thermostat|пыльн|пылезащит|protection\s*kit|кардан|propshaft|датчик(?!\s*износ)|sensor\s*abs|коврик|выхлоп|exhaust|рессор|bellow|отбойник|амортизатор(?!\s*колод)|труба\s*выхлоп|комплектующ|fitting\s*kit|akcesori|accessory\s*kit/i.test(
        n
      )
    ) {
      return true;
    }
  }
  if (queryIsFilter) {
    if (/тормозн\w*\s*колод|brake\s*pad|термостат|амортизатор|кардан/i.test(n)) return true;
  }
  return false;
}

/** Soft generalist products that aren't dolls but aren't car parts either */
export function isLikelyGeneralistJunk(name: string): boolean {
  return /(?:пазл|puzzle|кукл|игруш|настольн|ламп(?!а\s*(?:фар|габар|стоп|h[1-9]))|светильник|тв\s|телевизор|смартфон|ноутбук|планшет|пылесос|утюг|микроволн|кофевар|чайн|мебел|посуд|одежд|обув|косметик)/i.test(
    name
  );
}

export function classifyOffer(offer: PartOffer, query: string): RankedOffer {
  const q = normalizeArticle(query);
  const art = normalizeArticle(offer.article || "");
  const nameN = normalizeArticle(offer.name || "");

  if (isShellOffer(offer)) {
    return { ...offer, matchType: "weak", matchScore: 0, isShell: true };
  }

  // Hard reject path → weak (filtered out of API response)
  if (!isOfferRelevant(offer, query)) {
    return { ...offer, matchType: "weak", matchScore: 0 };
  }

  // No-price catalog rows (ENORM guest without priceroz) keep exact if article matches,
  // but never beat priced rows for bestPrice (handled in summarize).

  let matchType: MatchType = "cross";
  let matchScore = 50;

  // STRICT exact only: same article after normalize
  if (q && art && art === q) {
    // Extra guard: stamped query on unrelated title
    if (
      offer.name &&
      !textContainsArticle(offer.name, query) &&
      isLikelyGeneralistJunk(offer.name)
    ) {
      return { ...offer, matchType: "weak", matchScore: 1 };
    }
    matchType = "exact";
    matchScore = 100;
  } else if (
    q &&
    art &&
    art.startsWith(q) &&
    /^[A-Z]*$/i.test(art.slice(q.length)) &&
    art.length - q.length <= 3 &&
    art.length >= 4
  ) {
    matchType = "exact";
    matchScore = 93;
  } else if (q && art && q.startsWith(art) && art.length >= 5 && q.length - art.length <= 2) {
    matchType = "exact";
    matchScore = 90;
  } else if (offer.isAnalog && art && art !== q) {
    if (isClearlyWrongCrossName(offer.name || "", query)) {
      return { ...offer, matchType: "weak", matchScore: 5 };
    }
    // Platform analog tab / re-search of trusted cross codes
    matchType = "cross";
    matchScore = 78;
    if (AUTO_BRAND_HINT.test(offer.brand || "") || AUTO_BRAND_HINT.test(offer.name || "")) {
      matchScore += 8;
    }
  } else if (
    q &&
    art &&
    art !== q &&
    STRUCTURED_CROSS_SUPPLIERS.has(offer.supplier) &&
    textContainsArticle(offer.name || "", query)
  ) {
    matchType = "cross";
    matchScore = 62;
  } else if (q && nameN.includes(q)) {
    matchType = "cross";
    matchScore = 60;
  } else if (q && art && levenshteinRatio(art, q) > 0.85) {
    matchType = "cross";
    matchScore = 55;
  } else if (!offer.price) {
    matchType = "weak";
    matchScore = 15;
  } else {
    matchType = "weak";
    matchScore = 25;
  }

  if (offer.stock === "in_stock") matchScore += 5;
  if (offer.price != null && offer.price > 0) matchScore += 3;

  return { ...offer, matchType, matchScore };
}

export function rankAndClassify(offers: PartOffer[], query: string): RankedOffer[] {
  const ranked = offers.map((o) => classifyOffer(o, query)).filter((o) => o.matchType !== "weak");
  ranked.sort((a, b) => {
    const t = typeRank(a.matchType) - typeRank(b.matchType);
    if (t !== 0) return t;
    const ap = a.price != null && a.price > 0 ? 0 : 1;
    const bp = b.price != null && b.price > 0 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const sr = stockRank(a.stock) - stockRank(b.stock);
    if (sr !== 0) return sr;
    return (a.price ?? 1e12) - (b.price ?? 1e12);
  });
  return ranked;
}

function typeRank(t: MatchType) {
  return t === "exact" ? 0 : t === "cross" ? 1 : 2;
}

function stockRank(s: string) {
  return s === "in_stock" ? 0 : s === "order" ? 1 : s === "unknown" ? 2 : 3;
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const dist = dp[m]![n]!;
  return 1 - dist / Math.max(m, n);
}

/** Group offers for UI: exact block + cross block (weak never returned) */
export function groupByMatch(offers: RankedOffer[]) {
  return {
    exact: offers.filter((o) => o.matchType === "exact"),
    cross: offers.filter((o) => o.matchType === "cross"),
    weak: [] as RankedOffer[],
  };
}
