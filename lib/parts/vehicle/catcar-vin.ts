/**
 * Free OEM VIN decoder via catcar.info (original EPC catalogs online).
 *
 * Why: chassi/NHTSA/open-data only guess make/model. Catcar resolves the
 * factory vehicle card — production date, body, engine, gearbox, region —
 * and a deep-link into the brand OEM catalog (same class of data as 7zap /
 * LastVIN datacards, multi-brand, free HTML form).
 *
 * Flow for workshops:
 *   VIN → catcar variants (exact mod/engine) → pick unit → OEM part codes
 *   → MD price/stock comparator.
 *
 * Endpoint pattern (public GET, no API key):
 *   https://www.catcar.info/{brand}/?vin={VIN}
 *
 * Brands under /{slug}/ with VIN form: kia, hyundai, mercedes, bmw, toyota,
 * nissan, honda, ford, opel, renault, peugeot, citroen, mazda, mitsubishi,
 * suzuki, subaru, volvo, jaguar, chrysler, isuzu, ssangyong
 * VAG group: /audivw/ (Audi / VW / Seat / Skoda)
 */

import { fetchText } from "../http";
import { normalizeVin, isValidVin } from "../normalize";

const CATCAR = "https://www.catcar.info";

/** WMI (pos 1–3) → catcar brand path segment */
const WMI_TO_CATCAR: Record<string, string> = {
  // Kia
  KNA: "kia", KNB: "kia", KNC: "kia", KND: "kia", KNE: "kia", KNF: "kia", KNJ: "kia",
  U5Y: "kia", U6Y: "kia", XWE: "kia", "3KP": "kia", "5XX": "kia", "5XY": "kia",
  // Hyundai
  KMH: "hyundai", KM8: "hyundai", KMF: "hyundai", KMC: "hyundai", TMA: "hyundai",
  Z94: "hyundai", "5NM": "hyundai", "5NP": "hyundai",
  // Mercedes
  WDB: "mercedes", WDD: "mercedes", WDC: "mercedes", WDF: "mercedes",
  W1K: "mercedes", W1N: "mercedes", W1V: "mercedes", WMX: "mercedes",
  "4JG": "mercedes", "55S": "mercedes",
  // BMW / Mini / RR via bmw catalog
  WBA: "bmw", WBS: "bmw", WBY: "bmw", WMW: "bmw",
  // Toyota / Lexus
  JTD: "toyota", JTE: "toyota", JTN: "toyota", JT2: "toyota", JT3: "toyota",
  JT4: "toyota", JT6: "toyota", JT8: "toyota", SB1: "toyota",
  // Honda
  JHM: "honda", JH4: "honda", "1HG": "honda", "2HG": "honda", SHH: "honda",
  // Nissan
  JN1: "nissan", JN6: "nissan", JN8: "nissan", SJN: "nissan", VSK: "nissan",
  // Mazda
  JM1: "mazda", JMZ: "mazda", JM3: "mazda",
  // Mitsubishi
  JA3: "mitsubishi", JA4: "mitsubishi", JMB: "mitsubishi",
  // Suzuki
  JS1: "suzuki", JS2: "suzuki", JS3: "suzuki", TSM: "suzuki",
  // Subaru
  JF1: "subaru", JF2: "subaru",
  // Volvo
  YV1: "volvo", YV4: "volvo",
  // Jaguar / Land Rover (LR often under jaguar path or separate)
  SAJ: "jaguar",
  // French
  VF1: "renault", VF2: "renault",
  VF3: "peugeot",
  VF7: "citroen",
  // Opel / Ford
  W0L: "opel", W0V: "opel",
  WF0: "ford", SFA: "ford", "1FA": "ford", "1FT": "ford", "1FM": "ford",
  // Chrysler
  "1C3": "chrysler", "1C4": "chrysler", "1J4": "chrysler",
  // VAG
  WVW: "audivw", WVG: "audivw", WV1: "audivw", WV2: "audivw", "3VW": "audivw",
  WAU: "audivw", WUA: "audivw", TRU: "audivw", WA1: "audivw",
  TMB: "audivw", TM9: "audivw", VSS: "audivw",
  // Isuzu / SsangYong
  JAA: "isuzu", KPT: "ssangyong",
};

/** Make name → catcar slug (when WMI missing but make known) */
const MAKE_TO_CATCAR: Record<string, string> = {
  KIA: "kia",
  HYUNDAI: "hyundai",
  "MERCEDES-BENZ": "mercedes",
  MERCEDES: "mercedes",
  BMW: "bmw",
  MINI: "bmw",
  TOYOTA: "toyota",
  LEXUS: "toyota",
  HONDA: "honda",
  NISSAN: "nissan",
  MAZDA: "mazda",
  MITSUBISHI: "mitsubishi",
  SUZUKI: "suzuki",
  SUBARU: "subaru",
  VOLVO: "volvo",
  JAGUAR: "jaguar",
  RENAULT: "renault",
  PEUGEOT: "peugeot",
  CITROEN: "citroen",
  OPEL: "opel",
  FORD: "ford",
  CHRYSLER: "chrysler",
  JEEP: "chrysler",
  DODGE: "chrysler",
  VOLKSWAGEN: "audivw",
  VW: "audivw",
  AUDI: "audivw",
  SKODA: "audivw",
  SEAT: "audivw",
  ISUZU: "isuzu",
  SSANGYONG: "ssangyong",
};

const CATCAR_MAKE_LABEL: Record<string, string> = {
  kia: "KIA",
  hyundai: "HYUNDAI",
  mercedes: "MERCEDES-BENZ",
  bmw: "BMW",
  toyota: "TOYOTA",
  honda: "HONDA",
  nissan: "NISSAN",
  mazda: "MAZDA",
  mitsubishi: "MITSUBISHI",
  suzuki: "SUZUKI",
  subaru: "SUBARU",
  volvo: "VOLVO",
  jaguar: "JAGUAR",
  renault: "RENAULT",
  peugeot: "PEUGEOT",
  citroen: "CITROEN",
  opel: "OPEL",
  ford: "FORD",
  chrysler: "CHRYSLER",
  audivw: "VOLKSWAGEN",
  isuzu: "ISUZU",
  ssangyong: "SSANGYONG",
};

export interface CatcarVariant {
  id: string;
  /** Human label for UI / ENORM matching */
  name: string;
  model?: string;
  productionDate?: string;
  modelYear?: string;
  body?: string;
  engine?: string;
  displacement?: string;
  fuel?: string;
  transmission?: string;
  drive?: string;
  /** Deep link into OEM catalog for this exact car */
  catalogUrl: string;
  /** All table columns as-is (brand-specific) */
  fields: Record<string, string>;
}

export interface CatcarVinResult {
  vin: string;
  brandSlug: string;
  make: string;
  variants: CatcarVariant[];
  sourceUrl: string;
  tookMs: number;
  error?: string;
}

export function catcarBrandFromWmi(wmi: string): string | undefined {
  return WMI_TO_CATCAR[wmi.toUpperCase()];
}

export function catcarBrandFromMake(make: string): string | undefined {
  return MAKE_TO_CATCAR[make.toUpperCase().trim()];
}

function absUrl(href: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${CATCAR}${href}`;
  return `${CATCAR}/${href}`;
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function yearFromDate(date?: string): string | undefined {
  if (!date) return undefined;
  // 11.07.2007 or 2007-07-11 or 04/2017
  const m1 = date.match(/(19|20)\d{2}/);
  return m1 ? m1[0] : undefined;
}

function pickField(fields: Record<string, string>, ...keys: string[]): string | undefined {
  const entries = Object.entries(fields);
  for (const key of keys) {
    const k = key.toLowerCase();
    for (const [fk, fv] of entries) {
      if (fk.toLowerCase().includes(k) && fv) return fv;
    }
  }
  return undefined;
}

function parseResultTable(html: string, brandSlug: string): CatcarVariant[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];

  let headers: string[] = [];
  const variants: CatcarVariant[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowHtml = rows[i]![1]!;
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1]!)
    );
    if (!cells.length) continue;

    // Header row
    if (
      i === 0 ||
      cells.some((c) =>
        /линейка|модель|каталог|серия|тип|дата|двигат|кузов|модифик/i.test(c)
      )
    ) {
      // Prefer th-like first data-less header
      if (cells.every((c) => c.length < 60) && cells.some((c) => /линейка|модель|дата|двигат|серия|тип/i.test(c))) {
        headers = cells;
        continue;
      }
    }

    if (!headers.length) continue;
    if (cells.length < 2) continue;

    const fields: Record<string, string> = {};
    for (let c = 0; c < Math.min(headers.length, cells.length); c++) {
      const h = headers[c]!;
      const v = cells[c]!;
      if (h && v && !/^дополнительн/i.test(h)) fields[h] = v;
    }

    // Catalog link from first cell or any cell with ?l=
    let catalogUrl = "";
    const linkMatch = rowHtml.match(/href=["']([^"']*[?&]l=[^"']+)["']/i);
    if (linkMatch) catalogUrl = absUrl(linkMatch[1]!);
    if (!catalogUrl) {
      // try info button in last cell
      const info = rowHtml.match(/href=["']([^"']*index\.php[^"']+)["']/i);
      if (info) catalogUrl = absUrl(info[1]!);
    }
    if (!catalogUrl) catalogUrl = `${CATCAR}/${brandSlug}/`;

    const model =
      pickField(fields, "линейка", "модель авто", "модель", "серия") ||
      cells[0];
    const productionDate = pickField(
      fields,
      "дата выпуска",
      "дата производства",
      "дата"
    );
    const body = pickField(fields, "кузов", "класс");
    const engine =
      pickField(fields, "двигатель", "модификации") ||
      pickField(fields, "модификац");
    const displacement = pickField(fields, "рабочий объем", "объем");
    const fuel = pickField(fields, "топливо");
    const transmission = pickField(fields, "акп", "коробка", "transmission");
    const drive = pickField(fields, "управления", "drive", "привод");

    // Mercedes style: model 204.241 + mod C 200 KOMPRESSOR
    const mbType = pickField(fields, "модель авто");
    const mbMod = pickField(fields, "модификации");
    const displayModel = mbMod && mbType ? `${mbMod} (${mbType})` : model;

    const nameParts = [
      displayModel,
      productionDate,
      displacement,
      engine && engine !== mbMod ? engine : undefined,
      body,
      fuel,
      transmission,
    ].filter(Boolean);

    const name = nameParts.join(" · ") || cells.filter(Boolean).join(" · ");
    const id = Buffer.from(`${brandSlug}|${name}|${catalogUrl}`)
      .toString("base64url")
      .slice(0, 48);

    variants.push({
      id,
      name,
      model: displayModel,
      productionDate,
      modelYear: yearFromDate(productionDate),
      body,
      engine: engine || displacement,
      displacement,
      fuel,
      transmission,
      drive,
      catalogUrl,
      fields,
    });
  }

  // Dedup by name
  const seen = new Set<string>();
  return variants.filter((v) => {
    const k = v.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Decode VIN via catcar OEM catalog (best free multi-brand source we found).
 * Tries WMI-mapped brand first; optional fallback brands if empty.
 */
export async function decodeVinCatcar(
  vinRaw: string,
  opts?: { makeHint?: string; brandSlug?: string }
): Promise<CatcarVinResult> {
  const started = Date.now();
  const vin = normalizeVin(vinRaw);
  if (!isValidVin(vin)) {
    return {
      vin,
      brandSlug: "",
      make: "",
      variants: [],
      sourceUrl: "",
      tookMs: Date.now() - started,
      error: "VIN должен содержать 17 символов",
    };
  }

  const wmi = vin.slice(0, 3);
  const primary =
    opts?.brandSlug ||
    catcarBrandFromWmi(wmi) ||
    (opts?.makeHint ? catcarBrandFromMake(opts.makeHint) : undefined);

  if (!primary) {
    return {
      vin,
      brandSlug: "",
      make: "",
      variants: [],
      sourceUrl: "",
      tookMs: Date.now() - started,
      error: `Нет OEM-каталога catcar для WMI «${wmi}»`,
    };
  }

  const brandsToTry = [primary];
  // Soft fallbacks for confused WMI (e.g. Hyundai/Kia cousins)
  if (primary === "kia") brandsToTry.push("hyundai");
  if (primary === "hyundai") brandsToTry.push("kia");

  for (const brandSlug of brandsToTry) {
    const sourceUrl = `${CATCAR}/${brandSlug}/?vin=${encodeURIComponent(vin)}`;
    try {
      const res = await fetchText({
        url: sourceUrl,
        timeoutMs: 22000,
        retries: 1,
        headers: {
          Referer: `${CATCAR}/${brandSlug}/`,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
      });
      if (!res.ok || res.blocked || !res.text) continue;

      const variants = parseResultTable(res.text, brandSlug);
      if (!variants.length) continue;

      return {
        vin,
        brandSlug,
        make: CATCAR_MAKE_LABEL[brandSlug] || brandSlug.toUpperCase(),
        variants,
        sourceUrl,
        tookMs: Date.now() - started,
      };
    } catch {
      /* try next brand */
    }
  }

  return {
    vin,
    brandSlug: primary,
    make: CATCAR_MAKE_LABEL[primary] || primary.toUpperCase(),
    variants: [],
    sourceUrl: `${CATCAR}/${primary}/?vin=${encodeURIComponent(vin)}`,
    tookMs: Date.now() - started,
    error: "OEM-каталог не вернул модификацию по VIN (сайт/сеть/лимит)",
  };
}
