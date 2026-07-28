/**
 * Brand-agnostic elcats.ru EPC engine.
 *
 * Philosophy: elcats already knows the catalog layout per brand.
 * We do NOT maintain per-brand trees. We:
 *  1) POST VIN to the brand home (WMI → path is the only brand map we keep)
 *  2) Dynamically harvest ALL javascript:submit(...) + form.action from HTML
 *  3) Follow discovered ASP.NET form targets (Unit/SubGroup/Parts/…)
 *  4) Extract parts with multi-strategy (CNode+callback, Codes.ashx+OCR, plain tables)
 *
 * Adding a new brand on elcats = extend WMI map only (if missing).
 */

import { createHash } from "node:crypto";
import { fetchText } from "../http";

const ELCATS = "https://www.elcats.ru";

/** Stable unique id for nav nodes — collision-free across long common prefixes */
function createStableId(raw: string): string {
  return createHash("sha1").update(raw).digest("hex").slice(0, 20);
}

const UA = {
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate",
};

/** Minimal WMI → elcats folder. Only routing key — not layout logic. */
export const WMI_TO_ELCATS: Record<string, string> = {
  KNA: "kia", KNB: "kia", KNC: "kia", KND: "kia", KNE: "kia", KNF: "kia", KNJ: "kia",
  U5Y: "kia", U6Y: "kia", XWE: "kia", "3KP": "kia", "5XX": "kia", "5XY": "kia",
  KMH: "hyundai", KM8: "hyundai", KMF: "hyundai", KMC: "hyundai", TMA: "hyundai",
  Z94: "hyundai", "5NM": "hyundai", "5NP": "hyundai",
  WDB: "mercedes", WDD: "mercedes", WDC: "mercedes", WDF: "mercedes",
  W1K: "mercedes", W1N: "mercedes", W1V: "mercedes", WMX: "mercedes", "4JG": "mercedes",
  WBA: "bmw", WBS: "bmw", WBY: "bmw", WMW: "mini",
  WVW: "vw", WVG: "vw", WV1: "vw", WV2: "vw", "3VW": "vw",
  WAU: "audi", WUA: "audi", TRU: "audi", WA1: "audi",
  TMB: "skoda", VSS: "seat",
  VF1: "renault", VF2: "renault", VF3: "peugeot", VF7: "citroen",
  W0L: "opel", W0V: "opel",
  WF0: "ford", SFA: "ford", "1FA": "ford", "1FT": "ford", "1FM": "ford",
  YV1: "volvo", YV4: "volvo", SAJ: "jaguar", SAL: "landrover",
  "1C3": "chrysler", "1C4": "chrysler", "1J4": "chrysler",
  KPT: "ssangyong", JTD: "toyota", /* toyota may 404 — try anyway */
};

const BRAND_LABEL: Record<string, string> = {
  kia: "KIA", hyundai: "HYUNDAI", mercedes: "MERCEDES-BENZ", bmw: "BMW", mini: "MINI",
  vw: "VOLKSWAGEN", audi: "AUDI", skoda: "SKODA", seat: "SEAT", renault: "RENAULT",
  peugeot: "PEUGEOT", citroen: "CITROEN", opel: "OPEL", ford: "FORD", volvo: "VOLVO",
  jaguar: "JAGUAR", landrover: "LAND ROVER", chrysler: "CHRYSLER", ssangyong: "SSANGYONG",
  toyota: "TOYOTA",
};

export type ElcatsNavNode = {
  /** Opaque id for UI / API */
  id: string;
  title: string;
  /** Args as passed to submit(...) */
  args: string[];
  /** Discovered form field values for POST */
  fields: Record<string, string>;
  /** Target aspx page relative to brand */
  action: string;
  rootTitle?: string;
  parentId?: string;
};

export type ElcatsPart = {
  article: string;
  name: string;
  shortCode?: string;
  qty?: string;
  options?: string;
  unitTitle?: string;
};

export type ElcatsDiagram = {
  url: string;
  width?: number;
  points: Array<{ code: string; title: string; left: number; top: number; width: number; height: number }>;
};

// ── HTTP ───────────────────────────────────────────────────────────────────

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

function encodeForm(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`)
    .join("&");
}

function extractFormFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input([^>]+)>/gi)) {
    const tag = m[1] || "";
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    if (!name) continue;
    out[name] = tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? "";
  }
  return out;
}

async function getHtml(
  url: string,
  referer?: string
): Promise<{ ok: boolean; text: string; finalUrl: string }> {
  const res = await fetchText({
    url,
    timeoutMs: 30000,
    retries: 1,
    preferCurl: true,
    headers: { ...UA, Referer: referer || ELCATS + "/" },
  });
  return {
    ok: !!(res.ok && res.text && res.text.length > 400 && !res.blocked),
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
      ...UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ELCATS,
      Referer: referer || url,
    },
  });
  return {
    ok: !!(res.ok && res.text && res.text.length > 400 && !res.blocked),
    text: res.text || "",
    finalUrl: res.finalUrl || url,
  };
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));
  return out;
}

// ── Dynamic submit() discovery ─────────────────────────────────────────────

/** Parse all submit(a,b,c,...) calls — any arity */
export function extractSubmitCalls(html: string): Array<{ args: string[]; raw: string; index: number }> {
  const out: Array<{ args: string[]; raw: string; index: number }> = [];
  const re = /submit\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1] || "";
    // skip function definitions: submit(model, groupId
    if (/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*,/.test(raw) && !raw.includes("'") && !raw.includes('"')) continue;
    if (/type\s*,\s*param/.test(raw)) continue;
    const args = parseJsArgs(raw);
    if (!args.length) continue;
    // skip trivial
    if (args.every((a) => a === "" || a === "null" || a === "undefined" || a === "true" || a === "false")) continue;
    out.push({ args, raw, index: m.index ?? 0 });
  }
  return out;
}

function parseJsArgs(raw: string): string[] {
  const args: string[] = [];
  let cur = "";
  let inQ: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inQ) {
      if (ch === "\\" && i + 1 < raw.length) {
        cur += raw[i + 1];
        i++;
        continue;
      }
      if (ch === inQ) {
        inQ = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQ = ch;
      continue;
    }
    if (ch === ",") {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() || args.length) args.push(cur.trim());
  return args.map((a) => (a === "null" || a === "undefined" ? "" : a));
}

/** Discover form.action assigned inside function submit(...) */
export function discoverSubmitActions(html: string): Array<{
  arity: number;
  action: string;
  fieldOrder: string[];
}> {
  const results: Array<{ arity: number; action: string; fieldOrder: string[] }> = [];
  const fnRe = /function\s+submit\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(html))) {
    const params = m[1]!.split(",").map((p) => p.trim()).filter(Boolean);
    const body = m[2] || "";
    const action = body.match(/\.action\s*=\s*["']([^"']+)["']/)?.[1] || "";
    if (!action) continue;
    // Map .Field.value = paramName
    const fieldOrder: string[] = [];
    for (const p of params) {
      const assign = body.match(new RegExp(`\\.${p}\\s*=\\s*${p}|name=\\\\?"${p}\\\\?"|\\.${capitalize(p)}\\s*=`, "i"));
      // Better: find document.forms[1].XXX.value = param
      void assign;
    }
    // Extract hidden field names created in form.innerHTML
    const names = [...body.matchAll(/name=\\?["']([A-Za-z0-9_]+)\\?["']/g)].map((x) => x[1]!);
    const unique = [...new Set(names)];
    // Map params to fields by order of .value = param assignments
    const ordered: string[] = [];
    for (const p of params) {
      const fm = body.match(new RegExp(`forms\\[1\\]\\.(\\w+)\\.value\\s*=\\s*${p}`));
      if (fm) ordered.push(fm[1]!);
    }
    results.push({
      arity: params.length,
      action: action.replace(/\.aspx.*/i, (s) => s.split("?")[0] || s),
      fieldOrder: ordered.length ? ordered : unique,
    });
  }
  return results;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build POST fields for a submit call using discovered action metadata */
function fieldsForSubmit(
  args: string[],
  actions: Array<{ arity: number; action: string; fieldOrder: string[] }>,
  fallbackAction: string
): { action: string; fields: Record<string, string> } {
  const meta =
    actions.find((a) => a.arity === args.length) ||
    actions.find((a) => a.arity >= args.length) ||
    actions[0];
  const action = meta?.action || fallbackAction;
  const fieldOrder = meta?.fieldOrder?.length
    ? meta.fieldOrder
    : guessFieldOrder(args.length, action);
  const fields: Record<string, string> = {};
  for (let i = 0; i < fieldOrder.length && i < args.length; i++) {
    const fname = fieldOrder[i]!;
    const val = args[i] || "";
    if (val === "" && /null/i.test(args[i] ?? "")) continue;
    fields[fname] = val;
  }
  // Common aliases if empty
  if (!fields.Model && args[0] && /[0-9a-f\-]{8}/i.test(args[0])) fields.Model = args[0];
  if (!fields.Title && args.length) fields.Title = args[args.length - 1] || "";
  return { action, fields };
}

function guessFieldOrder(arity: number, action: string): string[] {
  const a = action.toLowerCase();
  if (a.includes("subgroup")) return ["Model", "Group", "Title"];
  if (a.includes("unit") && arity >= 4) return ["Model", "Group", "SubGroup", "Title"];
  if (a.includes("unit")) return ["GroupId", "Model", "Title"];
  if (a.includes("parts")) return ["Model", "Unit", "Title"];
  // Kia Group page: GroupId, Model, Title, root
  if (arity === 4) return ["GroupId", "Model", "Title", "Root"];
  if (arity === 3) return ["Model", "Group", "Title"];
  return ["Model", "Group", "Title"];
}

// ── Vehicle info (layout-agnostic) ─────────────────────────────────────────

export function extractVehicleInfo(html: string): {
  model?: string;
  modelCode?: string;
  engine?: string;
  productionDate?: string;
  modelYear?: string;
  transmission?: string;
  color?: string;
  trim?: string;
  raw: Record<string, string>;
} {
  const raw: Record<string, string> = {};

  // Header table: Модель | Дата | Двигатель …
  const headerMatch = html.match(/<tr[^>]*>\s*<td[^>]*>\s*Модель\s*<\/td>[\s\S]*?<\/tr>/i);
  if (headerMatch) {
    const headers = [...headerMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]!).toLowerCase()
    );
    const after = html.slice(html.indexOf(headerMatch[0]) + headerMatch[0].length);
    const dataRow = after.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1];
    if (dataRow) {
      const values = [...dataRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        stripTags(c[1]!).replace(/\s+/g, " ").trim()
      );
      for (let i = 0; i < headers.length && i < values.length; i++) {
        const h = headers[i]!;
        const v = values[i]!;
        if (!v || /посмотреть|закрыть/i.test(v)) continue;
        if (/модель/.test(h)) raw.model = v;
        else if (/дата|выпуск/.test(h)) raw.productionDate = v.match(/[\d./\-]{6,14}/)?.[0] || v;
        else if (/двигател/.test(h)) raw.engine = v;
        else if (/трансмисс|кпп/.test(h)) raw.transmission = v;
        else if (/цвет/.test(h)) raw.color = v;
        else if (/отделк/.test(h)) raw.trim = v;
      }
    }
  }

  // Label/value cells
  if (!raw.model) {
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1]!)
      );
      if (cells.length < 2) continue;
      const label = cells[0]!.toUpperCase();
      const value = cells.slice(1).join(" ").trim();
      if (!value || value.length > 180) continue;
      if (/^(МОДЕЛЬ|ДАТА|ДВИГАТЕЛЬ|ТРАНСМИССИЯ|КОД)/i.test(value) && value.length < 40) continue;
      if (/МОДЕЛЬ|MODEL/.test(label)) raw.model = value;
      else if (/^ДВИГАТЕЛЬ|ENGINE/.test(label)) raw.engine = value;
      else if (/ДАТА|DATE|ВЫПУСК/.test(label)) raw.productionDate = value.match(/[\d./\-]{6,14}/)?.[0] || value;
      else if (/ТРАНСМИСС|КПП|TRANSMISSION/.test(label)) raw.transmission = value;
    }
  }

  // Fallback from info legend block
  {
    const block = html.match(/Информация об автомобиле[\s\S]{0,8000}/i)?.[0] || "";
    const plain = stripTags(block);
    if (!raw.model) {
      const mb = plain.match(/(\d{3}\.\d{3})\s+([A-Z0-9][A-Z0-9 /.\-]{2,40})/i);
      if (mb) raw.model = `${mb[1]} ${mb[2]}`.trim();
      // Kia: CERATO 06 (2006-) [KEURPLD06]
      const kia = plain.match(
        /\b([A-Z][A-Z0-9 /.\-]{2,30}\s+\d{2}\s*\(\d{4}-?\)(?:\s*\[[A-Z0-9]+\])?)/i
      );
      if (kia) raw.model = kia[1]!.trim();
      const kia2 = plain.match(/\b(CERATO|SPORTAGE|SORENTO|RIO|CEED|SELTOS|PICANTO|SOUL|OPTIMA|STINGER|EV6)[^\n]{0,40}/i);
      if (!raw.model && kia2) raw.model = kia2[0]!.trim().slice(0, 60);
    }
    raw.productionDate ||= plain.match(/(\d{2}[./]\d{2}[./]\d{4})/)?.[1] || "";
    // Prefer real model over short junk (АКП, etc.)
    if (raw.model && raw.model.length <= 4 && plain.length > 20) {
      const better = plain.match(
        /\b([A-Z]{3,}[A-Z0-9 /.\-]{0,20}\s+\d{2}\s*\(\d{4})/i
      );
      if (better) raw.model = better[1]!.trim();
    }
  }

  let model = (raw.model || "").replace(/\s+/g, " ").trim();
  model = model.replace(/Дата\s*выпуска.*$/i, "").trim();
  if (/дата\s*выпуск|двигатель\s*трансмисси/i.test(model)) {
    model = model.split(/дата/i)[0]!.trim();
  }
  // Drop pure header junk
  if (/^(модель|акп|мкп|двигатель)$/i.test(model)) model = "";
  const modelCode = model.match(/\b(\d{3}\.\d{3})\b/)?.[1] || model.match(/\[([A-Z0-9]+)\]/)?.[1];
  const modelYear =
    raw.productionDate?.match(/(20\d{2})/)?.[1] || model.match(/\((20\d{2})/)?.[1];

  return {
    model: model || undefined,
    modelCode,
    engine: raw.engine?.slice(0, 60),
    productionDate: raw.productionDate,
    modelYear,
    transmission: raw.transmission?.slice(0, 50),
    color: raw.color?.slice(0, 80),
    trim: raw.trim?.slice(0, 80),
    raw,
  };
}

// ── Tree extraction (generic) ──────────────────────────────────────────────

export function extractNavTree(html: string, modelGuidHint?: string): {
  roots: Array<{ id: string; title: string }>;
  nodes: ElcatsNavNode[];
} {
  const actions = discoverSubmitActions(html);
  const calls = extractSubmitCalls(html);

  // Section headers for root grouping (any <b>…</b> followed by br/br)
  const sections: Array<{ title: string; index: number }> = [];
  for (const sm of html.matchAll(/<b[^>]*>([^<]{2,50})<\/b>\s*<br\s*\/?>\s*<br/gi)) {
    const title = stripTags(sm[1]!);
    if (/информац|группа\s*запчаст|закрыть/i.test(title)) continue;
    if (title.length < 2) continue;
    sections.push({ title, index: sm.index ?? 0 });
  }
  // ToggleNode roots (Kia)
  for (const tm of html.matchAll(/ToggleNode\('(\d+)'\)[^>]*>([^<]+)/gi)) {
    const title = stripTags(tm[2]!);
    if (!sections.some((s) => s.title === title)) {
      sections.push({ title, index: tm.index ?? 0 });
    }
  }

  const roots =
    sections.length > 0
      ? sections.map((s, i) => ({ id: String(i), title: s.title }))
      : [{ id: "0", title: "Каталог" }];

  const nodes: ElcatsNavNode[] = [];
  const seen = new Set<string>();

  for (const call of calls) {
    const args = call.args;
    // Navigation-like: has model guid OR group code + title
    const hasGuid = args.some((a) => /^[0-9a-f]{8}-[0-9a-f\-]{27}/i.test(a) || /;[0-9a-f\-]{36}/i.test(a));
    const hasTitle = args.some((a) => /[A-Za-zА-Яа-я]{3,}/.test(a) && a.length > 2 && a.length < 120);
    if (!hasTitle) continue;
    // skip price submits: submit('PcId','ru',model,'1')
    if (args.length >= 2 && /^(ru|en|ro)$/i.test(args[1] || "") && args[0] && args[0].length <= 12) continue;
    // skip model list submit('AMANTI') single alpha
    if (args.length === 1 && /^[A-Z0-9 /.\-]{2,40}$/i.test(args[0]!) && !hasGuid) continue;

    const title =
      [...args].reverse().find((a) => /[A-Za-zА-Яа-я]{3,}/.test(a) && a.length < 120) || args[args.length - 1] || "";
    const cleanTitle = stripTags(title).replace(/&nbsp;/g, " ").trim();
    if (!cleanTitle || /посмотреть|закрыть|null/i.test(cleanTitle)) continue;

    const { action, fields } = fieldsForSubmit(args, actions, guessDefaultAction(args));
    // Prefer Model from args
    if (modelGuidHint && !fields.Model) fields.Model = modelGuidHint;

    // Unique id MUST include title — truncating base64 of common prefix caused 50+
    // Mercedes units to share one id (UI opened the wrong navNode every click).
    const rawKey = `${action}|${args.join("|")}|${cleanTitle}`;
    if (seen.has(rawKey)) continue;
    seen.add(rawKey);
    // Stable short unique id (full hash — never truncate prefix of base64 payload)
    const id = createStableId(rawKey);

    let rootTitle = roots[0]?.title;
    let rootId = "0";
    for (let i = 0; i < sections.length; i++) {
      if (sections[i]!.index <= call.index) {
        rootTitle = sections[i]!.title;
        rootId = String(i);
      }
    }
    // Kia: last arg is root index
    if (args.length === 4 && /^\d+$/.test(args[3] || "")) {
      rootId = args[3]!;
      const tn = html.match(new RegExp(`ToggleNode\\('${rootId}'\\)[^>]*>([^<]+)`, "i"));
      if (tn) rootTitle = stripTags(tn[1]!);
    }

    nodes.push({
      id,
      title: cleanTitle,
      args,
      fields,
      action: action.endsWith(".aspx") ? action : `${action.replace(/\.aspx$/i, "")}.aspx`,
      rootTitle,
      parentId: rootId,
    });
  }

  // Ensure roots from nodes if empty sections
  const rootSet = new Map(roots.map((r) => [r.id, r]));
  for (const n of nodes) {
    if (n.parentId && !rootSet.has(n.parentId)) {
      rootSet.set(n.parentId, { id: n.parentId, title: n.rootTitle || n.parentId });
    }
  }

  return { roots: [...rootSet.values()], nodes };
}

function guessDefaultAction(args: string[]): string {
  // Mercedes-like: guid, "42", null, title
  if (args.length >= 3 && args[2] === "" && /^\d{2}$/.test(args[1] || "")) return "SubGroup.aspx";
  // Mercedes subgroup: guid, "42", "030", title
  if (args.length >= 4 && /^\d{2}$/.test(args[1] || "") && /^\d{2,4}$/.test(args[2] || "")) return "Unit.aspx";
  // Kia unit: "58-585", guid, title, "4"
  if (args.length >= 3 && /^\d{2}-[0-9A-Z]+$/i.test(args[0] || "")) return "Unit.aspx";
  return "Unit.aspx";
}

// ── Parts extraction (multi-strategy) ──────────────────────────────────────

export async function extractPartsFromHtml(
  html: string,
  pageUrl: string,
  brandPath: string,
  opts?: { maxOcr?: number; expandCallbacks?: boolean }
): Promise<{ parts: ElcatsPart[]; diagram?: ElcatsDiagram }> {
  const parts: ElcatsPart[] = [];
  const diagram = parseDiagram(html, brandPath);

  // Strategy 1: CNode short codes (Kia/Hyundai)
  const cnodes = [...html.matchAll(/class="CNode"[^>]*id="([^"]+)"[^>]*>\s*<b>\1<\/b>(?:&nbsp;|\s)*([^<]+)/gi)].map(
    (m) => ({ short: m[1]!, name: stripTags(m[2]!) })
  );
  if (cnodes.length && opts?.expandCallbacks !== false) {
    const vs = extractFormFields(html);
    const expanded = await mapPool(cnodes.slice(0, opts?.maxOcr ?? 50), 6, async (c) => {
      const rows = await expandCallback(pageUrl, vs, c.short);
      if (!rows.length) return [{ article: c.short, name: c.name, shortCode: c.short } as ElcatsPart];
      return rows.map((r) => ({
        article: r.article,
        name: r.name || c.name,
        shortCode: c.short,
        qty: r.qty,
        options: r.options,
      }));
    });
    for (const list of expanded) parts.push(...list);
  }

  // Strategy 2: Codes.ashx images (Mercedes etc.)
  if (!parts.length || html.includes("Codes.ashx")) {
    const slots = [
      ...html.matchAll(
        /Codes\.ashx\?Key=([^"'>\s&]+)[\s\S]{0,400}?<b>([^<]+)<\/b>(?:<br\s*\/?>\s*([^<]*))?/gi
      ),
    ].map((m) => ({
      key: decodeURIComponent(m[1]!.replace(/&amp;/g, "&")),
      name: stripTags(m[2]!),
      desc: stripTags(m[3] || ""),
    }));
    if (slots.length) {
      const ocrParts = await mapPool(slots.slice(0, opts?.maxOcr ?? 40), 3, async (s) => {
        const art = await ocrCodeKey(s.key);
        return {
          article: art || "—",
          name: s.desc ? `${s.name} — ${s.desc}` : s.name,
        } as ElcatsPart;
      });
      for (const p of ocrParts) {
        if (p.article && p.article !== "—") parts.push(p);
      }
    }
  }

  // Strategy 3: plain OEM in tables (any brand) — Mercedes Parts lists A-codes here
  if (parts.length < 3) {
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1]!)
      );
      if (cells.length < 2) continue;
      const art = normalizeArticle(cells[0] || "");
      if (!art) continue;
      const name = cells[1] || art;
      // skip UI noise
      if (/^цена$/i.test(name) || /^price$/i.test(name)) continue;
      if (/^NO0+$/i.test(art) && name.length < 4) continue;
      parts.push({ article: art, name, qty: cells[2] });
    }
  }

  // Strategy 4: Mercedes inline part names next to MapPoint / list blocks
  if (parts.length < 2) {
    for (const m of html.matchAll(
      />(A\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}|A\d{10}|N\d{10,}|[A-Z]{1,3}\d{8,})<[\s\S]{0,80}?>([^<]{4,120})</gi
    )) {
      const art = normalizeArticle(m[1] || "");
      const name = stripTags(m[2] || "");
      if (!art || art.length < 6 || !name || /^цена$/i.test(name)) continue;
      parts.push({ article: art, name });
    }
  }

  // Dedupe by article; drop short callouts when full OEM for same shortCode exists
  const by = new Map<string, ElcatsPart>();
  for (const p of parts) {
    const k = p.article.toUpperCase();
    const prev = by.get(k);
    if (!prev) by.set(k, p);
    else if (p.article.includes("-") && !prev.article.includes("-")) by.set(k, p);
  }
  let list = [...by.values()];
  const shortsWithFull = new Set(
    list
      .filter(
        (p) =>
          p.shortCode &&
          p.article !== p.shortCode &&
          (p.article.includes("-") || p.article.replace(/[^A-Z0-9]/gi, "").length >= 10)
      )
      .map((p) => (p.shortCode || "").toUpperCase())
  );
  list = list.filter((p) => {
    const artU = p.article.toUpperCase();
    const shortU = (p.shortCode || "").toUpperCase();
    if (shortU && artU === shortU && shortsWithFull.has(shortU)) return false;
    if (
      !p.article.includes("-") &&
      p.article.length <= 8 &&
      list.some(
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
  return { parts: list, diagram };
}

function normalizeArticle(raw: string): string | null {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  // Mercedes: A6394210012, A 639 421 00 12 compact
  if (/^A\d{10,12}$/.test(t)) return t;
  // MB hardware / standard: N910105010012, NO00000001139
  if (/^N[A-Z0-9]{8,}$/.test(t)) return t;
  if (/^\d{5}-[0-9A-Z]{4,8}$/.test(t)) return t;
  if (/^[A-Z]?\d{10,}$/.test(t)) return t;
  if (/^\d{5}[A-Z0-9\-]{3,}$/.test(t) && t.length >= 8) return t;
  // generic OEM-ish
  if (/^[A-Z0-9]{8,20}$/.test(t) && /\d/.test(t) && /[A-Z]/.test(t)) return t;
  return null;
}

function parseDiagram(html: string, brandPath: string): ElcatsDiagram | undefined {
  const imgM =
    html.match(/src="(\.\.\/CImage\.ashx\?[^"]+)"/i) ||
    html.match(/src="(\/?CImage\.ashx\?[^"]+)"/i);
  if (!imgM) return undefined;
  let rel = imgM[1]!.replace(/&amp;/g, "&");
  let url: string;
  if (rel.startsWith("http")) url = rel;
  else if (rel.startsWith("/")) url = `${ELCATS}${rel}`;
  else if (rel.startsWith("../")) url = `${ELCATS}/${rel.replace(/^\.\.\//, "")}`;
  else url = `${ELCATS}/${brandPath}/${rel}`;
  const width = Number(rel.match(/Width=(\d+)/i)?.[1] || 500) || 500;
  const points: ElcatsDiagram["points"] = [];
  for (const tag of html.matchAll(/class="MapPoint(?:New)?"[^>]*>/gi)) {
    const t = tag[0];
    const code = t.match(/\bno="([^"]*)"/i)?.[1] || "";
    const title = t.match(/\b(?:Title|title)="([^"]*)"/i)?.[1] || code;
    const style = t.match(/\bstyle="([^"]*)"/i)?.[1] || "";
    if (!code && /none\s*=\s*"True"/i.test(t)) continue;
    points.push({
      code: code || "?",
      title: title || "",
      left: Number(style.match(/left:\s*([\d.]+)px/i)?.[1] || 0),
      top: Number(style.match(/top:\s*([\d.]+)px/i)?.[1] || 0),
      width: Number(style.match(/width:\s*([\d.]+)px/i)?.[1] || 20),
      height: Number(style.match(/height:\s*([\d.]+)px/i)?.[1] || 14),
    });
  }
  return { url, width, points };
}

async function expandCallback(
  partsUrl: string,
  viewState: Record<string, string>,
  shortCode: string
): Promise<Array<{ article: string; name: string; qty?: string; options?: string }>> {
  const data = {
    ...viewState,
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
    preferCurl: true,
    headers: {
      ...UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: ELCATS,
      Referer: partsUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok || !res.text) return [];
  const html = res.text.replace(/^\d+\|[^<]*/, "");
  const out: Array<{ article: string; name: string; qty?: string; options?: string }> = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => stripTags(x[1]!));
    if (tds.length < 2) continue;
    const art = normalizeArticle(tds[0] || "");
    if (!art) continue;
    out.push({ article: art, name: tds[1] || art, qty: tds[2], options: tds[4] });
  }
  return out;
}

async function ocrCodeKey(key: string): Promise<string | null> {
  try {
    const url = `${ELCATS}/Codes.ashx?Key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `${ELCATS}/`,
        Accept: "image/png,image/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 40) return null;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(buf);
      const art = (text || "").replace(/\s+/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (art.length >= 8) return art;
      return null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function decodeVinUniversal(vinRaw: string): Promise<{
  vin: string;
  brandSlug: string;
  make: string;
  modelGuid: string;
  groupUrl: string;
  name: string;
  info: ReturnType<typeof extractVehicleInfo>;
  roots: Array<{ id: string; title: string }>;
  nodes: ElcatsNavNode[];
  tookMs: number;
  error?: string;
}> {
  const started = Date.now();
  const vin = vinRaw.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
  const wmi = vin.slice(0, 3);
  const brand = WMI_TO_ELCATS[wmi];
  if (!brand) {
    return {
      vin,
      brandSlug: "",
      make: "",
      modelGuid: "",
      groupUrl: "",
      name: "",
      info: { raw: {} },
      roots: [],
      nodes: [],
      tookMs: Date.now() - started,
      error: `WMI ${wmi} нет в карте elcats (добавьте 1 строку в WMI_TO_ELCATS)`,
    };
  }
  const make = BRAND_LABEL[brand] || brand.toUpperCase();
  const home = `${ELCATS}/${brand}/`;

  const page = await getHtml(home);
  if (!page.ok) {
    return {
      vin,
      brandSlug: brand,
      make,
      modelGuid: "",
      groupUrl: home,
      name: "",
      info: { raw: {} },
      roots: [],
      nodes: [],
      tookMs: Date.now() - started,
      error: "Elcats недоступен",
    };
  }

  const fields = extractFormFields(page.text);
  // Any field that looks like VIN
  const vinKey =
    Object.keys(fields).find((k) => /vin/i.test(k)) || "ctl00$cphMasterPage$txbVIN";
  const btnKey =
    Object.keys(fields).find((k) => /btnFindByVIN|FindByVIN|btn.*VIN/i.test(k)) ||
    "ctl00$cphMasterPage$btnFindByVIN";
  fields[vinKey] = vin;
  fields[btnKey] = fields[btnKey] || "Поиск";

  const result = await postHtml(home, fields, home);
  const groupUrl = result.finalUrl;
  const modelGuid =
    groupUrl.match(/Model=([0-9a-f\-]{36}(?:;[0-9a-f\-]{36})?)/i)?.[1] ||
    result.text.match(/Model=([0-9a-f\-]{36})/i)?.[1] ||
    "";

  if (!result.ok || !modelGuid) {
    return {
      vin,
      brandSlug: brand,
      make,
      modelGuid: "",
      groupUrl: home,
      name: "",
      info: { raw: {} },
      roots: [],
      nodes: [],
      tookMs: Date.now() - started,
      error: /не найден|not found/i.test(result.text)
        ? "VIN не найден в elcats"
        : "Elcats не вернул карточку авто",
    };
  }

  const info = extractVehicleInfo(result.text);
  const tree = extractNavTree(result.text, modelGuid);
  const name = [make, info.model, info.modelYear, info.engine, info.productionDate]
    .filter(Boolean)
    .join(" · ");

  const finalGroup =
    groupUrl.includes("Group.aspx")
      ? groupUrl
      : `${ELCATS}/${brand}/Group.aspx?Model=${modelGuid}`;

  return {
    vin,
    brandSlug: brand,
    make,
    modelGuid,
    groupUrl: finalGroup,
    name,
    info,
    roots: tree.roots,
    nodes: tree.nodes,
    tookMs: Date.now() - started,
  };
}

/**
 * Open any nav node by replaying discovered form POST/GET — brand-agnostic.
 */
export async function openNavNode(params: {
  brandSlug: string;
  groupUrl: string;
  node: ElcatsNavNode;
  /** If node leads to SubGroup, open all children parts */
  deep?: boolean;
  maxChildren?: number;
  maxOcr?: number;
}): Promise<{
  parts: ElcatsPart[];
  diagram?: ElcatsDiagram;
  children?: ElcatsNavNode[];
  pageUrl: string;
  tookMs: number;
  error?: string;
}> {
  const started = Date.now();
  const brand = params.brandSlug;
  const base = `${ELCATS}/${brand}/`;
  const action = params.node.action.replace(/^\//, "");
  const target = `${base}${action}`;

  // Prefer GET with query (works for most elcats pages) then POST
  const qs = new URLSearchParams(params.node.fields).toString();
  let page = await getHtml(`${target}?${qs}`, params.groupUrl);
  if (!page.ok || page.text.length < 800) {
    page = await postHtml(target, params.node.fields, params.groupUrl);
  }
  if (!page.ok) {
    return {
      parts: [],
      pageUrl: target,
      tookMs: Date.now() - started,
      error: "Не удалось открыть узел EPC",
    };
  }

  // If this page is intermediate (more submit links, few/no parts) — treat as children
  const childTree = extractNavTree(page.text, params.node.fields.Model);
  const childNodes = childTree.nodes.filter((n) => {
    // avoid self-loops
    return n.action.toLowerCase() !== action.toLowerCase() || n.title !== params.node.title;
  });

  const hasCodes = page.text.includes("Codes.ashx") || page.text.includes("CNode") || page.text.includes("CImage.ashx");
  const looksLikeParts = hasCodes || /Код детали|PAD KIT|article/i.test(page.text);

  if (looksLikeParts && (page.text.includes("Codes.ashx") || page.text.includes("CNode") || /Parts\.aspx/i.test(page.finalUrl))) {
    const extracted = await extractPartsFromHtml(page.text, page.finalUrl, brand, {
      maxOcr: params.maxOcr ?? 40,
    });
    return {
      parts: extracted.parts,
      diagram: extracted.diagram,
      children: childNodes.length > 1 ? childNodes : undefined,
      pageUrl: page.finalUrl,
      tookMs: Date.now() - started,
    };
  }

  // Intermediate: optionally deep-open children
  if (params.deep !== false && childNodes.length) {
    const maxC = params.maxChildren ?? 10;
    const allParts: ElcatsPart[] = [];
    let diagram: ElcatsDiagram | undefined;
    for (const ch of childNodes.slice(0, maxC)) {
      const sub = await openNavNode({
        brandSlug: brand,
        groupUrl: page.finalUrl,
        node: ch,
        deep: true,
        maxChildren: 6,
        maxOcr: params.maxOcr,
      });
      allParts.push(...sub.parts);
      if (!diagram && sub.diagram) diagram = sub.diagram;
    }
    const by = new Map(allParts.map((p) => [p.article, p]));
    return {
      parts: [...by.values()],
      diagram,
      children: childNodes,
      pageUrl: page.finalUrl,
      tookMs: Date.now() - started,
      error: by.size ? undefined : "Нет OEM в дочерних узлах",
    };
  }

  return {
    parts: [],
    children: childNodes,
    pageUrl: page.finalUrl,
    tookMs: Date.now() - started,
    error: childNodes.length ? "Выберите подраздел" : "Нет запчастей на странице",
  };
}

export async function loadCatalogTree(groupUrl: string): Promise<{
  roots: Array<{ id: string; title: string }>;
  nodes: ElcatsNavNode[];
  error?: string;
}> {
  const page = await getHtml(groupUrl, ELCATS + "/");
  if (!page.ok) return { roots: [], nodes: [], error: "Group page failed" };
  const modelGuid = groupUrl.match(/Model=([0-9a-f\-]{36})/i)?.[1];
  return extractNavTree(page.text, modelGuid);
}

export { ELCATS, BRAND_LABEL };
