/**
 * Browser unlock for Cloudflare Turnstile / KvikShop CF walls (e.g. fixbox.md).
 *
 * Free reality:
 *  - Pure HTTP / curl-impersonate / free proxies cannot solve Turnstile.
 *  - Headless Chrome usually cannot either.
 *  - Headed Chrome + optional human click can obtain cf_clearance, then
 *    reuse cookies for ~20–30 min of plain HTTP scrapes.
 *
 * Env:
 *   PARTS_BROWSER_UNLOCK=1          enable browser unlock path
 *   PARTS_BROWSER_HEADLESS=0|1      default 0 (headed) for Turnstile
 *   PARTS_BROWSER_UNLOCK_MS=90000   max wait for challenge clear
 *   CHROME_PATH / PUPPETEER_EXECUTABLE_PATH
 *   FIXBOX_COOKIE / PARTS_CF_COOKIE  paste cookies from real browser
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".local");

export type UnlockResult = {
  ok: boolean;
  html: string;
  cookies: string;
  finalUrl: string;
  strategy: string;
  error?: string;
};

function chromePath(): string | null {
  const cands = [
    process.env.CHROME_PATH?.trim(),
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  for (const p of cands) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

export function browserUnlockEnabled(): boolean {
  return process.env.PARTS_BROWSER_UNLOCK === "1" || process.env.PARTS_BROWSER_UNLOCK === "true";
}

function cookieCachePath(host: string) {
  const safe = host.replace(/[^a-z0-9.-]/gi, "_");
  return path.join(CACHE_DIR, `cf-cookies-${safe}.json`);
}

type CookieCache = { cookies: string; at: number; ttlMs: number };

export function loadCachedHostCookies(host: string): string | null {
  try {
    const p = cookieCachePath(host);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8")) as CookieCache;
    const ttl = j.ttlMs || 25 * 60_000;
    if (Date.now() - j.at > ttl) return null;
    return j.cookies || null;
  } catch {
    return null;
  }
}

export function saveHostCookies(host: string, cookies: string, ttlMs = 25 * 60_000) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      cookieCachePath(host),
      JSON.stringify({ cookies, at: Date.now(), ttlMs } satisfies CookieCache)
    );
  } catch {
    /* ignore */
  }
}

function isChallengeHtml(html: string): boolean {
  return (
    /kvik_cfm|challenges\.cloudflare\.com\/turnstile|Verificăm dacă sunteți om|cf-turnstile|Just a moment/i.test(
      html
    ) ||
    (html.length < 35000 && /cloudflare|turnstile/i.test(html) && !/woocommerce|product-grid|add-to-cart/i.test(html))
  );
}

function cookiesToHeader(
  cookies: Array<{ name: string; value: string }>
): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Open real Chrome, wait for CF/Kvik challenge to clear, return HTML + cookies.
 * Headed by default — Turnstile often needs a visible browser (and maybe a click).
 */
export async function browserFetchUnlock(
  url: string,
  opts?: { timeoutMs?: number; headless?: boolean }
): Promise<UnlockResult> {
  if (!browserUnlockEnabled() && process.env.PARTS_BROWSER_UNLOCK !== "force") {
    return {
      ok: false,
      html: "",
      cookies: "",
      finalUrl: url,
      strategy: "browser-unlock-off",
      error: "Set PARTS_BROWSER_UNLOCK=1 to enable Chrome unlock",
    };
  }

  const exe = chromePath();
  if (!exe) {
    return {
      ok: false,
      html: "",
      cookies: "",
      finalUrl: url,
      strategy: "browser-no-chrome",
      error: "Chrome not found — set CHROME_PATH",
    };
  }

  const timeoutMs = opts?.timeoutMs ?? Number(process.env.PARTS_BROWSER_UNLOCK_MS || 90_000);
  const headless =
    opts?.headless ??
    (process.env.PARTS_BROWSER_HEADLESS === "1" || process.env.PARTS_BROWSER_HEADLESS === "true");

  try {
    // Dynamic import — heavy deps only when used
    const puppeteer = (await import("puppeteer-extra")).default;
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
      headless: headless ? true : false,
      executablePath: exe,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--window-size=1360,900",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: headless ? { width: 1360, height: 900 } : null,
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 60000) });

      const deadline = Date.now() + timeoutMs;
      let html = await page.content();
      while (Date.now() < deadline && isChallengeHtml(html)) {
        // Try clicking Turnstile iframe checkbox if present (best-effort)
        try {
          const frames = page.frames();
          for (const frame of frames) {
            const box = await frame.$("input[type=checkbox], .mark, #challenge-stage, body");
            if (box) {
              await box.click({ delay: 40 }).catch(() => undefined);
            }
          }
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 1500));
        html = await page.content();
      }

      if (isChallengeHtml(html)) {
        return {
          ok: false,
          html,
          cookies: "",
          finalUrl: page.url(),
          strategy: "browser-challenge-stuck",
          error:
            "Cloudflare Turnstile did not clear. Open the site in Chrome, solve once, set FIXBOX_COOKIE=cf_clearance=...; or keep headed window and click the checkbox.",
        };
      }

      const cookieObjs = await page.cookies();
      const cookies = cookiesToHeader(cookieObjs);
      try {
        const host = new URL(url).host;
        if (cookies) saveHostCookies(host, cookies);
      } catch {
        /* ignore */
      }

      return {
        ok: true,
        html,
        cookies,
        finalUrl: page.url(),
        strategy: headless ? "browser-stealth-headless" : "browser-stealth-headed",
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (e) {
    return {
      ok: false,
      html: "",
      cookies: "",
      finalUrl: url,
      strategy: "browser-unlock-error",
      error: e instanceof Error ? e.message : "browser unlock failed",
    };
  }
}
