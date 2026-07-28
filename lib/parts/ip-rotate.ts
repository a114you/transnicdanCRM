/**
 * Dynamic IP rotation: every request → next proxy IP (never the same twice in a row).
 *
 * Sources:
 *  1) PARTS_PROXY_LIST / PARTS_SCRAPER_PROXY (paid / sticky list)
 *  2) Free public lists (ProxyScrape, Proxifly, Geonode) when PARTS_FREE_PROXY=1
 *
 * Env:
 *   PARTS_ROTATE_IP=1          force rotate every request (default: 1)
 *   PARTS_FREE_PROXY=1         use free lists (default: on if no paid)
 *   PARTS_FREE_PROXY_MAX=80    pool size
 *   PARTS_PROXY_LIST=http://ip:port,http://...
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

const FREE_SOURCES = [
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=8000&country=all&ssl=all&anonymity=elite",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=8000&country=all&ssl=all&anonymity=anonymous",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=8000&country=all",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/https/data.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
  "https://proxylist.geonode.com/api/proxy-list?limit=80&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps%2Csocks5",
  // extra free dumps (updated often)
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
];

type State = {
  pool: string[];
  dead: Set<string>;
  usedRecently: string[];
  idx: number;
  fetchedAt: number;
  refreshing?: Promise<void>;
};

const state: State = {
  pool: [],
  dead: new Set(),
  usedRecently: [],
  idx: 0,
  fetchedAt: 0,
};

function rotateEnabled(): boolean {
  const v = process.env.PARTS_ROTATE_IP?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true; // default ON
}

function freeEnabled(): boolean {
  const v = process.env.PARTS_FREE_PROXY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true" || v === "on") return true;
  return true;
}

function maxPool(): number {
  return Math.max(20, Math.min(Number(process.env.PARTS_FREE_PROXY_MAX || 80), 200));
}

function ttlMs(): number {
  // refresh free list often so IPs stay "new"
  return Math.max(30_000, Number(process.env.PARTS_FREE_PROXY_TTL_MS || 5 * 60_000));
}

function paidList(): string[] {
  const multi =
    process.env.PARTS_PROXY_LIST?.split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean) || [];
  const single = process.env.PARTS_SCRAPER_PROXY?.trim();
  if (single) multi.unshift(single);
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) multi.push(httpsProxy);
  return [...new Set(multi)]
    .map(normalizeProxy)
    .filter((p): p is string => Boolean(p))
    .filter((p) => !/user:pass@host|placeholder|example/i.test(p));
}

function normalizeProxy(line: string): string | null {
  let s = line.trim();
  if (!s || s.startsWith("#")) return null;
  if (s.includes(",")) s = s.split(",")[0]!.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(s)) return `http://${s}`;
  if (/^https?:\/\/.+:\d+/i.test(s)) {
    return s.replace(/^https:\/\//i, "http://");
  }
  if (/^socks5?:\/\//i.test(s)) return s;
  return null;
}

function parseGeonode(text: string): string[] {
  try {
    const j = JSON.parse(text) as {
      data?: Array<{ ip?: string; port?: string | number; protocols?: string[] }>;
    };
    const out: string[] = [];
    for (const row of j.data || []) {
      if (!row.ip || row.port == null) continue;
      const proto = (row.protocols || ["http"])[0] || "http";
      if (/socks5/i.test(proto)) out.push(`socks5://${row.ip}:${row.port}`);
      else out.push(`http://${row.ip}:${row.port}`);
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
      signal: AbortSignal.timeout(14_000),
      headers: {
        Accept: "*/*",
        "User-Agent": "Montatorul-IPRotate/1.0",
      },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (url.includes("geonode") || text.trimStart().startsWith("{")) {
      return parseGeonode(text);
    }
    return text
      .split(/\r?\n/)
      .map(normalizeProxy)
      .filter((p): p is string => Boolean(p));
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function refreshPool(): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    const collected: string[] = [...paidList()];
    if (freeEnabled()) {
      const batches = await Promise.all(FREE_SOURCES.map((s) => fetchSource(s)));
      for (const b of batches) collected.push(...b);
    }
    const uniq = shuffle(
      [...new Set(collected)].filter((p) => p && !state.dead.has(p))
    );
    // Keep large unprobed pool — probe kills free proxies too hard; fail at request time
    state.pool = uniq.slice(0, maxPool());
    state.fetchedAt = Date.now();
    state.idx = 0;
    if (process.env.PARTS_IP_ROTATE_LOG === "1") {
      console.info(
        `[ip-rotate] pool=${state.pool.length} dead=${state.dead.size} paid=${paidList().length}`
      );
    }
  })().finally(() => {
    state.refreshing = undefined;
  });
  return state.refreshing;
}

export async function ensureIpPool(): Promise<void> {
  const stale = !state.pool.length || Date.now() - state.fetchedAt > ttlMs();
  if (stale) await refreshPool();
  // if pool emptied by deaths, force refresh
  if (!state.pool.filter((p) => !state.dead.has(p)).length) {
    state.fetchedAt = 0;
    await refreshPool();
  }
}

/**
 * Next proxy for THIS request only — never same as previous request when possible.
 */
export async function nextRotatedIp(): Promise<string | undefined> {
  if (!rotateEnabled() && paidList().length === 0 && !freeEnabled()) {
    return undefined;
  }
  await ensureIpPool();

  const live = state.pool.filter((p) => !state.dead.has(p));
  if (!live.length) return undefined;

  // Prefer not reusing last few IPs
  const recent = new Set(state.usedRecently.slice(-8));
  let pick: string | undefined;
  for (let n = 0; n < live.length; n++) {
    const p = live[(state.idx + n) % live.length];
    if (p && !recent.has(p)) {
      pick = p;
      state.idx = (state.idx + n + 1) % live.length;
      break;
    }
  }
  if (!pick) {
    pick = live[state.idx % live.length];
    state.idx = (state.idx + 1) % live.length;
  }

  if (pick) {
    state.usedRecently.push(pick);
    if (state.usedRecently.length > 40) {
      state.usedRecently = state.usedRecently.slice(-40);
    }
  }
  return pick;
}

/** Sync peek (may be empty before first ensureIpPool) */
export function peekRotatedIp(): string | undefined {
  const live = state.pool.filter((p) => !state.dead.has(p));
  if (!live.length) return undefined;
  const p = live[state.idx % live.length];
  state.idx = (state.idx + 1) % Math.max(1, live.length);
  if (p) {
    state.usedRecently.push(p);
    if (state.usedRecently.length > 40) state.usedRecently = state.usedRecently.slice(-40);
  }
  return p;
}

export function markIpDead(proxyUrl: string | undefined) {
  if (!proxyUrl) return;
  state.dead.add(proxyUrl);
  state.pool = state.pool.filter((p) => p !== proxyUrl);
}

export function ipRotateStatus(): {
  rotate: boolean;
  pool: number;
  dead: number;
  last: string | null;
  ageMs: number;
} {
  return {
    rotate: rotateEnabled(),
    pool: state.pool.filter((p) => !state.dead.has(p)).length,
    dead: state.dead.size,
    last: state.usedRecently[state.usedRecently.length - 1] || null,
    ageMs: state.fetchedAt ? Date.now() - state.fetchedAt : -1,
  };
}

export function warmIpRotate(): void {
  void ensureIpPool();
}

/** Quick optional probe — only if PARTS_PROXY_PROBE=1 */
export async function probeIp(proxyUrl: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const agent = new ProxyAgent(proxyUrl);
    const res = await undiciFetch("https://httpbin.org/ip", {
      method: "GET",
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    try {
      await agent.close?.();
    } catch {
      /* */
    }
    return res.ok && /origin/i.test(text);
  } catch {
    return false;
  }
}
