import type { SupplierSearchResult } from "../types";
import {
  defaultSearchSupplierIds,
  getSupplier,
  scrapableSuppliers,
  SUPPLIER_CATALOG,
  type SearchPhase,
} from "./catalog";
import { searchSupplier } from "./generic";

export type SupplierFn = (code: string) => Promise<SupplierSearchResult>;

// Core shops include large HTML (ENORM/APS ~1–2MB, AutoDoctor SSR). 10s was too tight.
const SUPPLIER_HARD_TIMEOUT_MS = Math.max(
  8000,
  Number(process.env.PARTS_SUPPLIER_TIMEOUT_MS || 16000)
);

/** DAAC often needs ~16–18s TTFB; default 16s hard-cap always loses the race. */
const SUPPLIER_TIMEOUT_MS: Record<string, number> = {
  daac: Math.max(
    SUPPLIER_HARD_TIMEOUT_MS,
    Number(process.env.PARTS_DAAC_TIMEOUT_MS || 24000)
  ),
  autoshina: Math.max(SUPPLIER_HARD_TIMEOUT_MS, 20000),
  allpiese: Math.max(SUPPLIER_HARD_TIMEOUT_MS, 20000),
  // AutoMall: PMR catalog mirror is usually <8s; leave headroom under race
  automall: Math.max(SUPPLIER_HARD_TIMEOUT_MS, Number(process.env.PARTS_AUTOMALL_TIMEOUT_MS || 20000)),
  niponauto: Math.max(SUPPLIER_HARD_TIMEOUT_MS, 22000),
  autodoctor: Math.max(SUPPLIER_HARD_TIMEOUT_MS, 20000),
};

function hardTimeoutFor(id: string): number {
  return SUPPLIER_TIMEOUT_MS[id] ?? SUPPLIER_HARD_TIMEOUT_MS;
}

function shellUrlFor(
  def: NonNullable<ReturnType<typeof getSupplier>>,
  code: string
): string | undefined {
  const q = encodeURIComponent(code.trim());
  if (def.searchUrl) return def.searchUrl.replace("{q}", q);
  return def.website || undefined;
}

export function enabledSuppliers(phase: SearchPhase = "all"): string[] {
  return defaultSearchSupplierIds(phase).filter((id) => {
    const s = getSupplier(id);
    return s && s.scrape !== "none";
  });
}

export function allSupplierIds(): string[] {
  return SUPPLIER_CATALOG.map((s) => s.id);
}

async function searchSupplierWithTimeout(
  def: NonNullable<ReturnType<typeof getSupplier>>,
  code: string
): Promise<SupplierSearchResult> {
  const started = Date.now();
  const limitMs = hardTimeoutFor(def.id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      searchSupplier(def, code),
      new Promise<SupplierSearchResult>((resolve) => {
        timer = setTimeout(() => {
          const url = shellUrlFor(def, code);
          resolve({
            supplier: def.id,
            supplierName: def.name,
            // ok:true with shell — UI shows link, not hard fail only
            ok: Boolean(url),
            error: `Таймаут ${limitMs}ms — сайт медленный; откройте поиск вручную`,
            durationMs: Date.now() - started,
            offers: url
              ? [
                  {
                    supplier: def.id,
                    supplierName: def.name,
                    brand: "—",
                    article: code.trim(),
                    name: `Открыть ${code.trim()} на ${def.name}`,
                    price: null,
                    currency: "MDL",
                    stock: "unknown",
                    url,
                    priceConfidence: "low",
                    isShell: true,
                  },
                ]
              : [],
          });
        }, limitMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Parallel search with concurrency limit + per-supplier hard timeout */
export async function searchAllSuppliers(
  code: string,
  only?: string[],
  phase: SearchPhase = "all"
): Promise<SupplierSearchResult[]> {
  const list = (only?.length ? only : enabledSuppliers(phase))
    .map((id) => getSupplier(id))
    .filter(Boolean) as NonNullable<ReturnType<typeof getSupplier>>[];

  // WAF phase: crawl gently (2 parallel max) to avoid bans
  const defaultConc = phase === "waf" ? 2 : 6;
  const maxConc = phase === "waf" ? 3 : 12;
  const concurrency = Math.max(
    1,
    Math.min(Number(process.env.PARTS_CONCURRENCY || defaultConc), maxConc)
  );
  const results: SupplierSearchResult[] = [];
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const current = list[idx++];
      if (!current) break;
      // small jitter between WAF hosts
      if (phase === "waf") {
        await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));
      }
      try {
        const r = await searchSupplierWithTimeout(current, code);
        // Never return empty — browser always has a search URL
        if (!r.offers?.length) {
          const url = shellUrlFor(current, code);
          if (url) {
            r.offers = [
              {
                supplier: current.id,
                supplierName: current.name,
                brand: "—",
                article: code.trim(),
                name: `Открыть ${code.trim()} на ${current.name}`,
                price: null,
                currency: "MDL",
                stock: "unknown",
                url,
                priceConfidence: "low",
                isShell: true,
              },
            ];
            r.ok = true;
            if (!r.error) r.error = "Нет карточек в HTML — прямая ссылка на поиск";
          }
        }
        results.push(r);
      } catch (err) {
        const url = shellUrlFor(current, code);
        results.push({
          supplier: current.id,
          supplierName: current.name,
          ok: Boolean(url),
          error: err instanceof Error ? err.message : "Ошибка",
          durationMs: 0,
          offers: url
            ? [
                {
                  supplier: current.id,
                  supplierName: current.name,
                  brand: "—",
                  article: code.trim(),
                  name: `Открыть ${code.trim()} на ${current.name}`,
                  price: null,
                  currency: "MDL",
                  stock: "unknown",
                  url,
                  priceConfidence: "low",
                  isShell: true,
                },
              ]
            : [],
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));

  // stable order by catalog priority
  const order = new Map(list.map((s, i) => [s.id, i]));
  results.sort((a, b) => (order.get(a.supplier) ?? 99) - (order.get(b.supplier) ?? 99));
  return results;
}

/**
 * Article query variants for MD shops (hyphen / compact / Mercedes spacing).
 * Search each unique form; callers merge offers.
 */
export function articleSearchVariants(code: string): string[] {
  const raw = code.trim();
  if (!raw) return [];
  const noSpace = raw.replace(/\s+/g, "");
  const compact = noSpace.replace(/[-\u2013\u2014]/g, "");
  const upper = noSpace.toUpperCase();
  // Mercedes A2044213581 → also try A204 421 35 81 style rarely used; keep compact primary
  const out = [raw, noSpace, compact, upper];
  if (/^A\d{10}$/i.test(compact)) {
    // A 204 421 35 81 common print form
    const a = compact.toUpperCase();
    out.push(`${a[0]}${a.slice(1, 4)} ${a.slice(4, 7)} ${a.slice(7, 9)} ${a.slice(9)}`);
  }
  return [...new Set(out.filter((s) => s.length >= 3))];
}

export { SUPPLIER_CATALOG, scrapableSuppliers, getSupplier };
