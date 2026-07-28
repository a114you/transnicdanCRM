/**
 * Professional multi-strategy HTTP client for MD auto-parts sites.
 *
 * Layers (in order):
 * 1. Browser-like headers + cookie jar + session warm-up
 * 2. Per-host rate limit + retry/backoff
 * 3. Optional residential / HTTP proxy (PARTS_SCRAPER_PROXY or PARTS_PROXY_LIST)
 * 4. Managed unlock (ScrapingBee / custom PARTS_UNLOCK_URL / FlareSolverr)
 * 5. Optional curl binary fallback (better TLS on some hosts)
 *
 * Imperva (automall) / Cloudflare usually need layer 3 or 4 from a residential IP.
 */

import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciInit } from "undici";
import { spawn } from "node:child_process";
import {
  freeProxyEnabled,
  freeProxyPoolSnapshot,
  freeProxyStatus,
  markFreeProxyDead,
  nextFreeProxy,
  warmFreeProxyPool,
} from "./free-proxy";
import {
  ensureIpPool,
  ipRotateStatus,
  markIpDead,
  nextRotatedIp,
  warmIpRotate,
} from "./ip-rotate";
import { curlImpersonateFetch, hasCurlImpersonate } from "./curl-impersonate";

export interface FetchTextOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  cookies?: string;
  /** Force unlock service even if direct works */
  forceUnlock?: boolean;
  /** Skip warm-up GET to origin */
  skipWarmup?: boolean;
  /** Prefer curl binary (more browser-like TLS on macOS) */
  preferCurl?: boolean;
  retries?: number;
  /**
   * curl-impersonate only: follow redirects (default true).
   * Set false for login POSTs where 302 + Set-Cookie must be kept without re-POST.
   */
  followRedirects?: boolean;
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  blocked: boolean;
  strategy: string;
  cookies?: string;
}

// ── Browser profiles (rotate) ──────────────────────────────────────────────

const PROFILES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    secChUa: null as string | null,
    platform: null as string | null,
  },
];

function pickProfile() {
  return PROFILES[Math.floor(Math.random() * PROFILES.length)]!;
}

// ── Cookie jar ─────────────────────────────────────────────────────────────

const cookieJar = new Map<string, Map<string, string>>();

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function mergeCookies(origin: string, setCookie: string[] | null | undefined, extra?: string) {
  if (!cookieJar.has(origin)) cookieJar.set(origin, new Map());
  const jar = cookieJar.get(origin)!;
  if (extra) {
    for (const part of extra.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k && rest.length) jar.set(k.trim(), rest.join("=").trim());
    }
  }
  for (const raw of setCookie || []) {
    const pair = raw.split(";")[0];
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(origin: string, extra?: string): string | undefined {
  const jar = cookieJar.get(origin);
  const map = new Map<string, string>(jar ? [...jar] : []);
  if (extra) {
    for (const part of extra.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k && rest.length) map.set(k.trim(), rest.join("=").trim());
    }
  }
  if (!map.size) return extra || undefined;
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function setHostCookies(hostOrUrl: string, cookieString: string) {
  const origin = hostOrUrl.startsWith("http") ? originOf(hostOrUrl) : `https://${hostOrUrl}`;
  mergeCookies(origin, null, cookieString);
}

// ── Rate limit ─────────────────────────────────────────────────────────────

const lastHit = new Map<string, number>();
const MIN_GAP_MS = Number(process.env.PARTS_HOST_GAP_MS || 350);

async function throttle(origin: string) {
  const last = lastHit.get(origin) || 0;
  const wait = MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait + Math.floor(Math.random() * 120));
  lastHit.set(origin, Date.now());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Block detection ────────────────────────────────────────────────────────

export function isBlocked(status: number, text: string): boolean {
  if (status === 403 || status === 429 || status === 503) {
    // some sites return 403 for missing pages — check body
    const s = text.slice(0, 4000).toLowerCase();
    if (
      s.includes("incapsula") ||
      s.includes("captcha") ||
      s.includes("just a moment") ||
      s.includes("access denied") ||
      s.includes("cf-challenge") ||
      s.includes("request unsuccessful") ||
      s.includes("_incap_") ||
      text.length < 800
    ) {
      return true;
    }
    if (status === 429 || status === 503) return true;
  }
  const sample = text.slice(0, 3000).toLowerCase();
  return (
    sample.includes("incapsula") ||
    sample.includes("/_incapsula_resource") ||
    sample.includes("just a moment...") ||
    sample.includes("cf-browser-verification") ||
    sample.includes("attention required") ||
    sample.includes("enable javascript and cookies") ||
    (sample.includes("robots") && sample.includes("nofollow") && text.length < 500)
  );
}

// ── Proxy rotation ─────────────────────────────────────────────────────────

/** Reject docs placeholders like http://user:pass@host:port or http://... */
export function isValidProxyUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length < 12) return false;
  // explicit placeholders from .env.example / cautpiese.md
  if (/user:pass@host/i.test(s)) return false;
  if (/@host(:|\/|$)/i.test(s)) return false;
  if (/:\/\/\.\.\./.test(s) || s === "http://..." || s === "https://...") return false;
  if (/\b(example|placeholder|your-proxy|proxy\.example)\b/i.test(s)) return false;
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    if (!u.hostname || u.hostname === "host" || u.hostname === "..." || u.hostname === "localhost" && !process.env.PARTS_ALLOW_LOCAL_PROXY) {
      // allow localhost only if explicitly opted in
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return process.env.PARTS_ALLOW_LOCAL_PROXY === "1";
      }
      if (u.hostname === "host" || u.hostname === "...") return false;
    }
    // port must be numeric if present
    if (u.port && !/^\d{2,5}$/.test(u.port)) return false;
    if (!u.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && u.hostname !== "localhost") {
      // bare words like "host" already rejected; allow docker service names only with opt-in
      if (!process.env.PARTS_ALLOW_LOCAL_PROXY) return false;
    }
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "socks5:";
  } catch {
    return false;
  }
}

function paidProxyList(): string[] {
  const multi =
    process.env.PARTS_PROXY_LIST?.split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean) || [];
  const single = process.env.PARTS_SCRAPER_PROXY?.trim();
  if (single) multi.unshift(single);
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) multi.push(httpsProxy);
  const valid = [...new Set(multi)].filter(isValidProxyUrl);
  // One-time warn for ignored junk (helps debug "Could not resolve proxy: ...")
  if (multi.length && !valid.length && !(globalThis as { __partsProxyWarned?: boolean }).__partsProxyWarned) {
    (globalThis as { __partsProxyWarned?: boolean }).__partsProxyWarned = true;
    console.warn(
      "[parts/http] PARTS_SCRAPER_PROXY / PARTS_PROXY_LIST look like placeholders — ignored. Use a real proxy or remove the vars."
    );
  }
  return valid;
}

function proxyList(): string[] {
  const paid = paidProxyList();
  if (paid.length) return paid;
  if (freeProxyEnabled()) {
    warmIpRotate();
    warmFreeProxyPool();
    return freeProxyPoolSnapshot();
  }
  return [];
}

/** True when paid proxy OR free/rotate pool is active */
export function hasConfiguredProxy(): boolean {
  if (paidProxyList().length > 0) return true;
  if (freeProxyEnabled()) {
    warmIpRotate();
    return true;
  }
  return false;
}

/** Sync peek — prefer async nextProxyAsync for real rotation */
function nextProxy(): string | undefined {
  // Fire-and-forget ensure pool
  warmIpRotate();
  // paid list strict round-robin
  const paid = paidProxyList();
  if (paid.length) {
    // use rotated index via ip-rotate paid-first path
    return paid[Math.floor(Math.random() * paid.length)];
  }
  return undefined;
}

/**
 * NEW IP every call (when PARTS_ROTATE_IP=1, default).
 * Paid list + free public proxies, skip last-used IPs.
 */
export async function nextProxyAsync(): Promise<string | undefined> {
  await ensureIpPool();
  const ip = await nextRotatedIp();
  if (ip) return ip;
  // fallback legacy free pool
  if (freeProxyEnabled()) {
    warmFreeProxyPool();
    return nextFreeProxy();
  }
  return undefined;
}

export {
  freeProxyStatus,
  markFreeProxyDead,
  warmFreeProxyPool,
  ipRotateStatus,
  warmIpRotate,
  markIpDead,
};

function dispatcherFor(proxyUrl?: string) {
  if (!proxyUrl) return undefined;
  try {
    return new ProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

// ── Unlock services ────────────────────────────────────────────────────────

async function fetchViaScrapingBee(url: string, timeoutMs: number): Promise<FetchTextResult | null> {
  const key = process.env.SCRAPINGBEE_API_KEY?.trim() || process.env.PARTS_SCRAPINGBEE_KEY?.trim();
  if (!key) return null;

  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: process.env.PARTS_SCRAPINGBEE_JS === "0" ? "false" : "true",
    premium_proxy: "true",
    country_code: process.env.PARTS_SCRAPINGBEE_COUNTRY || "md",
    block_resources: "false",
  });
  // stealth for WAF sites
  if (process.env.PARTS_SCRAPINGBEE_STEALTH !== "0") {
    params.set("stealth_proxy", "true");
  }

  const apiUrl = `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
  try {
    const res = await undiciFetch(apiUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "text/html,*/*" },
    });
    const text = await res.text();
    const blocked = isBlocked(res.status, text);
    return {
      ok: res.ok && !blocked && text.length > 400,
      status: res.status,
      text,
      finalUrl: url,
      blocked,
      strategy: "scrapingbee",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: err instanceof Error ? err.message : "ScrapingBee error",
      finalUrl: url,
      blocked: true,
      strategy: "scrapingbee",
    };
  }
}

async function fetchViaUnlockPrefix(url: string, timeoutMs: number): Promise<FetchTextResult | null> {
  const unlock = process.env.PARTS_UNLOCK_URL?.trim();
  if (!unlock) return null;
  const apiUrl = unlock.includes("{url}")
    ? unlock.replace("{url}", encodeURIComponent(url))
    : `${unlock}${encodeURIComponent(url)}`;
  try {
    const res = await undiciFetch(apiUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const blocked = isBlocked(res.status, text);
    return {
      ok: res.ok && !blocked && text.length > 400,
      status: res.status,
      text,
      finalUrl: url,
      blocked,
      strategy: "unlock_url",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: err instanceof Error ? err.message : "Unlock error",
      finalUrl: url,
      blocked: true,
      strategy: "unlock_url",
    };
  }
}

async function fetchViaFlareSolverr(url: string, timeoutMs: number): Promise<FetchTextResult | null> {
  const base = process.env.FLARESOLVERR_URL?.trim() || process.env.PARTS_FLARESOLVERR_URL?.trim();
  if (!base) return null;
  try {
    const res = await undiciFetch(base.replace(/\/$/, "") + "/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: Math.min(timeoutMs, 60000),
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
    const data = (await res.json()) as {
      status?: string;
      solution?: { status?: number; response?: string; url?: string; cookies?: Array<{ name: string; value: string }> };
    };
    if (data.status !== "ok" || !data.solution?.response) {
      return {
        ok: false,
        status: data.solution?.status || 0,
        text: "FlareSolverr failed",
        finalUrl: url,
        blocked: true,
        strategy: "flaresolverr",
      };
    }
    const origin = originOf(url);
    if (data.solution.cookies?.length) {
      const cstr = data.solution.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      mergeCookies(origin, null, cstr);
    }
    const text = data.solution.response;
    const status = data.solution.status || 200;
    const blocked = isBlocked(status, text);
    return {
      ok: !blocked && text.length > 400,
      status,
      text,
      finalUrl: data.solution.url || url,
      blocked,
      strategy: "flaresolverr",
      cookies: cookieHeader(origin),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: err instanceof Error ? err.message : "FlareSolverr error",
      finalUrl: url,
      blocked: true,
      strategy: "flaresolverr",
    };
  }
}

// ── curl fallback (SecureTransport / system TLS) ───────────────────────────

function curlFetch(url: string, opts: { method?: string; headers?: Record<string, string>; cookie?: string; timeoutMs: number; proxy?: string }): Promise<FetchTextResult> {
  return new Promise((resolve) => {
    // Body only on stdout; status/url via -w. Do NOT use -D - (mixes headers into body).
    const args = [
      "-sS",
      "-L",
      "--compressed",
      "--max-time",
      String(Math.ceil(opts.timeoutMs / 1000)),
      "-w",
      "\n__CURL_STATUS__:%{http_code}\n__CURL_URL__:%{url_effective}\n",
      "-A",
      opts.headers?.["User-Agent"] || PROFILES[0]!.ua,
      // macOS libcurl often lacks brotli — avoid br
      "-H",
      "Accept-Encoding: gzip, deflate",
    ];
    if (opts.method && opts.method !== "GET") {
      args.push("-X", opts.method);
    }
    if (opts.cookie) {
      args.push("-b", opts.cookie);
    }
    if (opts.proxy) {
      args.push("-x", opts.proxy);
    }
    const hdrs = opts.headers || {};
    for (const [k, v] of Object.entries(hdrs)) {
      const kl = k.toLowerCase();
      if (kl === "user-agent" || kl === "cookie" || kl === "accept-encoding") continue;
      args.push("-H", `${k}: ${v}`);
    }
    args.push(url);

    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeoutMs + 2000);

    child.on("close", () => {
      clearTimeout(timer);
      const statusMatch = out.match(/__CURL_STATUS__:(\d+)/);
      const urlMatch = out.match(/__CURL_URL__:(.+)/);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      const body = out.replace(/\n__CURL_STATUS__:[\s\S]*$/, "");
      const blocked = isBlocked(status, body);
      resolve({
        ok: status >= 200 && status < 300 && !blocked && body.length > 200,
        status,
        text: body || err,
        finalUrl: urlMatch?.[1]?.trim() || url,
        blocked,
        strategy: "curl",
      });
    });
  });
}

// ── Core undici fetch ──────────────────────────────────────────────────────

async function rawFetch(
  url: string,
  opts: {
    method?: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    proxy?: string;
  }
): Promise<{ status: number; text: string; finalUrl: string; setCookie: string[] }> {
  const dispatcher = dispatcherFor(opts.proxy);
  // undici sometimes returns bare 302 (maxRedirections default can be 0 on some builds)
  let currentUrl = url;
  let method = opts.method || "GET";
  let body = opts.body;
  const allCookies: string[] = [];
  let lastStatus = 0;
  let lastText = "";
  let lastFinal = url;

  // Mutable cookie jar for multi-hop redirects (ASP.NET session on elcats Unit→Parts)
  const cookieMap = new Map<string, string>();
  const seed = opts.headers.Cookie || opts.headers.cookie;
  if (seed) {
    for (const part of seed.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) cookieMap.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  const cookieHdr = () =>
    cookieMap.size
      ? [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
      : undefined;

  for (let hop = 0; hop < 8; hop++) {
    const headers: Record<string, string> = { ...opts.headers };
    const c = cookieHdr();
    if (c) headers.Cookie = c;
    if (hop > 0) headers.Referer = lastFinal;

    const init: UndiciInit & { maxRedirections?: number } = {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      signal: AbortSignal.timeout(opts.timeoutMs),
      redirect: "manual",
      maxRedirections: 0,
      ...(dispatcher ? { dispatcher } : {}),
    };

    const res = await undiciFetch(currentUrl, init);
    const text = await res.text();
    const setCookie =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")!]
          : [];
    allCookies.push(...setCookie);
    for (const raw of setCookie) {
      const pair = raw.split(";")[0];
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq > 0) cookieMap.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    lastStatus = res.status;
    lastText = text;
    lastFinal = res.url || currentUrl;

    const isRedirect =
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308;
    const loc = res.headers.get("location");
    if (!isRedirect || !loc) break;

    try {
      currentUrl = new URL(loc, currentUrl).toString();
    } catch {
      break;
    }
    lastFinal = currentUrl;
    // POST → GET on 302/303 (browser-like), keep method on 307/308
    if (res.status === 302 || res.status === 303 || res.status === 301) {
      method = "GET";
      body = undefined;
    }
  }

  return {
    status: lastStatus,
    text: lastText,
    finalUrl: lastFinal,
    setCookie: allCookies,
  };
}

function buildBrowserHeaders(url: string, extra?: Record<string, string>, cookie?: string): Record<string, string> {
  const profile = pickProfile();
  const origin = originOf(url);
  const headers: Record<string, string> = {
    "User-Agent": profile.ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,ro-RO,ro;q=0.8,en-US;q=0.7,en;q=0.6",
    // Avoid br: some Node/undici/curl stacks fail decompress on certain hosts (elcats)
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": extra?.Referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
  };
  if (profile.secChUa) {
    headers["Sec-Ch-Ua"] = profile.secChUa;
    headers["Sec-Ch-Ua-Mobile"] = "?0";
    if (profile.platform) headers["Sec-Ch-Ua-Platform"] = profile.platform;
  }
  if (cookie) headers.Cookie = cookie;
  if (extra) Object.assign(headers, extra);
  // Ensure referer host consistency
  if (!headers.Referer) {
    headers.Referer = origin + "/";
  }
  return headers;
}

async function warmSession(origin: string, cookieExtra?: string, proxy?: string) {
  try {
    await throttle(origin);
    const headers = buildBrowserHeaders(origin + "/", {}, cookieHeader(origin, cookieExtra));
    delete headers["Sec-Fetch-Site"];
    headers["Sec-Fetch-Site"] = "none";
    const res = await rawFetch(origin + "/", {
      headers,
      timeoutMs: 10000,
      proxy,
    });
    mergeCookies(origin, res.setCookie, cookieExtra);
  } catch {
    // warm-up is best-effort
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchText(opts: FetchTextOptions): Promise<FetchTextResult> {
  const timeoutMs = opts.timeoutMs ?? 14000;
  const retries = opts.retries ?? 2;
  const origin = originOf(opts.url);
  const envCookie =
    opts.cookies ||
    (origin.includes("automall.md") ? process.env.AUTOMALL_COOKIE?.trim() : undefined) ||
    process.env.PARTS_GLOBAL_COOKIE?.trim();

  // Force unlock path for known hard targets if configured
  if (opts.forceUnlock || process.env.PARTS_ALWAYS_UNLOCK === "1") {
    const bee = await fetchViaScrapingBee(opts.url, timeoutMs);
    if (bee?.ok) return bee;
    const unlock = await fetchViaUnlockPrefix(opts.url, timeoutMs);
    if (unlock?.ok) return unlock;
    const flare = await fetchViaFlareSolverr(opts.url, Math.max(timeoutMs, 45000));
    if (flare?.ok) return flare;
  }

  let last: FetchTextResult = {
    ok: false,
    status: 0,
    text: "No attempt",
    finalUrl: opts.url,
    blocked: false,
    strategy: "none",
  };

  /**
   * CRITICAL: open MD shops (proparts, enorm, …) must use DIRECT connection.
   * Free proxies only for WAF hosts or when PARTS_FORCE_PROXY=1.
   * Forcing free proxies on every request killed all suppliers (0 results).
   */
  const wafHost =
    /automall\.md|alvadi\.md|agropiese|fixbox|cloudflare/i.test(opts.url) ||
    opts.forceUnlock === true;
  const forceProxy = process.env.PARTS_FORCE_PROXY === "1";
  const useIpRotate =
    forceProxy ||
    (wafHost &&
      process.env.PARTS_ROTATE_IP !== "0" &&
      (freeProxyEnabled() || paidProxyList().length > 0));

  // Direct first (attempt 0), then optional IP rotation only for WAF
  const rotateExtra = useIpRotate
    ? Math.min(6, Number(process.env.PARTS_ROTATE_TRIES || 4))
    : 0;
  const maxAttempts = 1 + retries + rotateExtra;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // attempt 0 = direct (no proxy), unless FORCE_PROXY
    let proxy: string | undefined;
    if (forceProxy || (useIpRotate && attempt > 0)) {
      proxy = await nextProxyAsync();
    } else if (useIpRotate && attempt === 0 && process.env.PARTS_PROXY_FIRST === "1") {
      proxy = await nextProxyAsync();
    }

    if (!opts.skipWarmup && attempt === 0 && !proxy) {
      await warmSession(origin, envCookie, undefined);
    } else {
      await throttle(origin);
    }

    const cookie = cookieHeader(origin, envCookie);
    const headers = buildBrowserHeaders(opts.url, opts.headers, cookie);
    if (opts.method === "POST") {
      headers["Sec-Fetch-Mode"] = "cors";
      headers["Sec-Fetch-Dest"] = "empty";
    }

    // curl-impersonate: direct first (fast), proxy only on WAF retries
    if (
      hasCurlImpersonate() &&
      (opts.preferCurl ||
        wafHost ||
        process.env.PARTS_CURL_IMPERSONATE === "1")
    ) {
      try {
        const followRedirects = opts.followRedirects !== false;
        const ci = await curlImpersonateFetch({
          url: opts.url,
          method: opts.method,
          headers: { ...headers, ...opts.headers },
          body: opts.body,
          cookies: cookie || envCookie,
          timeoutMs,
          proxy,
          followRedirects,
        });
        // CRITICAL: merge Set-Cookie into jar (Laravel CSRF needs session from GET login)
        if (ci.setCookie?.length) {
          mergeCookies(origin, ci.setCookie, envCookie);
        }
        const blocked = isBlocked(ci.status, ci.text);
        const redirectOk =
          !followRedirects && ci.status >= 300 && ci.status < 400;
        last = {
          ok:
            !blocked &&
            (redirectOk || (ci.ok && ci.text.length > 200)),
          status: ci.status,
          text: ci.text,
          finalUrl: ci.finalUrl,
          blocked,
          strategy: proxy
            ? `${ci.strategy}+ip#${attempt}`
            : `${ci.strategy}#${attempt}`,
          cookies: cookieHeader(origin),
        };
        if (last.ok) return last;
        if (proxy && (blocked || ci.status === 403 || ci.status === 0)) {
          markIpDead(proxy);
          markFreeProxyDead(proxy);
        }
      } catch {
        if (proxy) {
          markIpDead(proxy);
          markFreeProxyDead(proxy);
        }
      }
    }

    // undici direct / proxy
    try {
      const res = await rawFetch(opts.url, {
        method: opts.method,
        headers,
        body: opts.body,
        timeoutMs,
        proxy,
      });
      mergeCookies(origin, res.setCookie, envCookie);
      const blocked = isBlocked(res.status, res.text);
      const okHttp = res.status >= 200 && res.status < 300;
      last = {
        ok: okHttp && !blocked && res.text.length > 200,
        status: res.status,
        text: res.text,
        finalUrl: res.finalUrl,
        blocked,
        strategy: proxy ? `undici+ip#${attempt}` : `undici#${attempt}`,
        cookies: cookieHeader(origin),
      };
      if (last.ok) return last;
      if (proxy && (blocked || res.status === 403 || res.status === 0)) {
        markIpDead(proxy);
        markFreeProxyDead(proxy);
      }
    } catch (err) {
      if (proxy) {
        markIpDead(proxy);
        markFreeProxyDead(proxy);
      }
      last = {
        ok: false,
        status: 0,
        text: err instanceof Error ? err.message : "Network error",
        finalUrl: opts.url,
        blocked: /abort|timeout/i.test(String(err)),
        strategy: `undici_err#${attempt}`,
      };
    }

    // system curl
    if (opts.preferCurl || last.blocked || !last.ok) {
      try {
        const curlRes = await curlFetch(opts.url, {
          method: opts.method,
          headers,
          cookie,
          timeoutMs,
          proxy,
        });
        last = {
          ...curlRes,
          strategy: proxy ? `${curlRes.strategy}+ip#${attempt}` : `${curlRes.strategy}#${attempt}`,
        };
        if (curlRes.ok) return last;
        if (proxy && (curlRes.blocked || curlRes.status === 403)) {
          markIpDead(proxy);
          markFreeProxyDead(proxy);
        }
      } catch {
        if (proxy) {
          markIpDead(proxy);
          markFreeProxyDead(proxy);
        }
      }
    }

    // Only keep rotating if this host actually needs it and we still fail
    if (!useIpRotate) break;
    if (last.blocked || last.status === 403 || last.status === 429) {
      await sleep(100 + Math.random() * 200);
    }
  }

  // Unlock chain when blocked
  if (last.blocked || !last.ok) {
    const flare = await fetchViaFlareSolverr(opts.url, Math.max(timeoutMs, 50000));
    if (flare?.ok) return flare;

    const bee = await fetchViaScrapingBee(opts.url, Math.max(timeoutMs, 30000));
    if (bee?.ok) return bee;

    const unlock = await fetchViaUnlockPrefix(opts.url, Math.max(timeoutMs, 30000));
    if (unlock?.ok) return unlock;
  }

  return last;
}

/** Convenience: warm a host and return combined cookie string */
export async function prepareHost(url: string): Promise<string | undefined> {
  const origin = originOf(url);
  await warmSession(origin, process.env.AUTOMALL_COOKIE);
  return cookieHeader(origin);
}
