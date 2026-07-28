/**
 * Catcar OEM catalog drill-down: vehicle catalog URL → groups → unit → OEM P/N.
 *
 * Used after VIN decode to get factory article codes for a service part type
 * (e.g. brake-pads → 58101-2FA21), then feed into MD multi-supplier price search.
 */

import { fetchText } from "../http";
import type { ServicePartType } from "./tecdoc-groups";
import { findPartType, findGroup } from "./tecdoc-groups";

const CATCAR = "https://www.catcar.info";

export interface CatcarOemPart {
  article: string;
  name: string;
  qty?: string;
  dateFrom?: string;
  dateTo?: string;
  options?: string;
  unitTitle?: string;
  unitUrl?: string;
  score: number;
}

export interface CatcarOemPartsResult {
  catalogUrl: string;
  partTypeId: string;
  articles: string[];
  parts: CatcarOemPart[];
  unitsScanned: string[];
  sourceUrls: string[];
  tookMs: number;
  error?: string;
}

function absUrl(href: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${CATCAR}${href}`;
  return href;
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function getHtml(url: string, referer?: string): Promise<string | null> {
  const res = await fetchText({
    url,
    timeoutMs: 25000,
    retries: 1,
    headers: {
      Referer: referer || CATCAR + "/",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok || res.blocked || !res.text) return null;
  return res.text;
}

/** Parse groups-parts__item tiles (root + subgroup units) */
export function parseCatcarGroupItems(html: string): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const re =
    /<a\s+class="groups-parts__item"\s+href="([^"]+)">[\s\S]*?<span class="groups-parts__title">([^<]+)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const title = m[2]!.trim();
    const url = absUrl(m[1]!);
    if (!title || !url || url.endsWith(".css") || url.endsWith(".js")) continue;
    out.push({ title, url });
  }
  return out;
}

/** Parse OEM parts table rows on a unit page */
export function parseCatcarPartsTable(html: string): CatcarOemPart[] {
  const parts: CatcarOemPart[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) =>
      stripTags(x[1]!)
    );
    if (tds.length < 5) continue;
    // Typical: [callout, p/n, date range, qty, name, options, ...]
    const articleRaw = tds[1] || "";
    const article = normalizeOemArticle(articleRaw);
    if (!article) continue;
    const dateRange = tds[2] || "";
    const [dateFrom, dateTo] = dateRange.split(/\s*-\s*/).map((s) => s.trim());
    parts.push({
      article,
      name: tds[4] || tds[0] || article,
      qty: tds[3] || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      options: tds[5] || undefined,
      score: 0,
    });
  }
  return parts;
}

/** Accept factory-style codes; drop pure hardware noise later via scoring */
function normalizeOemArticle(raw: string): string | null {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  // 58101-2FA21, 51712-2F100, A0004205900 (MB), 11427512345 (BMW)
  if (/^\d{5}-\d{5}$/.test(t)) return t;
  if (/^\d{5}-[0-9A-Z]{4,6}$/.test(t)) return t;
  if (/^[A-Z]?\d{10,}$/.test(t)) return t; // Mercedes/BMW long numeric
  if (/^\d{2,3}[A-Z]\d{6,}[A-Z]?$/.test(t)) return t;
  if (/^[A-Z0-9]{5,}-\d{5}[A-Z]?$/.test(t)) return t;
  // hardware with B suffix often fasteners — still valid but lower score
  if (/^\d{5}-\d{5}[A-Z]$/.test(t)) return t;
  if (/^\d{5}[A-Z]?-\d{5}[A-Z]?$/.test(t)) return t;
  return null;
}

/**
 * Keywords for matching unit titles + part names (ru/en OEM catalog labels).
 * Prefer specific part keywords; groupRoots narrow which root tiles to open first.
 */
const PART_TYPE_OEM_HINTS: Record<
  string,
  { roots: string[]; unit: string[]; part: string[]; exclude?: string[] }
> = {
  "brake-pads": {
    roots: ["шасси", "chassis", "тормоз", "brake"],
    unit: ["передний мост", "задняя ось", "front", "rear", "brake", "тормоз", "колод"],
    part: ["pad kit", "pad", "колод", "brake pad", "lining", "friction"],
    exclude: ["piston", "поршень", "bolt", "болт", "hose", "шланг", "spring only"],
  },
  "brake-discs": {
    roots: ["шасси", "chassis", "тормоз", "brake"],
    unit: ["передний мост", "задняя ось", "front", "rear", "disc", "диск"],
    part: ["disc", "disk", "диск-тормоз", "тормозн", "rotor"],
    exclude: ["pad", "колод", "hose", "cover", "крышка"],
  },
  "brake-master": {
    roots: ["шасси", "chassis", "тормоз"],
    unit: ["master", "cylinder", "главн", "boost", "цилиндр"],
    part: ["master", "cylinder", "главн", "boost", "цилиндр в сборе", "brake master"],
  },
  "brake-hoses": {
    roots: ["шасси", "chassis"],
    unit: ["hose", "шланг", "трубопровод", "brake"],
    part: ["hose-brake", "hose", "шланг", "тормоз"],
  },
  "brake-caliper": {
    roots: ["шасси", "chassis"],
    unit: ["передний мост", "задняя ось", "caliper", "суппорт", "brake assy"],
    part: ["brake assy", "caliper", "суппорт", "assy-fr", "assy-rr"],
  },
  "filter-oil": {
    roots: ["двигатель", "engine", "мотор"],
    unit: ["фильтр", "filter", "смаз", "oil", "лубрика", "картер", "маслян"],
    part: [
      "oil filter",
      "filter-oil",
      "filter assy-oil",
      "фильтр масл",
      "масляный фильтр",
      "маслян",
      "element-oil",
      "oil-filter",
    ],
  },
  "filter-air": {
    roots: ["двигатель", "engine", "кузов", "body"],
    unit: ["воздуш", "air filter", "filter", "воздухо", "воздушный фильтр"],
    part: [
      "air filter",
      "filter-air",
      "воздушный фильтр",
      "воздушн",
      "element-air",
      "фильтр двигат",
    ],
  },
  "filter-fuel": {
    roots: ["двигатель", "engine"],
    unit: ["топлив", "fuel", "filter"],
    part: ["fuel filter", "filter-fuel", "топливн"],
  },
  "filter-cabin": {
    roots: ["кузов", "body", "электр"],
    unit: ["салон", "cabin", "pollin", "климат", "filter"],
    part: ["cabin", "pollen", "салон", "climate filter"],
  },
  "shock-absorber": {
    roots: ["шасси", "chassis"],
    unit: ["амортиз", "стойка", "пружина", "shock", "strut", "spring"],
    part: ["shock", "strut", "амортиз", "absorber", "damper"],
  },
  "hub-bearing": {
    roots: ["шасси", "chassis"],
    unit: ["ступиц", "подшип", "hub", "bearing", "передний мост", "задняя"],
    part: ["hub", "bearing", "ступиц", "подшип", "bearing-front", "bearing-rear"],
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
    unit: ["рулев", "steering", "рейка", "механизм"],
    part: ["rack", "gear", "рейка", "steering gear", "механизм"],
  },
  "water-pump": {
    roots: ["двигатель", "engine"],
    unit: ["помп", "water", "охлажд", "pump", "cooling"],
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
    unit: ["свеч", "spark", "зажиг", "ignition"],
    part: ["spark plug", "свеча", "plug"],
  },
  "glow-plugs": {
    roots: ["двигатель", "engine"],
    unit: ["накал", "glow", "свеч"],
    part: ["glow", "накал", "свеча накал"],
  },
  "timing-belt": {
    roots: ["двигатель", "engine"],
    unit: ["грм", "timing", "ремень", "belt", "цепь"],
    part: ["timing belt", "ремень грм", "chain", "kit"],
  },
  "serpentine-belt": {
    roots: ["двигатель", "engine"],
    unit: ["ремень", "belt", "генератор", "привод"],
    part: ["v-ribbed", "belt", "ремень", "alternator belt"],
  },
  "clutch-kit": {
    roots: ["коробка", "transmission", "сцепл", "двигатель"],
    unit: ["сцепл", "clutch"],
    part: ["clutch", "сцепл", "disc", "cover", "kit"],
  },
  "wiper-blades": {
    roots: ["кузов", "body", "электр"],
    unit: ["стеклооч", "wiper", "щетк"],
    part: ["wiper", "blade", "щётка", "щетка"],
  },
  alternator: {
    roots: ["электр", "двигатель"],
    unit: ["генератор", "alternator"],
    part: ["alternator", "генератор"],
  },
  starter: {
    roots: ["электр", "двигатель"],
    unit: ["стартер", "starter"],
    part: ["starter", "стартер"],
  },
  turbo: {
    roots: ["двигатель", "engine"],
    unit: ["турбо", "turbo", "интеркул", "intercooler"],
    part: ["turbo", "турбин", "charger", "intercooler"],
  },
  injectors: {
    roots: ["двигатель", "engine"],
    unit: ["инжект", "форсун", "fuel", "injector"],
    part: ["injector", "форсун", "nozzle"],
  },
  "fuel-pump": {
    roots: ["двигатель", "engine"],
    unit: ["насос", "fuel", "топлив", "pump"],
    part: ["fuel pump", "pump", "насос", "топлив"],
  },
  "cv-joint": {
    roots: ["коробка", "шасси", "chassis"],
    unit: ["шрус", "привод", "drive", "cv", "пыльн"],
    part: ["cv joint", "drive shaft", "шрус", "boot", "пыльн"],
  },
  "ball-joint": {
    roots: ["шасси", "chassis"],
    unit: ["шаров", "ball", "рычаг", "arm"],
    part: ["ball joint", "шаров", "pivot"],
  },
  lambda: {
    roots: ["двигатель", "электр", "выпуск"],
    unit: ["лямбда", "lambda", "oxygen", "зонд"],
    part: ["lambda", "oxygen", "o2", "лямбда", "зонд"],
  },
  sensors: {
    roots: ["электр", "двигатель", "шасси"],
    unit: ["датчик", "sensor"],
    part: ["sensor", "датчик"],
  },
  "engine-mount": {
    roots: ["двигатель", "engine"],
    unit: ["подуш", "mount", "подвеска двигат"],
    part: ["mount", "подуш", "support", "engine mounting"],
  },
  headlight: {
    roots: ["кузов", "body", "электр"],
    unit: ["фар", "headlamp", "фонар", "lamp", "light"],
    part: ["headlamp", "headlight", "фар", "lamp"],
  },
};

function scoreText(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of keywords) {
    const kk = k.toLowerCase();
    if (t.includes(kk)) s += kk.length >= 5 ? 4 : 2;
  }
  return s;
}

function isFastenerName(name: string): boolean {
  return /болт|винт|гайка|шайба|шплинт|хомут|clip|bolt|nut|screw|washer|pin\b|заклеп/i.test(
    name
  );
}

/**
 * From vehicle OEM catalog URL, find parts matching a service part type.
 * Scans root groups → unit pages, scores part names, returns OEM articles.
 */
export async function findOemPartsForPartType(
  catalogUrl: string,
  partTypeId: string,
  options?: { maxUnits?: number; maxArticles?: number }
): Promise<CatcarOemPartsResult> {
  const started = Date.now();
  const maxUnits = options?.maxUnits ?? 6;
  const maxArticles = options?.maxArticles ?? 8;
  const partType = findPartType(partTypeId);
  const hints = PART_TYPE_OEM_HINTS[partTypeId];

  if (!catalogUrl || !catalogUrl.includes("catcar")) {
    return {
      catalogUrl,
      partTypeId,
      articles: [],
      parts: [],
      unitsScanned: [],
      sourceUrls: [],
      tookMs: Date.now() - started,
      error: "Нет OEM catalog URL (catcar)",
    };
  }
  if (!partType) {
    return {
      catalogUrl,
      partTypeId,
      articles: [],
      parts: [],
      unitsScanned: [],
      sourceUrls: [],
      tookMs: Date.now() - started,
      error: "Неизвестный тип детали",
    };
  }

  const group = partType.parentId ? findGroup(partType.parentId) : undefined;
  const roots = hints?.roots || [partType.nameRu, group?.nameRu || ""].filter(Boolean);
  const unitKw = hints?.unit || [partType.nameRu, partType.nameRo];
  const partKw = [
    ...(hints?.part || []),
    partType.nameRu,
    partType.nameRo,
    ...(partType.searchHints || []),
  ].filter(Boolean) as string[];
  const exclude = hints?.exclude || [];

  const sourceUrls: string[] = [catalogUrl];
  const unitsScanned: string[] = [];

  const rootHtml = await getHtml(catalogUrl);
  if (!rootHtml) {
    return {
      catalogUrl,
      partTypeId,
      articles: [],
      parts: [],
      unitsScanned,
      sourceUrls,
      tookMs: Date.now() - started,
      error: "OEM-каталог недоступен (сеть/блок)",
    };
  }

  const rootGroups = parseCatcarGroupItems(rootHtml);
  // Rank root groups
  const rankedRoots = rootGroups
    .map((g) => ({ ...g, score: scoreText(g.title, roots as string[]) }))
    .sort((a, b) => b.score - a.score);

  // Also always consider high-level matches even if score 0 — open top roots by default order
  const rootsToOpen = [
    ...rankedRoots.filter((r) => r.score > 0).slice(0, 3),
    ...rankedRoots.filter((r) => r.score === 0).slice(0, 2),
  ].slice(0, 4);

  type UnitCand = { title: string; url: string; score: number };
  const units: UnitCand[] = [];

  for (const root of rootsToOpen) {
    sourceUrls.push(root.url);
    const html = await getHtml(root.url, catalogUrl);
    if (!html) continue;
    const children = parseCatcarGroupItems(html);
    if (children.length) {
      for (const ch of children) {
        const sc = scoreText(ch.title, unitKw as string[]) + (root.score > 0 ? 1 : 0);
        units.push({ title: ch.title, url: ch.url, score: sc });
      }
    } else {
      // page itself may be a unit with parts
      units.push({ title: root.title, url: root.url, score: scoreText(root.title, unitKw as string[]) + 2 });
    }
  }

  units.sort((a, b) => b.score - a.score);
  // Prefer units with positive score; fill with a few chassis-wide units
  const pickUnits = [
    ...units.filter((u) => u.score > 0).slice(0, maxUnits),
    ...units.filter((u) => u.score === 0).slice(0, 2),
  ].slice(0, maxUnits);

  // If nothing scored, open a couple of high-traffic units by keyword in title list
  if (!pickUnits.length && units.length) {
    pickUnits.push(...units.slice(0, Math.min(3, units.length)));
  }

  const allParts: CatcarOemPart[] = [];

  for (const unit of pickUnits) {
    unitsScanned.push(unit.title);
    sourceUrls.push(unit.url);
    const html = await getHtml(unit.url, catalogUrl);
    if (!html) continue;
    // Nested groups? (rare)
    const nested = parseCatcarGroupItems(html);
    const pages: Array<{ title: string; url: string; html: string }> = [
      { title: unit.title, url: unit.url, html },
    ];
    if (nested.length && !parseCatcarPartsTable(html).length) {
      for (const n of nested.slice(0, 4)) {
        const h = await getHtml(n.url, unit.url);
        if (h) {
          pages.push({ title: n.title, url: n.url, html: h });
          unitsScanned.push(n.title);
        }
      }
    }

    for (const page of pages) {
      const rows = parseCatcarPartsTable(page.html);
      for (const p of rows) {
        let score = scoreText(`${p.name} ${p.options || ""}`, partKw);
        score += scoreText(page.title, unitKw as string[]) > 0 ? 1 : 0;
        if (exclude.some((e) => p.name.toLowerCase().includes(e.toLowerCase()))) {
          score -= 6;
        }
        if (isFastenerName(p.name)) score -= 8;
        // Strong boost for exact product line names
        if (/pad kit|disc brake|filter-oil|oil filter|колод|диск-тормоз/i.test(p.name)) {
          score += 6;
        }
        if (score < 1) continue;
        allParts.push({
          ...p,
          unitTitle: page.title,
          unitUrl: page.url,
          score,
        });
      }
    }
  }

  // Sort + dedupe by article — prefer primary product lines (PAD KIT, FILTER, DISC)
  allParts.sort((a, b) => b.score - a.score);
  const PRIMARY_RE =
    /pad kit|disc brake|disk brake|filter-oil|oil filter|air filter|fuel filter|фильтр масл|воздушный фильтр|топливный фильтр|диск-тормоз|колод(?!ок)|pad kit|амортиз|shock|strut|water pump|помп|thermostat|термостат|radiator|радиатор|свеч|spark|glow|clutch kit|сцепл|bearing|подшип|ступиц|hub|injector|форсун|turbo|турбин|lambda|лямбда|hose-brake|master cylinder|цилиндр в сборе-главн/i;
  const NOISE_RE =
    /болт|винт|гайка|шайба|шплинт|clip|bolt|nut|screw|washer|пружина колодок|распорка|чехл|сальник|заглушка|штуцер|втулка|направляющ|прокладка(?!.*фильтр)|поршень|piston|spring|аксессуар/i;

  // For pad/disc type — if we have true PAD KIT / DISC lines, drop hardware noise entirely
  const hasPadKit = allParts.some((p) => /pad kit/i.test(p.name));
  const hasDiscLine = allParts.some((p) => /диск-тормоз|disc brake(?!.*piston)|disk brake/i.test(p.name));

  const seen = new Set<string>();
  const primary: CatcarOemPart[] = [];
  const secondary: CatcarOemPart[] = [];
  for (const p of allParts) {
    const key = p.article.replace(/[^A-Z0-9]/gi, "");
    if (seen.has(key)) continue;
    seen.add(key);
    if (isFastenerName(p.name)) continue;
    if (NOISE_RE.test(p.name) && !/pad kit/i.test(p.name)) continue;
    if (partTypeId === "brake-pads" && hasPadKit && !/pad kit|колодк/i.test(p.name)) continue;
    if (partTypeId === "brake-discs" && hasDiscLine && !/диск-тормоз|disc brake|disk brake/i.test(p.name)) continue;
    if (PRIMARY_RE.test(p.name) || p.score >= 8) primary.push(p);
    else if (p.score >= 6) secondary.push(p);
  }
  const parts = [...primary, ...secondary].slice(0, maxArticles);

  return {
    catalogUrl,
    partTypeId,
    articles: parts.map((p) => p.article),
    parts,
    unitsScanned,
    sourceUrls: [...new Set(sourceUrls)],
    tookMs: Date.now() - started,
    error: parts.length
      ? undefined
      : "OEM-артикулы не найдены в каталоге — откройте EPC-узел вручную",
  };
}
