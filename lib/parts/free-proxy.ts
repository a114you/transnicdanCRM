/**
 * Free public proxy pool (no signup, no paid tier).
 *
 * Sources (rotated, cached):
 *  - ProxyScrape free API
 *  - Proxifly GitHub raw HTTP list
 *  - Geonode free proxy API
 *
 * Truth: free open proxies are unstable and almost never beat Imperva/Cloudflare.
 * We still try them when PARTS_FREE_PROXY is on and no paid PARTS_SCRAPER_PROXY is set.
 *
 * Env:
 *   PARTS_FREE_PROXY=1|0     default: 1 (enabled when no paid proxy)
 *   PARTS_FREE_PROXY_MAX=40  max candidates kept after refresh
 *   PARTS_FREE_PROXY_TTL_MS  list cache TTL (default 12 min)
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

const SOURCES = [
  // elite/anonymous HTTP, short timeout filter
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=elite",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=anonymous",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/https/data.txt",
  "https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps&anonymityLevel=elite&anonymityLevel=anonymous",
];

type PoolState = {
  proxies: string[];
  fetchedAt: number;
  dead: Set<string>;
  refreshing?: Promise<void>;
};

const state: PoolState = {
  proxies: [],
  fetchedAt: 0,
  dead: new Set(),
};

function ttlMs(): number {
  return Math.max(60_000, Number(process.env.PARTS_FREE_PROXY_TTL_MS || 12 * 60_000));
}

function maxKeep(): number {
  return Math.max(5, Math.min(Number(process.env.PARTS_FREE_PROXY_MAX || 40), 100));
}

/** Explicit off: PARTS_FREE_PROXY=0. Default on when no paid proxy configured. */
export function freeProxyEnabled(): boolean {
  const v = process.env.PARTS_FREE_PROXY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  // default: enable free pool only if user did not set a real paid proxy
  const paid =
    process.env.PARTS_SCRAPER_PROXY?.trim() ||
    process.env.PARTS_PROXY_LIST?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim();
  // if paid looks like placeholder, still use free
  if (!paid) return true;
  if (/user:pass@host|placeholder|example/i.test(paid)) return true;
  return false;
}

function normalizeProxyLine(line: string): string | null {
  let s = line.trim();
  if (!s || s.startsWith("#") || s.startsWith("//")) return null;
  // strip CSV noise
  if (s.includes(",")) s = s.split(",")[0]!.trim();
  // ip:port
  if (/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(s)) return `http://${s}`;
  // protocol://ip:port
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/i.test(s)) return s.toLowerCase().startsWith("https://")
    ? s.replace(/^https/i, "http") // undici ProxyAgent: use http CONNECT proxy URL
    : s;
  if (/^socks5?:\/\//i.test(s)) return s;
  return null;
}

function parseGeonodeJson(text: string): string[] {
  try {
    const j = JSON.parse(text) as {
      data?: Array<{ ip?: string; port?: string | number; protocols?: string[] }>;
    };
    const out: string[] = [];
    for (const row of j.data || []) {
      if (!row.ip || !row.port) continue;
      const proto = (row.protocols || ["http"])[0] || "http";
      if (/sock/i.test(proto)) {
        out.push(`socks5://${row.ip}:${row.port}`);
      } else {
        out.push(`http://${row.ip}:${row.port}`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchSource(url: string): Promise<string[]> {
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "text/plain,application/json,*/*",
        "User-Agent": "Montatorul-PartsBot/1.0 (+local free-proxy pool)",
      },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (url.includes("geonode") || text.trimStart().startsWith("{")) {
      return parseGeonodeJson(text);
    }
    const lines = text.split(/\r?\n/).map(normalizeProxyLine).filter(Boolean) as string[];
    return lines;
  } catch {
    return [];
  }
}

/** Quick probe: can proxy reach a simple HTTPS endpoint within timeout? */
async function probeProxy(proxyUrl: string, timeoutMs = 4500): Promise<boolean> {
  try {
    const agent = new ProxyAgent(proxyUrl);
    const res = await undiciFetch("https://httpbin.org/ip", {
      method: "GET",
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    await agent.close?.();
    return res.ok && text.includes("origin");
  } catch {
    return false;
  }
}

async function refreshPool(): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    const collected: string[] = [];
    await Promise.all(
      SOURCES.map(async (src) => {
        const list = await fetchSource(src);
        collected.push(...list);
      })
    );

    // unique, shuffle lightly
    const uniq = [...new Set(collected)].filter((p) => !state.dead.has(p));
    for (let i = uniq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniq[i], uniq[j]] = [uniq[j]!, uniq[i]!];
    }

    // Probe a batch in parallel — keep only alive ones
    const candidates = uniq.slice(0, Math.min(60, uniq.length));
    const alive: string[] = [];
    const conc = 8;
    let idx = 0;
    async function worker() {
      while (idx < candidates.length && alive.length < maxKeep()) {
        const i = idx++;
        const p = candidates[i];
        if (!p) break;
        const ok = await probeProxy(p);
        if (ok) alive.push(p);
        else state.dead.add(p);
      }
    }
    await Promise.all(Array.from({ length: conc }, () => worker()));

    // If nothing probed OK (network blocked probes), keep unprobed sample as last resort
    state.proxies = alive.length
      ? alive.slice(0, maxKeep())
      : candidates.slice(0, Math.min(15, candidates.length));
    state.fetchedAt = Date.now();
    if (state.proxies.length) {
      console.info(
        `[parts/free-proxy] pool ready: ${state.proxies.length} free proxies` +
          (alive.length ? " (probed)" : " (unprobed fallback)")
      );
    } else {
      console.warn("[parts/free-proxy] no free proxies available from public lists");
    }
  })().finally(() => {
    state.refreshing = undefined;
  });
  return state.refreshing;
}

async function ensurePool(): Promise<string[]> {
  if (!freeProxyEnabled()) return [];
  const stale = Date.now() - state.fetchedAt > ttlMs();
  if (!state.proxies.length || stale) {
    await refreshPool();
  }
  return state.proxies.filter((p) => !state.dead.has(p));
}

let rr = 0;

/** Next free proxy URL (http://ip:port) or undefined */
export async function nextFreeProxy(): Promise<string | undefined> {
  const list = await ensurePool();
  if (!list.length) return undefined;
  // skip recently dead
  for (let n = 0; n < list.length; n++) {
    const p = list[(rr + n) % list.length];
    if (p && !state.dead.has(p)) {
      rr = (rr + n + 1) % list.length;
      return p;
    }
  }
  return undefined;
}

/** Sync peek for hasConfiguredProxy-style checks (may be empty until first refresh) */
export function freeProxyPoolSnapshot(): string[] {
  if (!freeProxyEnabled()) return [];
  return state.proxies.filter((p) => !state.dead.has(p));
}

export function markFreeProxyDead(proxyUrl: string) {
  if (!proxyUrl) return;
  state.dead.add(proxyUrl);
  state.proxies = state.proxies.filter((p) => p !== proxyUrl);
}

/** Kick off background refresh (non-blocking) */
export function warmFreeProxyPool(): void {
  if (!freeProxyEnabled()) return;
  void ensurePool();
}

export function freeProxyStatus(): {
  enabled: boolean;
  count: number;
  dead: number;
  ageMs: number;
} {
  return {
    enabled: freeProxyEnabled(),
    count: freeProxyPoolSnapshot().length,
    dead: state.dead.size,
    ageMs: state.fetchedAt ? Date.now() - state.fetchedAt : -1,
  };
}
