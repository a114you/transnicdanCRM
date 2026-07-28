/**
 * Elcats.ru OEM EPC — primary catalog for modern multi-brand VIN → groups → full factory P/Ns.
 *
 * Why not catcar: catcar cuts off ~2018 and often lacks usable part names.
 * Elcats (same family as exist.ru original catalogs) has:
 *  - modern models (SELTOS, EV6, K5, TELLURIDE, …)
 *  - real Russian/EN unit & part names
 *  - full OEM codes via ASP.NET callback (58101-2FA21, not short 58101B)
 *
 * Flow:
 *  VIN POST → Group.aspx?Model={guid}
 *  → unit list (ШАССИ / ДВИГАТЕЛЬ / …)
 *  → Unit.aspx → Parts.aspx
 *  → __CALLBACKPARAM={shortCode} → table with full article + name + applicability
 */

import { fetchText } from "../http";
import type { ServicePartType } from "./tecdoc-groups";

const ELCATS = "https://www.elcats.ru";
const UA_HEADERS = {
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
};

/** WMI → elcats brand path (brands hosted on elcats.ru, not japancats) */
const WMI_TO_ELCATS: Record<string, string> = {
  // Kia
  KNA: "kia", KNB: "kia", KNC: "kia", KND: "kia", KNE: "kia", KNF: "kia", KNJ: "kia",
  U5Y: "kia", U6Y: "kia", XWE: "kia", "3KP": "kia", "5XX": "kia", "5XY": "kia",
  // Hyundai
  KMH: "hyundai", KM8: "hyundai", KMF: "hyundai", KMC: "hyundai", TMA: "hyundai",
  Z94: "hyundai", "5NM": "hyundai", "5NP": "hyundai",
  // Mercedes
  WDB: "mercedes", WDD: "mercedes", WDC: "mercedes", WDF: "mercedes",
  W1K: "mercedes", W1N: "mercedes", W1V: "mercedes", WMX: "mercedes",
  "4JG": "mercedes",
  // BMW / Mini
  WBA: "bmw", WBS: "bmw", WBY: "bmw", WMW: "mini",
  // VAG
  WVW: "vw", WVG: "vw", WV1: "vw", WV2: "vw", "3VW": "vw",
  WAU: "audi", WUA: "audi", TRU: "audi", WA1: "audi",
  TMB: "skoda", VSS: "seat",
  // French
  VF1: "renault", VF2: "renault", VF3: "peugeot", VF7: "citroen",
  // Opel / Ford
  W0L: "opel", W0V: "opel",
  WF0: "ford", SFA: "ford", "1FA": "ford", "1FT": "ford", "1FM": "ford",
  // Volvo / Jaguar / LR
  YV1: "volvo", YV4: "volvo",
  SAJ: "jaguar", SAL: "landrover",
  // Chrysler group
  "1C3": "chrysler", "1C4": "chrysler", "1J4": "chrysler",
  // Others on elcats
  KPT: "ssangyong",
};

const MAKE_TO_ELCATS: Record<string, string> = {
  KIA: "kia",
  HYUNDAI: "hyundai",
  "MERCEDES-BENZ": "mercedes",
  MERCEDES: "mercedes",
  BMW: "bmw",
  MINI: "mini",
  VOLKSWAGEN: "vw",
  VW: "vw",
  AUDI: "audi",
  SKODA: "skoda",
  SEAT: "seat",
  RENAULT: "renault",
  PEUGEOT: "peugeot",
  CITROEN: "citroen",
  OPEL: "opel",
  FORD: "ford",
  VOLVO: "volvo",
  JAGUAR: "jaguar",
  "LAND ROVER": "landrover",
  CHRYSLER: "chrysler",
  JEEP: "chrysler",
  SSANGYONG: "ssangyong",
  PORSCHE: "porsche",
  FIAT: "fiat",
  ALFA: "alfaromeo",
  "ALFA ROMEO": "alfaromeo",
};

const BRAND_LABEL: Record<string, string> = {
  kia: "KIA",
  hyundai: "HYUNDAI",
  mercedes: "MERCEDES-BENZ",
  bmw: "BMW",
  mini: "MINI",
  vw: "VOLKSWAGEN",
  audi: "AUDI",
  skoda: "SKODA",
  seat: "SEAT",
  renault: "RENAULT",
  peugeot: "PEUGEOT",
  citroen: "CITROEN",
  opel: "OPEL",
  ford: "FORD",
  volvo: "VOLVO",
  jaguar: "JAGUAR",
  landrover: "LAND ROVER",
  chrysler: "CHRYSLER",
  ssangyong: "SSANGYONG",
  porsche: "PORSCHE",
  fiat: "FIAT",
  alfaromeo: "ALFA ROMEO",
};

export interface ElcatsVehicleInfo {
  model?: string;
  modelCode?: string;
  engine?: string;
  displacement?: string;
  productionDate?: string;
  modelYear?: string;
  region?: string;
  body?: string;
  transmission?: string;
  fuel?: string;
  rawFields: Record<string, string>;
}

export interface ElcatsVariant {
  id: string;
  name: string;
  brandSlug: string;
  make: string;
  modelGuid: string;
  groupUrl: string;
  catalogUrl: string;
  vin: string;
  info: ElcatsVehicleInfo;
  source: "elcats";
}

export interface ElcatsVinResult {
  vin: string;
  brandSlug: string;
  make: string;
  variants: ElcatsVariant[];
  sourceUrl: string;
  tookMs: number;
  error?: string;
}

export interface ElcatsGroupUnit {
  groupId: string;
  modelGuid: string;
  title: string;
  /** Root group index as string "0".."5" */
  rootId: string;
  rootTitle?: string;
  /** Exact elcats nav payload for this unit (never re-match by truncated id) */
  navNode?: {
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
  };
}

export interface ElcatsOemPart {
  article: string;
  name: string;
  qty?: string;
  dateFrom?: string;
  dateTo?: string;
  options?: string;
  unitTitle?: string;
  shortCode?: string;
  score: number;
}

export interface ElcatsOemPartsResult {
  catalogUrl: string;
  partTypeId: string;
  articles: string[];
  parts: ElcatsOemPart[];
  unitsScanned: string[];
  groups: Array<{ title: string; units: string[] }>;
  tookMs: number;
  error?: string;
}

export function elcatsBrandFromWmi(wmi: string): string | undefined {
  return WMI_TO_ELCATS[wmi.toUpperCase()];
}

export function elcatsBrandFromMake(make: string): string | undefined {
  return MAKE_TO_ELCATS[make.toUpperCase().trim()];
}

function brandHome(brand: string): string {
  return `${ELCATS}/${brand}/`;
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractFormFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input([^>]+)>/gi)) {
    const tag = m[1] || "";
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    if (!name) continue;
    const val = tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? "";
    out[name] = val;
  }
  return out;
}

function encodeForm(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function getHtml(url: string, referer?: string): Promise<{ ok: boolean; text: string; finalUrl: string }> {
  const res = await fetchText({
    url,
    timeoutMs: 28000,
    retries: 1,
    // curl TLS more reliable on elcats (ddos-guard + ASP.NET redirects)
    preferCurl: true,
    headers: {
      ...UA_HEADERS,
      Referer: referer || ELCATS + "/",
      "Accept-Encoding": "gzip, deflate",
    },
  });
  return {
    ok: !!(res.ok && res.text && !res.blocked && res.text.length > 400),
    text: res.text || "",
    finalUrl: res.finalUrl || url,
  };
}

async function postHtml(
  url: string,
  fields: Record<string, string>,
  referer?: string
): Promise<{ ok: boolean; text: string; finalUrl: string }> {
  const res = await fetchText({
    url,
    method: "POST",
    body: encodeForm(fields),
    timeoutMs: 30000,
    retries: 1,
    skipWarmup: true,
    preferCurl: true,
    headers: {
      ...UA_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ELCATS,
      Referer: referer || url,
      "Accept-Encoding": "gzip, deflate",
    },
  });
  return {
    ok: !!(res.ok && res.text && !res.blocked && res.text.length > 400),
    text: res.text || "",
    finalUrl: res.finalUrl || url,
  };
}

function parseVehicleInfo(html: string): ElcatsVehicleInfo {
  const rawFields: Record<string, string> = {};

  // Mercedes-style: header row (Модель | Дата | Двигатель…) then data row
  const headerRow = html.match(
    /<tr[^>]*>\s*<td[^>]*>\s*Модель\s*<\/td>[\s\S]*?<\/tr>/i
  )?.[0];
  if (headerRow) {
    const headers = [...headerRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]!).toLowerCase()
    );
    // next data row after header
    const after = html.slice(html.indexOf(headerRow) + headerRow.length);
    const dataRow = after.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1];
    if (dataRow) {
      const values = [...dataRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        stripTags(c[1]!).replace(/\s+/g, " ").trim()
      );
      for (let i = 0; i < headers.length && i < values.length; i++) {
        const h = headers[i]!;
        const v = values[i]!;
        if (!v || /посмотреть|закрыть/i.test(v)) continue;
        if (/модель|model/.test(h)) rawFields.model = v;
        else if (/дата|выпуск|date/.test(h)) rawFields.productionDate = v.match(/[\d./\-]{6,12}/)?.[0] || v;
        else if (/двигател|engine/.test(h)) rawFields.engine = v;
        else if (/трансмисс|кпп|transmission/.test(h)) rawFields.transmission = v;
        else if (/цвет|color/.test(h)) rawFields.region = v; // store color in region-ish slot for UI raw
        else if (/отделк|trim|интерьер/.test(h)) rawFields.body = v;
      }
    }
  }

  // Kia/Hyundai: label cell + value cell
  if (!rawFields.model) {
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1]!)
      );
      if (cells.length < 2) continue;
      const label = cells[0]!.toUpperCase().replace(/[:\s]+$/g, "").trim();
      const value = cells.slice(1).join(" ").trim();
      if (!label || !value || value.length > 200) continue;
      // skip header-only rows (Mercedes headers as "values" of previous empty)
      if (/^(МОДЕЛЬ|ДАТА|ДВИГАТЕЛЬ|ТРАНСМИССИЯ|КОД ЦВЕТА|КОД ОТДЕЛКИ|ОПЦИИ)$/i.test(value)) continue;
      if (/МОДЕЛЬ|MODEL/.test(label)) rawFields.model = value;
      else if (/^ДВИГАТЕЛЬ$|^ENGINE$/.test(label)) rawFields.engine = value;
      else if (/РАБОЧИЙ ОБЪЕМ|DISPLACEMENT|CC/.test(label)) rawFields.displacement = value;
      else if (/ДАТА|DATE|ПРОИЗВ/.test(label))
        rawFields.productionDate = value.match(/[\d./\-]{6,12}/)?.[0] || value;
      else if (/КУЗОВ|BODY/.test(label)) rawFields.body = value;
      else if (/КПП|ТРАНСМИСС|TRANSMISSION|АКП|МКП/.test(label)) rawFields.transmission = value;
      else if (/ТОПЛИВ|FUEL/.test(label)) rawFields.fuel = value;
      else if (/РЕГИОН|РЫНОК|REGION|MARKET/.test(label)) rawFields.region = value;
    }
  }

  if (!rawFields.model) {
    const infoBlock =
      html.match(/Информация об автомобиле[\s\S]{0,5000}/i)?.[0] || html.slice(0, 8000);
    // MB often: 218.303  CLS 250 CDI
    const mbModel = stripTags(infoBlock).match(
      /(\d{3}\.\d{3})\s+([A-Z0-9][A-Z0-9 /.\-]{2,40})/i
    );
    if (mbModel) rawFields.model = `${mbModel[1]} ${mbModel[2]}`.trim();
    const plain = stripTags(infoBlock.replace(/<\/t[dh]>/gi, "\n"));
    rawFields.productionDate ||= plain.match(/(\d{2}[./]\d{2}[./]\d{4})/)?.[1] || "";
  }

  let modelRaw = (rawFields.model || "").replace(/\s+/g, " ").trim();
  // "218.303 CLS 250 CDI / D" — keep full meaningful name, drop junk headers
  if (/дата\s*выпуск|двигатель|трансмисси|код\s*цвет/i.test(modelRaw)) {
    modelRaw = modelRaw.split(/дата\s*выпуск/i)[0]!.trim();
  }
  const modelClean = modelRaw.slice(0, 80).trim();
  // MB chassis code 218.303
  const codeM =
    modelRaw.match(/\[([A-Z0-9]+)\]/i) || modelRaw.match(/\b(\d{3}\.\d{3})\b/);
  const yearM =
    modelRaw.match(/\((20\d{2})/) ||
    rawFields.productionDate?.match(/(20\d{2})/) ||
    rawFields.productionDate?.match(/\/(20\d{2})/);

  return {
    model: modelClean || undefined,
    modelCode: codeM?.[1],
    engine: rawFields.engine?.slice(0, 50),
    displacement: rawFields.displacement?.slice(0, 30),
    productionDate: rawFields.productionDate,
    modelYear: yearM?.[1],
    region: rawFields.region?.slice(0, 60),
    body: rawFields.body?.slice(0, 60),
    transmission: rawFields.transmission?.slice(0, 40),
    fuel: rawFields.fuel?.slice(0, 30),
    rawFields,
  };
}

function isMercedesLayout(html: string): boolean {
  return (
    /submit\('[^']+','\d{2}',null,'/i.test(html) ||
    /SubGroup\.aspx/i.test(html) ||
    /tblComplectation/i.test(html)
  );
}

/** Parse units from Group.aspx — Kia (58-585) and Mercedes (42 + null) layouts */
export function parseElcatsUnits(html: string): ElcatsGroupUnit[] {
  const out: ElcatsGroupUnit[] = [];
  const seen = new Set<string>();

  // --- Kia/Hyundai: submit('58-585','modelGuid','TITLE (ROOT)','4')
  const rootTitles = new Map<string, string>();
  for (const m of html.matchAll(/ToggleNode\('(\d+)'\)[^>]*>([^<]+)/gi)) {
    rootTitles.set(m[1]!, stripTags(m[2]!));
  }
  const kiaRe =
    /submit\('([^']+)','([0-9a-f\-]{36})','([^']+)','(\d*)'\)/gi;
  let m: RegExpExecArray | null;
  while ((m = kiaRe.exec(html))) {
    const groupId = m[1]!;
    const modelGuid = m[2]!;
    const title = stripTags(m[3]!);
    const rootId = m[4] || "";
    if (!/^[0-9]{2}-[0-9A-Z]+$/i.test(groupId)) continue;
    const key = `${groupId}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      groupId,
      modelGuid,
      title,
      rootId,
      rootTitle: rootTitles.get(rootId),
    });
  }
  if (out.length) return out;

  // --- Mercedes: submit('modelGuid','42',null,'ТОРМОЗНАЯ СИСТЕМА')
  // Assign root by preceding <b>Section</b> headers
  const sections: Array<{ title: string; index: number }> = [];
  for (const sm of html.matchAll(/<b[^>]*>([^<]{2,40})<\/b>\s*<br\s*\/?>\s*<br/gi)) {
    const title = stripTags(sm[1]!);
    if (/информац|группа|запчаст/i.test(title)) continue;
    sections.push({ title, index: sm.index ?? 0 });
  }

  const mbRe = /submit\('([0-9a-f\-]{36})','(\d{2})',null,'([^']+)'\)/gi;
  while ((m = mbRe.exec(html))) {
    const modelGuid = m[1]!;
    const groupId = m[2]!;
    const title = stripTags(m[3]!);
    const pos = m.index ?? 0;
    let rootTitle = sections[0]?.title || "Каталог";
    let rootId = "0";
    for (let i = 0; i < sections.length; i++) {
      if (sections[i]!.index <= pos) {
        rootTitle = sections[i]!.title;
        rootId = String(i);
      }
    }
    const key = `${groupId}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ groupId, modelGuid, title, rootId, rootTitle });
  }

  // Engine SA nested on group page: submit('guid;model','01','1002','КАРТЕР…')
  const nestRe =
    /submit\('([0-9a-f\-]{36};[0-9a-f\-]{36})','(\d{2})','(\d+)','([^']+)'\)/gi;
  while ((m = nestRe.exec(html))) {
    const modelGuid = m[1]!;
    const groupId = `SA-${m[2]}-${m[3]}`;
    const title = stripTags(m[4]!);
    const key = `${groupId}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      groupId,
      modelGuid,
      title,
      rootId: "engine-sa",
      rootTitle: "Двигатель / агрегаты",
    });
  }

  return out;
}

/** Top-level groups for UI tree */
export function parseElcatsRootGroups(html: string): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = [];
  for (const m of html.matchAll(/ToggleNode\('(\d+)'\)[^>]*>([^<]+)/gi)) {
    out.push({ id: m[1]!, title: stripTags(m[2]!) });
  }
  if (out.length) return out;

  // Mercedes section headers: <b style="...">Шасси</b><br /><br />
  let i = 0;
  for (const m of html.matchAll(/<b[^>]*>([^<]{2,40})<\/b>\s*<br\s*\/?>\s*<br/gi)) {
    const title = stripTags(m[1]!);
    if (/информац|группа\s*запчаст/i.test(title)) continue;
    out.push({ id: String(i++), title });
  }
  if (!out.length && isMercedesLayout(html)) {
    out.push({ id: "0", title: "Каталог" });
  }
  // ensure engine-sa root if nested units exist
  if (/submit\('[0-9a-f\-]{36};[0-9a-f\-]{36}'/i.test(html)) {
    if (!out.some((r) => r.id === "engine-sa")) {
      out.push({ id: "engine-sa", title: "Двигатель / агрегаты" });
    }
  }
  return out;
}

/**
 * VIN → OEM vehicle card + Group.aspx catalog URL.
 * Brand-agnostic: delegates to elcats-engine (dynamic layout discovery).
 */
export async function decodeVinElcats(rawVin: string): Promise<ElcatsVinResult> {
  const { decodeVinUniversal } = await import("./elcats-engine");
  const u = await decodeVinUniversal(rawVin);
  if (u.error || !u.modelGuid) {
    return {
      vin: u.vin,
      brandSlug: u.brandSlug,
      make: u.make,
      variants: [],
      sourceUrl: u.groupUrl || ELCATS,
      tookMs: u.tookMs,
      error: u.error,
    };
  }
  const info: ElcatsVehicleInfo = {
    model: u.info.model,
    modelCode: u.info.modelCode,
    engine: u.info.engine,
    productionDate: u.info.productionDate,
    modelYear: u.info.modelYear,
    transmission: u.info.transmission,
    region: u.info.color,
    body: u.info.trim,
    rawFields: u.info.raw,
  };
  const variant: ElcatsVariant = {
    id: u.modelGuid,
    name: u.name,
    brandSlug: u.brandSlug,
    make: u.make,
    modelGuid: u.modelGuid,
    groupUrl: u.groupUrl,
    catalogUrl: u.groupUrl,
    vin: u.vin,
    info,
    source: "elcats",
  };
  return {
    vin: u.vin,
    brandSlug: u.brandSlug,
    make: u.make,
    variants: [variant],
    sourceUrl: u.groupUrl,
    tookMs: u.tookMs,
  };
}

// ── Part type matching (same spirit as catcar-oem-parts) ───────────────────

const PART_TYPE_OEM_HINTS: Record<
  string,
  { roots: string[]; unit: string[]; part: string[]; exclude?: string[] }
> = {
  "brake-pads": {
    roots: ["шасси", "chassis", "тормоз", "brake"],
    unit: ["передн", "задн", "ось", "front", "rear", "brake", "тормоз", "колод", "мост"],
    part: ["pad kit", "pad kit-", "pad-", "колодк", "brake pad", "lining"],
    exclude: [
      "piston", "поршень", "bolt", "болт", "hose", "шланг", "spring", "пружина",
      "sensor", "ступиц", "hub", "bearing", "подшип", "суппорт", "caliper",
      "disc-", "диск-", "cover", "крышка", "screw", "винт", "гайка",
    ],
  },
  "brake-discs": {
    roots: ["шасси", "chassis", "тормоз"],
    unit: ["передн", "задн", "ось", "front", "rear", "disc", "диск", "мост"],
    part: ["диск-тормоз", "disc-", "disk-", "тормозной диск", "brake disc", "rotor"],
    exclude: [
      "pad", "колод", "hose", "cover", "крышка", "bolt",
      "суппорт", "caliper", "ступиц", "hub", "bearing", "поршень", "piston",
    ],
  },
  "brake-master": {
    roots: ["шасси", "chassis", "тормоз"],
    unit: ["главн", "цилиндр", "усилитель", "master", "boost"],
    part: ["master", "cylinder", "главн", "boost", "цилиндр"],
  },
  "brake-hoses": {
    roots: ["шасси", "chassis"],
    unit: ["трубк", "шланг", "hose", "brake", "тормоз"],
    part: ["hose-brake", "hose", "шланг", "тормоз"],
  },
  "brake-caliper": {
    roots: ["шасси", "chassis"],
    unit: ["передн", "задн", "ось", "суппорт", "caliper", "мост"],
    part: ["суппорт", "caliper", "brake assy", "assy-fr", "assy-rr"],
  },
  "brake-abs": {
    roots: ["шасси", "chassis", "электр"],
    unit: ["гидравл", "abs", "модуль"],
    part: ["abs", "sensor", "датчик", "гидравл"],
  },
  "brake-hand": {
    roots: ["шасси", "chassis"],
    unit: ["стояноч", "parking", "ручник"],
    part: ["стояноч", "parking", "трос", "cable", "рычаг"],
  },
  "filter-oil": {
    roots: ["двигатель", "engine"],
    unit: ["фильтр", "маслян", "oil", "корпус", "смаз"],
    part: ["oil filter", "filter-oil", "масляный фильтр", "маслян", "element-oil"],
  },
  "filter-air": {
    roots: ["двигатель", "engine"],
    unit: ["воздуш", "air filter", "воздушный фильтр"],
    part: ["air filter", "filter-air", "воздушный фильтр", "воздушн", "element-air"],
  },
  "filter-fuel": {
    roots: ["двигатель", "engine"],
    unit: ["топлив", "fuel", "filter"],
    part: ["fuel filter", "filter-fuel", "топливн"],
  },
  "filter-cabin": {
    roots: ["кузов", "body", "электр", "отделка"],
    unit: ["салон", "cabin", "pollin", "климат", "filter", "отопител"],
    part: ["cabin", "pollen", "салон", "climate filter", "filter-air cleaner"],
  },
  "shock-absorber": {
    roots: ["шасси", "chassis"],
    unit: ["амортиз", "стойка", "пружина", "shock", "strut"],
    part: ["shock", "strut", "амортиз", "absorber", "damper"],
  },
  "hub-bearing": {
    roots: ["шасси", "chassis"],
    unit: ["ступиц", "подшип", "ось", "hub", "bearing", "мост"],
    part: ["hub", "bearing", "ступиц", "подшип"],
  },
  "control-arm": {
    roots: ["шасси", "chassis"],
    unit: ["рычаг", "arm", "подвеск"],
    part: ["arm", "рычаг", "control arm", "wishbone"],
  },
  "tie-rod": {
    roots: ["шасси", "chassis"],
    unit: ["рулев", "steering", "тяга", "наконеч"],
    part: ["tie rod", "end", "наконеч", "тяга", "tierod"],
  },
  "steering-rack": {
    roots: ["шасси", "chassis"],
    unit: ["рулев", "steering", "рейка", "усилитель"],
    part: ["rack", "gear", "рейка", "steering gear"],
  },
  "water-pump": {
    roots: ["двигатель", "engine"],
    unit: ["помп", "water", "охлажд", "pump"],
    part: ["water pump", "pump", "помпа", "водяной"],
  },
  thermostat: {
    roots: ["двигатель", "engine"],
    unit: ["термостат", "thermostat", "охлажд"],
    part: ["thermostat", "термостат"],
  },
  radiator: {
    roots: ["двигатель", "engine", "кузов"],
    unit: ["радиатор", "radiator", "охлажд"],
    part: ["radiator", "радиатор"],
  },
  "spark-plugs": {
    roots: ["двигатель", "engine", "электр"],
    unit: ["свеч", "spark", "зажиг"],
    part: ["spark plug", "свеча", "plug"],
    exclude: ["glow", "накал"],
  },
  "glow-plugs": {
    roots: ["двигатель", "engine"],
    unit: ["накал", "glow", "свеч"],
    part: ["glow", "накал", "свеча накал"],
  },
  "timing-belt": {
    roots: ["двигатель", "engine"],
    unit: ["ремн", "грм", "timing", "цепь"],
    part: ["timing", "belt", "ремень", "цепь", "chain"],
  },
  battery: {
    roots: ["двигатель", "engine", "электр"],
    unit: ["батаре", "battery", "акб"],
    part: ["battery", "батаре", "аккумулятор"],
  },
  "wiper-blades": {
    roots: ["кузов", "body", "отделка"],
    unit: ["стеклоочист", "wiper", "щётк", "щетк"],
    part: ["wiper", "blade", "щётк", "щетк", "стеклоочист"],
  },
};

function scoreText(text: string, keys: string[]): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of keys) {
    if (t.includes(k.toLowerCase())) s += k.length > 6 ? 3 : 2;
  }
  return s;
}

function unitScore(unit: ElcatsGroupUnit, hints: (typeof PART_TYPE_OEM_HINTS)[string]): number {
  const blob = `${unit.title} ${unit.rootTitle || ""}`;
  let s = scoreText(blob, hints.unit) + scoreText(blob, hints.roots);
  if (hints.exclude && scoreText(blob, hints.exclude) > 4 && s < 6) s -= 3;
  return s;
}

function partScore(name: string, article: string, hints: (typeof PART_TYPE_OEM_HINTS)[string]): number {
  const n = name.toLowerCase();
  let s = scoreText(name, hints.part);
  if (hints.exclude && scoreText(name, hints.exclude) > 0) s -= 8;
  // Prefer kit/assy over fasteners
  if (/kit|комплект|assy|в сборе/i.test(name)) s += 3;
  if (/болт|гайка|винт|шайба|bolt|nut|screw|washer/i.test(name)) s -= 5;
  // Secondary product-line codes (S…) — deprioritize
  if (/^S\d/i.test(article)) s -= 3;
  // Full OEM shape
  if (/^\d{5}-[0-9A-Z]{4,6}$/i.test(article)) s += 2;
  // Hard gates by part family so axle unit noise doesn't leak through
  if (hints.part.some((k) => /pad|колод|lining/i.test(k))) {
    if (!/pad|колод|lining|friction/i.test(n)) s -= 6;
  }
  if (hints.part.some((k) => /disc|диск|rotor/i.test(k))) {
    if (!/disc|disk|диск|rotor/i.test(n)) s -= 6;
    if (/суппорт|caliper|pad|колод/i.test(n)) s -= 6;
  }
  return s;
}

function normalizeFullOem(raw: string): string | null {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  if (/^\d{5}-[0-9A-Z]{4,8}$/.test(t)) return t;
  if (/^\d{5}-\d{5}[A-Z]?$/.test(t)) return t;
  if (/^[A-Z]?\d{10,}$/.test(t)) return t;
  if (/^[A-Z0-9]{8,}$/.test(t) && t.length >= 10) return t;
  return null;
}

/** Short codes on unit page: <div class="CNode" id="58101B"><b>58101B</b>&nbsp;&nbsp;NAME */
function parseShortParts(html: string): Array<{ shortCode: string; name: string }> {
  const out: Array<{ shortCode: string; name: string }> = [];
  const re =
    /class="CNode"[^>]*id="([^"]+)"[^>]*>\s*<b>\1<\/b>(?:&nbsp;|\s)*([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const shortCode = m[1]!.trim();
    const name = stripTags(m[2] || "").trim();
    if (shortCode && name && name.length > 1 && !name.startsWith("/")) {
      out.push({ shortCode, name });
    }
  }
  // fallback simpler
  if (!out.length) {
    for (const m2 of html.matchAll(
      /id="([0-9A-Z]{4,12})"[^>]*>[\s\S]*?<b>\1<\/b>(?:&nbsp;|\s)*([^<]{2,100})/gi
    )) {
      out.push({ shortCode: m2[1]!, name: stripTags(m2[2]!).trim() });
    }
  }
  return out;
}

/** Unit variants from Unit.aspx: submit('modelGuid','unitGuid',' ') + optional thumb */
function parseUnitVariants(
  html: string
): Array<{ modelGuid: string; unitGuid: string; title: string; thumbUrl?: string }> {
  const out: Array<{ modelGuid: string; unitGuid: string; title: string; thumbUrl?: string }> = [];
  const seen = new Set<string>();
  // Prefer anchor blocks with image
  const blockRe =
    /href="javascript:submit\('([0-9a-f\-]{36})','([0-9a-f\-]{36})','([^']*)'\)"[^>]*>[\s\S]{0,400}?src="(ImageHandler\.ashx\?[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const key = m[2]!;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      modelGuid: m[1]!,
      unitGuid: m[2]!,
      title: (m[3] || "").trim() || " ",
      thumbUrl: m[4],
    });
  }
  const re = /submit\('([0-9a-f\-]{36})','([0-9a-f\-]{36})','([^']*)'\)/gi;
  while ((m = re.exec(html))) {
    const key = m[2]!;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ modelGuid: m[1]!, unitGuid: m[2]!, title: (m[3] || "").trim() || " " });
  }
  return out;
}

/** Exploded diagram + callout hotspots from Parts.aspx */
export function parseElcatsDiagram(html: string, brandPath: string): ElcatsDiagram | undefined {
  const imgM =
    html.match(/src="(\.\.\/CImage\.ashx\?[^"]+)"/i) ||
    html.match(/src="(CImage\.ashx\?[^"]+)"/i) ||
    html.match(/src="(\/CImage\.ashx\?[^"]+)"/i);
  if (!imgM) return undefined;
  let rel = imgM[1]!.replace(/&amp;/g, "&");
  let url: string;
  if (rel.startsWith("http")) url = rel;
  else if (rel.startsWith("/")) url = `${ELCATS}${rel}`;
  else if (rel.startsWith("../")) url = `${ELCATS}/${rel.replace(/^\.\.\//, "")}`;
  else url = `${ELCATS}/${brandPath}/${rel}`;

  const width = Number(rel.match(/Width=(\d+)/i)?.[1] || 500) || 500;
  const points: ElcatsDiagramPoint[] = [];
  const pointRe =
    /class="MapPoint"[^>]*?(?:title="([^"]*)"[^>]*?no="([^"]+)"|no="([^"]+)"[^>]*?title="([^"]*)")[^>]*?style="([^"]*)"/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pointRe.exec(html))) {
    const title = (pm[1] || pm[4] || "").trim();
    const code = (pm[2] || pm[3] || "").trim();
    const style = pm[5] || "";
    const left = Number(style.match(/left:\s*([\d.]+)px/i)?.[1] || 0);
    const top = Number(style.match(/top:\s*([\d.]+)px/i)?.[1] || 0);
    const w = Number(style.match(/width:\s*([\d.]+)px/i)?.[1] || 40);
    const h = Number(style.match(/height:\s*([\d.]+)px/i)?.[1] || 14);
    if (code) points.push({ code, title: title || code, left, top, width: w, height: h });
  }
  // looser MapPoint parse
  if (!points.length) {
    for (const m of html.matchAll(/class="MapPoint"[^>]*>/gi)) {
      const tag = m[0];
      const code = tag.match(/\bno="([^"]+)"/i)?.[1];
      const title = tag.match(/\btitle="([^"]*)"/i)?.[1] || code || "";
      const style = tag.match(/\bstyle="([^"]*)"/i)?.[1] || "";
      if (!code) continue;
      points.push({
        code,
        title,
        left: Number(style.match(/left:\s*([\d.]+)px/i)?.[1] || 0),
        top: Number(style.match(/top:\s*([\d.]+)px/i)?.[1] || 0),
        width: Number(style.match(/width:\s*([\d.]+)px/i)?.[1] || 40),
        height: Number(style.match(/height:\s*([\d.]+)px/i)?.[1] || 14),
      });
    }
  }
  return { url, width, points };
}

function absElcatsUrl(rel: string, brandPath: string): string {
  const r = rel.replace(/&amp;/g, "&");
  if (r.startsWith("http")) return r;
  if (r.startsWith("//")) return `https:${r}`;
  if (r.startsWith("/")) return `${ELCATS}${r}`;
  if (r.startsWith("../")) return `${ELCATS}/${r.replace(/^\.\.\//, "")}`;
  return `${ELCATS}/${brandPath}/${r}`;
}

/** Mercedes hides OEM numbers as Codes.ashx PNG — OCR with tesseract.js */
async function ocrElcatsCodeImage(key: string): Promise<string | null> {
  try {
    const url = `${ELCATS}/Codes.ashx?Key=${encodeURIComponent(key)}`;
    const img = await fetchText({
      url,
      timeoutMs: 15000,
      retries: 0,
      skipWarmup: true,
      preferCurl: true,
      headers: {
        Accept: "image/png,image/*",
        Referer: `${ELCATS}/mercedes/`,
        "Accept-Encoding": "gzip, deflate",
      },
    });
    // fetchText is text — for binary need raw fetch
  } catch {
    /* fall through */
  }
  try {
    const url = `${ELCATS}/Codes.ashx?Key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `${ELCATS}/mercedes/`,
        Accept: "image/png,image/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 50) return null;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(buf);
      const art = (text || "")
        .replace(/\s+/g, "")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();
      // Mercedes: A2044213581
      if (/^A\d{10}$/i.test(art)) return art;
      if (/^[A-Z]?\d{8,}$/i.test(art) && art.length >= 10) return art;
      if (art.length >= 8) return art;
      return null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

/** Mercedes Parts.aspx: Codes.ashx images + names (no CNode text codes) */
function parseMercedesPartSlots(
  html: string
): Array<{ key: string; name: string; desc: string; callout?: string; qty?: string }> {
  const out: Array<{ key: string; name: string; desc: string; callout?: string; qty?: string }> = [];
  // each row: Codes.ashx?Key=... then <b>NAME</b><br />DESC
  const re =
    /Codes\.ashx\?Key=([^"'>\s&]+)[^>]*>[\s\S]{0,80}?<\/a><\/td>\s*<td[^>]*>\s*<b>([^<]+)<\/b>(?:<br\s*\/?>\s*([^<]*))?[\s\S]{0,200}?<td[^>]*class="c"[^>]*>(\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({
      key: decodeURIComponent(m[1]!.replace(/&amp;/g, "&")),
      name: stripTags(m[2]!),
      desc: stripTags(m[3] || ""),
      qty: m[4],
    });
  }
  if (!out.length) {
    // looser
    for (const m2 of html.matchAll(
      /Codes\.ashx\?Key=([^"'>\s]+)[\s\S]{0,400}?<b>([^<]+)<\/b>(?:<br\s*\/?>\s*([^<]*))?/gi
    )) {
      out.push({
        key: decodeURIComponent(m2[1]!.replace(/&amp;/g, "&")),
        name: stripTags(m2[2]!),
        desc: stripTags(m2[3] || ""),
      });
    }
  }
  // attach callout numbers from preceding <span class="plus" key="130">
  let callout = "";
  const withCallouts = [...out];
  // rebuild with callouts by scanning
  const slots: typeof out = [];
  const blockRe =
    /(?:class="plus"[^>]*key="(\d+)"[^>]*>[\s\S]*?<b>\d+<\/b>\s*([^<]+)<\/span>)?[\s\S]{0,2000}?Codes\.ashx\?Key=([^"'>\s]+)[\s\S]{0,400}?<b>([^<]+)<\/b>(?:<br\s*\/?>\s*([^<]*))?/gi;
  while ((m = blockRe.exec(html))) {
    if (m[1]) callout = m[1];
    slots.push({
      key: decodeURIComponent(m[3]!.replace(/&amp;/g, "&")),
      name: stripTags(m[4]!),
      desc: stripTags(m[5] || ""),
      callout: callout || undefined,
    });
  }
  return slots.length ? slots : withCallouts;
}

function parseMercedesSubGroups(
  html: string
): Array<{ modelGuid: string; groupId: string; subGroupId: string; title: string }> {
  const out: Array<{ modelGuid: string; groupId: string; subGroupId: string; title: string }> = [];
  const re = /submit\('([^']+)','([^']+)','([^']+)','([^']+)'\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    // skip null-style
    if (m[3] === "null") continue;
    out.push({
      modelGuid: m[1]!,
      groupId: m[2]!,
      subGroupId: m[3]!,
      title: stripTags(m[4]!),
    });
  }
  return out;
}

function parseFullPartsTable(html: string): Array<{
  article: string;
  name: string;
  qty?: string;
  period?: string;
  options?: string;
}> {
  const out: Array<{ article: string; name: string; qty?: string; period?: string; options?: string }> =
    [];
  // rows after callback: <tr><td>...<a ...>58101-2FA21</a></td><td>NAME</td><td>1</td><td>period</td><td>opts</td>
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) =>
      stripTags(x[1]!)
    );
    if (tds.length < 2) continue;
    const art = normalizeFullOem(tds[0] || "");
    if (!art) continue;
    out.push({
      article: art,
      name: tds[1] || art,
      qty: tds[2],
      period: tds[3],
      options: tds[4],
    });
  }
  return out;
}

async function expandShortCode(
  partsUrl: string,
  viewStateFields: Record<string, string>,
  shortCode: string
): Promise<Array<{ article: string; name: string; qty?: string; period?: string; options?: string }>> {
  const data: Record<string, string> = {
    ...viewStateFields,
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    __CALLBACKID: "__Page",
    __CALLBACKPARAM: shortCode,
  };
  const res = await fetchText({
    url: partsUrl,
    method: "POST",
    body: encodeForm(data),
    timeoutMs: 20000,
    retries: 0,
    skipWarmup: true,
    headers: {
      ...UA_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: ELCATS,
      Referer: partsUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok || !res.text) return [];
  // Response: 116|{eventvalidation}<table...
  const html = res.text.replace(/^\d+\|[^<]*/, "");
  return parseFullPartsTable(html);
}

/**
 * Resolve factory OEM articles for a service part type on this VIN's elcats card.
 */
export async function findElcatsOemPartsForPartType(
  groupUrl: string,
  partTypeId: string,
  options?: { maxUnits?: number; maxArticles?: number; maxExpand?: number }
): Promise<ElcatsOemPartsResult> {
  const started = Date.now();
  const maxUnits = options?.maxUnits ?? 6;
  const maxArticles = options?.maxArticles ?? 8;
  const maxExpand = options?.maxExpand ?? 12;
  const hints = PART_TYPE_OEM_HINTS[partTypeId];

  if (!hints) {
    return {
      catalogUrl: groupUrl,
      partTypeId,
      articles: [],
      parts: [],
      unitsScanned: [],
      groups: [],
      tookMs: Date.now() - started,
      error: `Нет OEM-маппинга для типа «${partTypeId}»`,
    };
  }

  try {
    const groupPage = await getHtml(groupUrl, ELCATS + "/");
    if (!groupPage.ok) {
      return {
        catalogUrl: groupUrl,
        partTypeId,
        articles: [],
        parts: [],
        unitsScanned: [],
        groups: [],
        tookMs: Date.now() - started,
        error: "Не удалось открыть OEM-группы elcats",
      };
    }

    const units = parseElcatsUnits(groupPage.text);
    const roots = parseElcatsRootGroups(groupPage.text);
    const groupsSummary = roots.map((r) => ({
      title: r.title,
      units: units.filter((u) => u.rootId === r.id).map((u) => u.title),
    }));

    const ranked = units
      .map((u) => ({ u, s: unitScore(u, hints) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, maxUnits);

    if (!ranked.length) {
      return {
        catalogUrl: groupUrl,
        partTypeId,
        articles: [],
        parts: [],
        unitsScanned: [],
        groups: groupsSummary,
        tookMs: Date.now() - started,
        error: "Нет подходящих узлов OEM-каталога для этого типа детали",
      };
    }

    const brandPath = groupUrl.match(/elcats\.ru\/([a-z0-9]+)\//i)?.[1] || "kia";
    const allParts: ElcatsOemPart[] = [];
    const unitsScanned: string[] = [];
    let expandsLeft = maxExpand;

    for (const { u } of ranked) {
      unitsScanned.push(u.title);
      const unitUrl =
        `${ELCATS}/${brandPath}/Unit.aspx?` +
        new URLSearchParams({
          GroupId: u.groupId,
          Model: u.modelGuid,
          Title: u.title,
        }).toString();

      const unitPage = await getHtml(unitUrl, groupUrl);
      if (!unitPage.ok) continue;

      let partsPages: Array<{ url: string; html: string }> = [];

      if (/Parts\.aspx/i.test(unitPage.finalUrl)) {
        partsPages = [{ url: unitPage.finalUrl, html: unitPage.text }];
      } else {
        const variants = parseUnitVariants(unitPage.text);
        // open first 2 variants (LHD/RHD, ABS options, …)
        for (const v of variants.slice(0, 2)) {
          const pUrl =
            `${ELCATS}/${brandPath}/Parts.aspx?` +
            new URLSearchParams({
              Model: v.modelGuid,
              Unit: v.unitGuid,
              Title: " ",
            }).toString();
          const pp = await getHtml(pUrl, unitUrl);
          if (pp.ok) partsPages.push({ url: pp.finalUrl, html: pp.text });
        }
      }

      for (const pp of partsPages) {
        const shorts = parseShortParts(pp.html);
        // Pre-filter by name keywords to save callbacks
        const candidates = shorts
          .map((s) => ({ ...s, s: partScore(s.name, s.shortCode, hints) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 8);

        const vs = extractFormFields(pp.html);

        for (const c of candidates) {
          if (expandsLeft <= 0) break;
          expandsLeft--;
          const fullRows = await expandShortCode(pp.url, vs, c.shortCode);
          if (!fullRows.length) {
            // keep short as last resort only if it already looks full
            const maybe = normalizeFullOem(c.shortCode);
            if (maybe) {
              allParts.push({
                article: maybe,
                name: c.name,
                unitTitle: u.title,
                shortCode: c.shortCode,
                score: partScore(c.name, maybe, hints),
              });
            }
            continue;
          }
          for (const row of fullRows) {
            const sc = partScore(row.name, row.article, hints);
            if (sc < 2) continue;
            const [dateFrom, dateTo] = (row.period || "")
              .split(/\s*-\s*/)
              .map((x) => x.trim());
            allParts.push({
              article: row.article,
              name: row.name,
              qty: row.qty,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              options: row.options,
              unitTitle: u.title,
              shortCode: c.shortCode,
              score: sc,
            });
          }
        }
      }
    }

    // Dedupe by article, keep best score
    const byArt = new Map<string, ElcatsOemPart>();
    for (const p of allParts) {
      const prev = byArt.get(p.article);
      if (!prev || p.score > prev.score) byArt.set(p.article, p);
    }
    // Prefer real factory codes over secondary product-line (S…) duplicates
    const parts = [...byArt.values()]
      .sort((a, b) => {
        const aSec = /^S\d/i.test(a.article) ? 1 : 0;
        const bSec = /^S\d/i.test(b.article) ? 1 : 0;
        if (aSec !== bSec) return aSec - bSec;
        return b.score - a.score;
      })
      .filter((p, _i, arr) => {
        if (!/^S\d/i.test(p.article)) return true;
        // drop S-code if same base already present
        const base = p.article.replace(/^S/i, "").replace(/-/g, "");
        return !arr.some(
          (o) => !/^S\d/i.test(o.article) && o.article.replace(/-/g, "") === base
        );
      })
      .slice(0, maxArticles);

    return {
      catalogUrl: groupUrl,
      partTypeId,
      articles: parts.map((p) => p.article),
      parts,
      unitsScanned,
      groups: groupsSummary,
      tookMs: Date.now() - started,
      error: parts.length ? undefined : "В подходящих узлах не найдены полные OEM-коды",
    };
  } catch (e) {
    return {
      catalogUrl: groupUrl,
      partTypeId,
      articles: [],
      parts: [],
      unitsScanned: [],
      groups: [],
      tookMs: Date.now() - started,
      error: e instanceof Error ? e.message : "Elcats parts error",
    };
  }
}

/** Load OEM group/unit tree for UI — brand-agnostic via elcats-engine. */
export async function loadElcatsCatalogTree(groupUrl: string): Promise<{
  roots: Array<{ id: string; title: string }>;
  units: ElcatsGroupUnit[];
  /** Opaque nav payloads for openNavNode (JSON-serializable) */
  navNodes?: Array<{
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
    rootId?: string;
    rootTitle?: string;
  }>;
  error?: string;
}> {
  const { loadCatalogTree } = await import("./elcats-engine");
  const tree = await loadCatalogTree(groupUrl);
  if (tree.error) return { roots: [], units: [], error: tree.error };
  const units: ElcatsGroupUnit[] = tree.nodes.map((n) => ({
    groupId: n.id,
    modelGuid: n.fields.Model || n.fields.GroupId || "",
    title: n.title,
    rootId: n.parentId || "0",
    rootTitle: n.rootTitle,
    navNode: {
      id: n.id,
      title: n.title,
      action: n.action,
      fields: n.fields,
    },
  }));
  return {
    roots: tree.roots,
    units,
    navNodes: tree.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      action: n.action,
      fields: n.fields,
      rootId: n.parentId,
      rootTitle: n.rootTitle,
    })),
  };
}

export interface ElcatsUnitPartRow {
  article: string;
  name: string;
  shortCode: string;
  qty?: string;
  dateFrom?: string;
  dateTo?: string;
  options?: string;
  unitTitle: string;
  groupId: string;
}

export interface ElcatsDiagramPoint {
  code: string;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ElcatsDiagram {
  /** Absolute image URL (elcats CImage.ashx) */
  url: string;
  /** Hint width from query (often 500) */
  width?: number;
  points: ElcatsDiagramPoint[];
}

export interface ElcatsSubUnit {
  modelGuid: string;
  unitGuid: string;
  title: string;
  thumbUrl?: string;
  /** Full nav payload to open this scheme exactly as elcats (preferred over unitGuid alone) */
  navNode?: {
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
  };
}

function brandPathFromGroupUrl(groupUrl: string): string {
  return groupUrl.match(/elcats\.ru\/([a-z0-9]+)\//i)?.[1] || "kia";
}

function modelGuidFromGroupUrl(groupUrl: string): string | null {
  return groupUrl.match(/Model=([0-9a-f\-]{36})/i)?.[1] || null;
}

/** RU/EN OEM catalog synonyms so «колодк» finds PAD KIT, «фильтр масл» → OIL FILTER, etc. */
const SEARCH_SYNONYMS: Array<{ re: RegExp; en: string[] }> = [
  { re: /колод/, en: ["pad", "lining"] },
  { re: /тормоз/, en: ["brake"] },
  { re: /диск/, en: ["disc", "disk", "rotor"] },
  { re: /суппорт/, en: ["caliper"] },
  { re: /фильтр/, en: ["filter"] },
  { re: /масл/, en: ["oil"] },
  { re: /воздуш/, en: ["air"] },
  { re: /топлив/, en: ["fuel"] },
  { re: /салон|пыльц/, en: ["cabin", "pollen"] },
  { re: /амортиз|стойк/, en: ["shock", "strut", "damper"] },
  { re: /пружин/, en: ["spring"] },
  { re: /ступиц|подшип/, en: ["hub", "bearing"] },
  { re: /рычаг/, en: ["arm"] },
  { re: /рулев|наконеч|тяг/, en: ["steering", "tie", "rack"] },
  { re: /свеч/, en: ["plug", "spark", "glow"] },
  { re: /помп/, en: ["pump"] },
  { re: /радиатор/, en: ["radiator"] },
  { re: /генератор/, en: ["alternator", "generator"] },
  { re: /стартер/, en: ["starter"] },
  { re: /сцеплен/, en: ["clutch"] },
  { re: /шрус|пыльник/, en: ["joint", "boot", "drive"] },
  { re: /ремень|грм|цепь/, en: ["belt", "timing", "chain"] },
  { re: /фара|фонар|ламп/, en: ["lamp", "light", "head"] },
  { re: /омыв|стеклооч|дворник/, en: ["washer", "wiper", "windshield", "nozzle"] },
];

function expandSearchTokens(filter: string): string[] {
  const base = filter
    .trim()
    .toLowerCase()
    .split(/[\s,;/]+/)
    .filter((t) => t.length >= 2);
  const out = new Set(base);
  for (const t of base) {
    for (const syn of SEARCH_SYNONYMS) {
      if (syn.re.test(t) || syn.re.test(filter.toLowerCase())) {
        for (const e of syn.en) out.add(e);
      }
    }
  }
  return [...out];
}

function matchesFilter(text: string, filter?: string): boolean {
  if (!filter?.trim()) return true;
  const tokens = expandSearchTokens(filter);
  if (!tokens.length) return true;
  const hay = text.toLowerCase();
  // OR across synonym-expanded tokens groups: every original word must match
  // either itself or one of its synonym expansions that appear in hay
  const original = filter
    .trim()
    .toLowerCase()
    .split(/[\s,;/]+/)
    .filter((t) => t.length >= 2);
  return original.every((t) => {
    if (hay.includes(t)) return true;
    const expanded = expandSearchTokens(t);
    return expanded.some((e) => hay.includes(e));
  });
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

/**
 * Mercedes (and similar) catalog path on elcats.
 * groupId "42" → SubGroup.aspx → list of "030 ТОРМОЗ ПЕРЕДНЕГО КОЛЕСА" → Parts with Codes.ashx.
 */
async function loadMercedesUnitParts(
  params: {
    groupUrl: string;
    groupId: string;
    title: string;
    modelGuid?: string;
    unitGuid?: string;
    filter?: string;
    maxExpand?: number;
    expand?: boolean;
    allVariants?: boolean;
  },
  brandPath: string,
  modelGuid: string,
  started: number
): Promise<{
  unitTitle: string;
  groupId: string;
  parts: ElcatsUnitPartRow[];
  shortParts: Array<{ shortCode: string; name: string }>;
  diagram?: ElcatsDiagram;
  subUnits?: ElcatsSubUnit[];
  tookMs: number;
  error?: string;
}> {
  const empty = (error?: string, subUnits?: ElcatsSubUnit[]) => ({
    unitTitle: params.title,
    groupId: params.groupId,
    parts: [] as ElcatsUnitPartRow[],
    shortParts: [] as Array<{ shortCode: string; name: string }>,
    subUnits,
    tookMs: Date.now() - started,
    error,
  });

  try {
    const partsPages: Array<{ url: string; html: string }> = [];
    let subUnits: ElcatsSubUnit[] | undefined;

    // Direct unit guid (already on Parts.aspx)
    if (params.unitGuid && !params.unitGuid.includes(":")) {
      // unitGuid may be "parts:uuid" or subgroup "sg:030"
      if (params.unitGuid.startsWith("sg:")) {
        const subGroupId = params.unitGuid.slice(3);
        const uUrl =
          `${ELCATS}/${brandPath}/Unit.aspx?` +
          new URLSearchParams({
            Model: modelGuid.split(";").pop() || modelGuid,
            Group: params.groupId.replace(/^SA-\d+-/, "").replace(/^SA-/, "") || params.groupId,
            SubGroup: subGroupId,
            Title: params.title,
          }).toString();
        // For normal groups groupId is "42"
        const uUrl2 =
          `${ELCATS}/${brandPath}/Unit.aspx?` +
          new URLSearchParams({
            Model: modelGuid.includes(";") ? modelGuid.split(";")[1]! : modelGuid,
            Group: /^\d{2}$/.test(params.groupId) ? params.groupId : "42",
            SubGroup: subGroupId,
            Title: params.title,
          }).toString();
        const pp = await getHtml(uUrl2, params.groupUrl);
        if (pp.ok) partsPages.push({ url: pp.finalUrl, html: pp.text });
      } else {
        const pUrl =
          `${ELCATS}/${brandPath}/Parts.aspx?` +
          new URLSearchParams({
            Model: modelGuid.includes(";") ? modelGuid.split(";")[1]! : modelGuid,
            Unit: params.unitGuid,
            Title: " ",
          }).toString();
        const pp = await getHtml(pUrl, params.groupUrl);
        if (pp.ok) partsPages.push({ url: pp.finalUrl, html: pp.text });
      }
    } else if (/^SA-/i.test(params.groupId)) {
      // Nested SA unit already deep-linked via special groupId — open Unit with model compound
      // groupId SA-01-1002 → Group=01 SubGroup=1002 Model=guid;model
      const parts = params.groupId.split("-");
      const g = parts[1] || "";
      const sg = parts[2] || "";
      const uUrl =
        `${ELCATS}/${brandPath}/Unit.aspx?` +
        new URLSearchParams({
          Model: modelGuid,
          Group: g,
          SubGroup: sg,
          Title: params.title,
        }).toString();
      const pp = await getHtml(uUrl, params.groupUrl);
      if (pp.ok) partsPages.push({ url: pp.finalUrl, html: pp.text });
    } else {
      // Main group → subgroups
      const subUrl =
        `${ELCATS}/${brandPath}/SubGroup.aspx?` +
        new URLSearchParams({
          Model: modelGuid.includes(";") ? modelGuid.split(";")[1]! : modelGuid,
          Group: params.groupId,
          Title: params.title,
        }).toString();
      const subPage = await getHtml(subUrl, params.groupUrl);
      if (!subPage.ok) return empty("Не удалось открыть подгруппы Mercedes EPC");

      const subs = parseMercedesSubGroups(subPage.text);
      subUnits = subs.map((s) => ({
        modelGuid: s.modelGuid,
        unitGuid: `sg:${s.subGroupId}`,
        title: s.title,
      }));

      const openAll = params.allVariants !== false;
      const toOpen = openAll ? subs.slice(0, 12) : subs.slice(0, 1);
      // If user filtered search, prefer matching subgroup titles
      const filtered = params.filter?.trim()
        ? toOpen.filter((s) => matchesFilter(s.title, params.filter))
        : toOpen;
      const list = filtered.length ? filtered : toOpen;

      for (const s of list) {
        const uUrl =
          `${ELCATS}/${brandPath}/Unit.aspx?` +
          new URLSearchParams({
            Model: s.modelGuid.includes(";") ? s.modelGuid.split(";").pop()! : s.modelGuid,
            Group: s.groupId,
            SubGroup: s.subGroupId,
            Title: s.title,
          }).toString();
        const pp = await getHtml(uUrl, subUrl);
        if (pp.ok && (pp.text.includes("Codes.ashx") || pp.text.includes("CImage") || /Parts\.aspx/i.test(pp.finalUrl))) {
          partsPages.push({ url: pp.finalUrl, html: pp.text });
        }
      }
    }

    if (!partsPages.length) {
      return empty(
        subUnits?.length
          ? "Выберите подраздел (схему) ниже"
          : "В узле Mercedes нет схем/запчастей",
        subUnits
      );
    }

    const diagram = parseElcatsDiagram(partsPages[0]!.html, brandPath);
    // MapPointNew for MB
    if (diagram && !diagram.points.length) {
      const pts: ElcatsDiagramPoint[] = [];
      for (const m of partsPages[0]!.html.matchAll(/class="MapPointNew"[^>]*>/gi)) {
        const tag = m[0];
        const code = tag.match(/\bno="([^"]*)"/i)?.[1] || "";
        const title = tag.match(/\bTitle="([^"]*)"/i)?.[1] || tag.match(/\btitle="([^"]*)"/i)?.[1] || code;
        const style = tag.match(/\bstyle="([^"]*)"/i)?.[1] || "";
        if (!code && tag.includes('none="True"')) continue;
        pts.push({
          code: code || "?",
          title: title || "",
          left: Number(style.match(/left:\s*([\d.]+)px/i)?.[1] || 0),
          top: Number(style.match(/top:\s*([\d.]+)px/i)?.[1] || 0),
          width: Number(style.match(/width:\s*([\d.]+)px/i)?.[1] || 20),
          height: Number(style.match(/height:\s*([\d.]+)px/i)?.[1] || 20),
        });
      }
      if (pts.length) diagram.points = pts;
    }

    // Collect code image keys + names
    const slots: Array<{ key: string; name: string; desc: string; callout?: string }> = [];
    for (const pp of partsPages) {
      slots.push(...parseMercedesPartSlots(pp.html));
    }
    // dedupe by key
    const byKey = new Map<string, (typeof slots)[0]>();
    for (const s of slots) {
      if (!byKey.has(s.key)) byKey.set(s.key, s);
    }
    let list = [...byKey.values()];
    if (params.filter?.trim()) {
      list = list.filter((s) =>
        matchesFilter(`${s.name} ${s.desc} ${s.callout || ""}`, params.filter)
      );
    }

    const maxExpand = params.maxExpand ?? 40;
    const toOcr = list.slice(0, maxExpand);
    const expand = params.expand !== false;

    let parts: ElcatsUnitPartRow[] = [];
    if (expand && toOcr.length) {
      const ocrResults = await mapPool(toOcr, 3, async (s) => {
        const art = await ocrElcatsCodeImage(s.key);
        return {
          article: art || s.callout || s.key.slice(0, 12),
          name: s.desc ? `${s.name} — ${s.desc}` : s.name,
          shortCode: s.callout || "",
          unitTitle: params.title,
          groupId: params.groupId,
        } satisfies ElcatsUnitPartRow;
      });
      parts = ocrResults.filter((p) => p.article && !p.article.startsWith("http"));
      // Prefer real A-codes
      parts.sort((a, b) => {
        const as = /^A\d/i.test(a.article) ? 0 : 1;
        const bs = /^A\d/i.test(b.article) ? 0 : 1;
        if (as !== bs) return as - bs;
        return a.name.localeCompare(b.name, "ru");
      });
    } else {
      parts = list.map((s) => ({
        article: s.callout || "—",
        name: s.desc ? `${s.name} — ${s.desc}` : s.name,
        shortCode: s.callout || "",
        unitTitle: params.title,
        groupId: params.groupId,
      }));
    }

    const shortParts = list.map((s) => ({
      shortCode: s.callout || s.key.slice(0, 8),
      name: s.name,
    }));

    return {
      unitTitle: params.title,
      groupId: params.groupId,
      parts,
      shortParts,
      diagram,
      subUnits: subUnits && subUnits.length > 1 ? subUnits : undefined,
      tookMs: Date.now() - started,
      error: parts.length
        ? undefined
        : subUnits?.length
          ? "Выберите подраздел ниже"
          : "Не удалось прочитать OEM-коды (изображения)",
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "Mercedes EPC error");
  }
}

/**
 * Open one EPC unit — brand-agnostic (elcats-engine discovers layout).
 * `groupId` may be opaque nav node id from loadElcatsCatalogTree.
 */
export async function loadElcatsUnitParts(params: {
  groupUrl: string;
  groupId: string;
  title: string;
  modelGuid?: string;
  /** Direct Parts.aspx unit guid (when user picked a sub-scheme) */
  unitGuid?: string;
  /** Full nav node from tree (preferred) */
  navNode?: {
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
  };
  filter?: string;
  /** max short-codes to expand to full OEM (default 80) */
  maxExpand?: number;
  /** if true — expand short codes to full OEM; if false — short names only */
  expand?: boolean;
  /** open all scheme variants (default true, up to 6) */
  allVariants?: boolean;
}): Promise<{
  unitTitle: string;
  groupId: string;
  parts: ElcatsUnitPartRow[];
  shortParts: Array<{ shortCode: string; name: string }>;
  diagram?: ElcatsDiagram;
  /** Alternative schemes inside this unit (clickable sub-nodes) */
  subUnits?: ElcatsSubUnit[];
  tookMs: number;
  error?: string;
}> {
  const started = Date.now();
  const brandPath = brandPathFromGroupUrl(params.groupUrl);
  const modelGuid =
    params.modelGuid || modelGuidFromGroupUrl(params.groupUrl) || "";
  const empty = (error?: string) => ({
    unitTitle: params.title,
    groupId: params.groupId,
    parts: [] as ElcatsUnitPartRow[],
    shortParts: [] as Array<{ shortCode: string; name: string }>,
    tookMs: Date.now() - started,
    error,
  });

  // ── Universal path (preferred): open discovered nav node ──
  // Mirror elcats UX: if unit has multiple schemes → return children only (user picks one).
  // Do NOT merge OEM from all schemes unless allVariants=true (explicit).
  try {
    const { loadCatalogTree, openNavNode } = await import("./elcats-engine");
    let node = params.navNode
      ? {
          id: params.navNode.id,
          title: params.navNode.title,
          args: [] as string[],
          fields: params.navNode.fields,
          action: params.navNode.action,
        }
      : null;
    if (!node) {
      const tree = await loadCatalogTree(params.groupUrl);
      node =
        tree.nodes.find((n) => n.id === params.groupId || n.title === params.title) ||
        tree.nodes.find((n) => n.title.includes(params.title.slice(0, 20))) ||
        null;
    }
    if (node) {
      // First open intermediate page without deep-merge
      const opened = await openNavNode({
        brandSlug: brandPath,
        groupUrl: params.groupUrl,
        node,
        deep: false,
        maxChildren: 20,
        maxOcr: params.maxExpand ?? 40,
      });

      const children = opened.children || [];
      // User selected a specific scheme (unitGuid = child nav id)
      if (params.unitGuid && children.length) {
        const child =
          children.find((c) => c.id === params.unitGuid) ||
          children.find((c) => c.fields.Unit === params.unitGuid) ||
          children.find((c) => (c.fields.Unit || "").includes(params.unitGuid!));
        if (child) {
          const sub = await openNavNode({
            brandSlug: brandPath,
            groupUrl: opened.pageUrl || params.groupUrl,
            node: child,
            deep: false,
            maxOcr: params.maxExpand ?? 40,
          });
          // Nested schemes again?
          const nested = sub.children || [];
          if (nested.length > 1 && !sub.parts.length) {
            return {
              unitTitle: child.title || params.title,
              groupId: params.groupId,
              parts: [],
              shortParts: [],
              diagram: sub.diagram
                ? { url: sub.diagram.url, width: sub.diagram.width, points: sub.diagram.points }
                : undefined,
              subUnits: nested.map((c) => ({
                modelGuid: c.fields.Model || "",
                unitGuid: c.id,
                title: c.title,
                navNode: { id: c.id, title: c.title, action: c.action, fields: c.fields },
              })),
              tookMs: Date.now() - started,
              error: "Выберите схему подраздела (как на elcats)",
            };
          }
          const parts: ElcatsUnitPartRow[] = sub.parts
            .filter((p) => !params.filter || matchesFilter(`${p.article} ${p.name}`, params.filter))
            .map((p) => ({
              article: p.article,
              name: p.name,
              shortCode: p.shortCode || "",
              qty: p.qty,
              options: p.options,
              unitTitle: child.title || params.title,
              groupId: params.groupId,
            }));
          return {
            unitTitle: child.title || params.title,
            groupId: params.groupId,
            parts,
            shortParts: parts.map((p) => ({ shortCode: p.shortCode || p.article, name: p.name })),
            diagram: sub.diagram
              ? { url: sub.diagram.url, width: sub.diagram.width, points: sub.diagram.points }
              : undefined,
            subUnits: children.map((c) => ({
              modelGuid: c.fields.Model || "",
              unitGuid: c.id,
              title: c.title,
              navNode: { id: c.id, title: c.title, action: c.action, fields: c.fields },
            })),
            tookMs: Date.now() - started,
            error: parts.length ? undefined : sub.error,
          };
        }
      }

      // Multiple child nodes and no OEM on this page → user must pick (elcats parity)
      // Also when unitGuid was set but didn't match any child (stale/self id)
      const unitGuidMatched =
        !!params.unitGuid &&
        children.some(
          (c) =>
            c.id === params.unitGuid ||
            c.fields.Unit === params.unitGuid ||
            (c.fields.Unit || "").includes(params.unitGuid!)
        );
      if (
        children.length > 1 &&
        params.allVariants !== true &&
        !opened.parts.length &&
        (!params.unitGuid || !unitGuidMatched)
      ) {
        return {
          unitTitle: params.title,
          groupId: params.groupId,
          parts: [],
          shortParts: [],
          diagram: opened.diagram
            ? { url: opened.diagram.url, width: opened.diagram.width, points: opened.diagram.points }
            : undefined,
          subUnits: children.map((c, i) => ({
            modelGuid: c.fields.Model || "",
            unitGuid: c.id,
            title: c.title.trim() || `${params.title} · схема ${i + 1}`,
            navNode: { id: c.id, title: c.title, action: c.action, fields: c.fields },
          })),
          tookMs: Date.now() - started,
          error: "Выберите схему узла (как на elcats) — затем откроются OEM-коды",
        };
      }

      // Single child scheme → open it automatically
      if (children.length === 1 && !opened.parts.length) {
        const only = children[0]!;
        const sub = await openNavNode({
          brandSlug: brandPath,
          groupUrl: opened.pageUrl || params.groupUrl,
          node: only,
          deep: params.allVariants === true,
          maxOcr: params.maxExpand ?? 40,
        });
        const parts: ElcatsUnitPartRow[] = sub.parts
          .filter((p) => !params.filter || matchesFilter(`${p.article} ${p.name}`, params.filter))
          .map((p) => ({
            article: p.article,
            name: p.name,
            shortCode: p.shortCode || "",
            qty: p.qty,
            options: p.options,
            unitTitle: only.title || params.title,
            groupId: params.groupId,
          }));
        return {
          unitTitle: only.title || params.title,
          groupId: params.groupId,
          parts,
          shortParts: parts.map((p) => ({ shortCode: p.shortCode || p.article, name: p.name })),
          diagram: sub.diagram
            ? { url: sub.diagram.url, width: sub.diagram.width, points: sub.diagram.points }
            : undefined,
          tookMs: Date.now() - started,
          error: parts.length ? undefined : sub.error,
        };
      }

      // Leaf parts page already
      const parts: ElcatsUnitPartRow[] = opened.parts
        .filter((p) => !params.filter || matchesFilter(`${p.article} ${p.name}`, params.filter))
        .map((p) => ({
          article: p.article,
          name: p.name,
          shortCode: p.shortCode || "",
          qty: p.qty,
          options: p.options,
          unitTitle: params.title,
          groupId: params.groupId,
        }));
      return {
        unitTitle: params.title,
        groupId: params.groupId,
        parts,
        shortParts: parts.map((p) => ({ shortCode: p.shortCode || p.article, name: p.name })),
        diagram: opened.diagram
          ? {
              url: opened.diagram.url,
              width: opened.diagram.width,
              points: opened.diagram.points,
            }
          : undefined,
        subUnits:
          children.length > 1
            ? children.map((c) => ({
                modelGuid: c.fields.Model || "",
                unitGuid: c.id,
                title: c.title,
                navNode: { id: c.id, title: c.title, action: c.action, fields: c.fields },
              }))
            : undefined,
        tookMs: Date.now() - started,
        error: opened.error,
      };
    }
  } catch {
    /* fall through to legacy */
  }

  if (!modelGuid) return empty("Нет Model GUID в OEM-каталоге");

  try {
    // ── Legacy Mercedes path (fallback) ──
    if (brandPath === "mercedes" || /^SA-/i.test(params.groupId)) {
      return await loadMercedesUnitParts(params, brandPath, modelGuid, started);
    }

    let partsPages: Array<{ url: string; html: string }> = [];
    let subUnits: ElcatsSubUnit[] | undefined;
    let unitPageUrl = "";

    // Direct sub-scheme
    if (params.unitGuid) {
      const pUrl =
        `${ELCATS}/${brandPath}/Parts.aspx?` +
        new URLSearchParams({
          Model: modelGuid,
          Unit: params.unitGuid,
          Title: " ",
        }).toString();
      const pp = await getHtml(pUrl, params.groupUrl);
      if (pp.ok) partsPages = [{ url: pp.finalUrl, html: pp.text }];
    } else {
      const unitUrl =
        `${ELCATS}/${brandPath}/Unit.aspx?` +
        new URLSearchParams({
          GroupId: params.groupId,
          Model: modelGuid,
          Title: params.title,
        }).toString();
      unitPageUrl = unitUrl;

      const unitPage = await getHtml(unitUrl, params.groupUrl);
      if (!unitPage.ok) {
        return empty(
          unitPage.text?.slice(0, 80)
            ? `Не удалось открыть узел EPC (HTTP)`
            : "Не удалось открыть узел EPC"
        );
      }

      // Followed redirect may land on Parts.aspx (single scheme)
      if (/Parts\.aspx/i.test(unitPage.finalUrl) || unitPage.text.includes('class="CNode"')) {
        partsPages = [{ url: unitPage.finalUrl, html: unitPage.text }];
      } else {
        const variants = parseUnitVariants(unitPage.text);
        subUnits = variants.map((v, i) => ({
          modelGuid: v.modelGuid,
          unitGuid: v.unitGuid,
          title: v.title.trim() && v.title.trim() !== " " ? v.title : `${params.title} · схема ${i + 1}`,
          thumbUrl: v.thumbUrl ? absElcatsUrl(v.thumbUrl, brandPath) : undefined,
        }));

        // Like elcats: multiple schemes → user must pick one (unless allVariants=true)
        if (variants.length > 1 && !params.unitGuid && params.allVariants !== true) {
          return {
            unitTitle: params.title,
            groupId: params.groupId,
            parts: [],
            shortParts: [],
            subUnits,
            tookMs: Date.now() - started,
            error: "Выберите схему узла (как на elcats) — затем откроются OEM-коды",
          };
        }

        const toOpen =
          params.unitGuid
            ? variants.filter((v) => v.unitGuid === params.unitGuid).slice(0, 1)
            : params.allVariants === true
              ? variants.slice(0, 6)
              : variants.slice(0, 1);
        for (const v of toOpen) {
          const pUrl =
            `${ELCATS}/${brandPath}/Parts.aspx?` +
            new URLSearchParams({
              Model: v.modelGuid,
              Unit: v.unitGuid,
              Title: " ",
            }).toString();
          const pp = await getHtml(pUrl, unitUrl);
          if (pp.ok && (pp.text.includes("CNode") || /Parts\.aspx/i.test(pp.finalUrl))) {
            partsPages.push({ url: pp.finalUrl, html: pp.text });
          }
        }
      }
    }

    if (!partsPages.length) {
      return {
        ...empty(
          subUnits?.length
            ? "Выберите схему узла (подразделы) ниже"
            : "В узле нет списка запчастей"
        ),
        subUnits,
      };
    }

    // Diagram from first parts page (main exploded view)
    const diagram = parseElcatsDiagram(partsPages[0]!.html, brandPath);

    // Merge short codes from all opened schemes
    const shortMap = new Map<string, string>();
    for (const pp of partsPages) {
      for (const s of parseShortParts(pp.html)) {
        if (!shortMap.has(s.shortCode)) shortMap.set(s.shortCode, s.name);
      }
    }
    let shortParts = [...shortMap.entries()].map(([shortCode, name]) => ({ shortCode, name }));
    if (params.filter?.trim()) {
      shortParts = shortParts.filter((s) =>
        matchesFilter(`${s.shortCode} ${s.name}`, params.filter)
      );
    }

    const expand = params.expand !== false;
    if (!expand) {
      return {
        unitTitle: params.title,
        groupId: params.groupId,
        parts: shortParts.map((s) => ({
          article: s.shortCode,
          name: s.name,
          shortCode: s.shortCode,
          unitTitle: params.title,
          groupId: params.groupId,
        })),
        shortParts,
        diagram,
        subUnits,
        tookMs: Date.now() - started,
      };
    }

    const maxExpand = params.maxExpand ?? 80;
    const toExpand = shortParts.slice(0, maxExpand);
    // Expand against each parts page that has viewstate (first page usually enough)
    const primary = partsPages[0]!;
    const vs = extractFormFields(primary.html);

    const expandedLists = await mapPool(toExpand, 6, async (s) => {
      let rows = await expandShortCode(primary.url, vs, s.shortCode);
      // retry other variants if first has no applicability
      if (!rows.length && partsPages.length > 1) {
        for (const pp of partsPages.slice(1)) {
          const vs2 = extractFormFields(pp.html);
          rows = await expandShortCode(pp.url, vs2, s.shortCode);
          if (rows.length) break;
        }
      }
      if (!rows.length) {
        return [
          {
            article: s.shortCode,
            name: s.name,
            shortCode: s.shortCode,
            unitTitle: params.title,
            groupId: params.groupId,
          } satisfies ElcatsUnitPartRow,
        ];
      }
      return rows.map(
        (r) =>
          ({
            article: r.article,
            name: r.name || s.name,
            shortCode: s.shortCode,
            qty: r.qty,
            dateFrom: r.period?.split(/\s*-\s*/)[0],
            dateTo: r.period?.split(/\s*-\s*/)[1],
            options: r.options,
            unitTitle: params.title,
            groupId: params.groupId,
          }) satisfies ElcatsUnitPartRow
      );
    });

    const byArt = new Map<string, ElcatsUnitPartRow>();
    for (const list of expandedLists) {
      for (const p of list) {
        const prev = byArt.get(p.article);
        if (!prev) byArt.set(p.article, p);
        else if (p.article.includes("-") && !prev.article.includes("-")) byArt.set(p.article, p);
      }
    }

    let parts = [...byArt.values()].filter((p, _i, arr) => {
      if (!/^S\d/i.test(p.article)) return true;
      const base = p.article.replace(/^S/i, "").replace(/-/g, "");
      return !arr.some((o) => !/^S\d/i.test(o.article) && o.article.replace(/-/g, "") === base);
    });

    // Drop short callouts (43855C) when full OEM expanded for same shortCode (43855-23000)
    const shortsWithFull = new Set(
      parts
        .filter(
          (p) =>
            p.shortCode &&
            p.article !== p.shortCode &&
            (p.article.includes("-") || p.article.replace(/[^A-Z0-9]/gi, "").length >= 10)
        )
        .map((p) => (p.shortCode || "").toUpperCase())
    );
    parts = parts.filter((p) => {
      const artU = p.article.toUpperCase();
      const shortU = (p.shortCode || "").toUpperCase();
      // pure short row when full exists
      if (shortU && artU === shortU && shortsWithFull.has(shortU)) return false;
      // short-looking article that is another row's shortCode
      if (
        !p.article.includes("-") &&
        p.article.length <= 8 &&
        parts.some(
          (o) =>
            (o.shortCode || "").toUpperCase() === artU &&
            o.article.toUpperCase() !== artU &&
            (o.article.includes("-") || o.article.length > p.article.length)
        )
      ) {
        return false;
      }
      return true;
    });

    parts.sort((a, b) => {
      const af = a.article.includes("-") ? 0 : 1;
      const bf = b.article.includes("-") ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name, "ru");
    });

    if (params.filter?.trim()) {
      parts = parts.filter((p) =>
        matchesFilter(`${p.article} ${p.name} ${p.shortCode}`, params.filter)
      );
    }

    return {
      unitTitle: params.title,
      groupId: params.groupId,
      parts,
      shortParts,
      diagram,
      subUnits: subUnits && subUnits.length > 1 ? subUnits : undefined,
      tookMs: Date.now() - started,
      error: parts.length ? undefined : shortParts.length ? undefined : "Нет позиций в узле",
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "EPC unit error");
  }
}

/**
 * Search parts across EPC units by name/code for this vehicle catalog.
 * Opens best-matching units and expands matching short-codes to full OEM.
 */
export async function searchElcatsParts(params: {
  groupUrl: string;
  query: string;
  rootId?: string;
  maxUnits?: number;
  maxExpandPerUnit?: number;
}): Promise<{
  query: string;
  parts: ElcatsUnitPartRow[];
  unitsTried: string[];
  tookMs: number;
  error?: string;
}> {
  const started = Date.now();
  const q = params.query.trim();
  if (q.length < 2) {
    return { query: q, parts: [], unitsTried: [], tookMs: 0, error: "Введите минимум 2 символа" };
  }

  const tree = await loadElcatsCatalogTree(params.groupUrl);
  if (tree.error) {
    return { query: q, parts: [], unitsTried: [], tookMs: Date.now() - started, error: tree.error };
  }

  let units = tree.units;
  if (params.rootId != null && params.rootId !== "") {
    units = units.filter((u) => u.rootId === params.rootId);
  }

  const tokens = expandSearchTokens(q);
  const wantsBrake = tokens.some((t) =>
    ["pad", "brake", "disc", "disk", "caliper", "lining"].includes(t)
  );
  const wantsFilter = tokens.some((t) =>
    ["filter", "oil", "air", "fuel", "cabin", "pollen"].includes(t)
  );
  const wantsSusp = tokens.some((t) =>
    ["shock", "strut", "spring", "arm", "hub", "bearing"].includes(t)
  );
  const wantsSteer = tokens.some((t) => ["steering", "tie", "rack"].includes(t));
  const wantsEngine = tokens.some((t) =>
    ["pump", "plug", "spark", "glow", "belt", "timing", "chain", "radiator"].includes(t)
  );

  // Rank units: title match + domain boost (колодки → оси/шасси, фильтр → двигатель…)
  const ranked = units
    .map((u) => {
      const blob = `${u.title} ${u.rootTitle || ""}`;
      const low = blob.toLowerCase();
      let s = 0;
      if (matchesFilter(blob, q)) s += 12;
      for (const t of tokens) {
        if (t.length >= 2 && low.includes(t)) s += 3;
      }
      if (wantsBrake && /шасси|ось|мост|тормоз|brake/i.test(blob)) s += 10;
      if (wantsBrake && /передн|задн|front|rear/i.test(blob)) s += 4;
      if (wantsFilter && /двигател|engine|фильтр|filter|масл|oil|воздуш|топлив/i.test(blob)) s += 10;
      if (wantsSusp && /шасси|амортиз|пружин|подвес|ступиц|рычаг/i.test(blob)) s += 8;
      if (wantsSteer && /рулев|шасси|насос гур|рейк/i.test(blob)) s += 8;
      if (wantsEngine && /двигател|engine|охлажд|грм|ремн|цепь/i.test(blob)) s += 8;
      return { u, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const pick = (
    ranked.length > 0
      ? ranked
      : units.map((u) => ({ u, s: 1 }))
  )
    .slice(0, params.maxUnits ?? 6)
    .map((x) => x.u);

  const unitsTried: string[] = [];
  const all: ElcatsUnitPartRow[] = [];

  for (const u of pick) {
    unitsTried.push(u.title);
    // Always pass filter so we expand only relevant short-codes (fast + precise)
    const res = await loadElcatsUnitParts({
      groupUrl: params.groupUrl,
      groupId: u.groupId,
      title: u.title,
      modelGuid: u.modelGuid,
      filter: q,
      maxExpand: params.maxExpandPerUnit ?? 40,
      expand: true,
    });
    const parts = res.parts.filter((p) =>
      matchesFilter(`${p.article} ${p.name} ${p.shortCode}`, q)
    );
    all.push(...parts);
  }

  const byArt = new Map<string, ElcatsUnitPartRow>();
  for (const p of all) {
    if (!byArt.has(p.article)) byArt.set(p.article, p);
  }

  return {
    query: q,
    parts: [...byArt.values()].slice(0, 80),
    unitsTried,
    tookMs: Date.now() - started,
  };
}
