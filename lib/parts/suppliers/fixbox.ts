/**
 * FixBox.md — KvikShop catalog behind Cloudflare Turnstile.
 *
 * Free HTTP alone returns HTTP 444 + challenge HTML (no products).
 * Paths (in order):
 *  1) FIXBOX_COOKIE / cached cf cookies after browser unlock
 *  2) curl-impersonate + cookies
 *  3) optional browser unlock (PARTS_BROWSER_UNLOCK=1)
 *  4) FlareSolverr / ScrapingBee if configured (via fetchText forceUnlock)
 *  5) shell deep-link
 */

import { articleForUrl, normalizeArticle } from "../normalize";
import { fetchText, setHostCookies } from "../http";
import { hasCurlImpersonate, curlImpersonateFetch } from "../curl-impersonate";
import {
  browserFetchUnlock,
  browserUnlockEnabled,
  loadCachedHostCookies,
} from "../browser-unlock";
import {
  dedupeOffers,
  parseMdlShopCards,
  parseSchemaProducts,
  parseWooCommerce,
} from "../parse/html-products";
import type { PartOffer, SupplierSearchResult } from "../types";

const SUPPLIER = "fixbox" as const;
const SUPPLIER_NAME = "FixBox.md";
const BASE = "https://fixbox.md";

function envCookie(): string {
  return (
    process.env.FIXBOX_COOKIE?.trim() ||
    process.env.PARTS_CF_COOKIE?.trim() ||
    process.env.PARTS_GLOBAL_COOKIE?.trim() ||
    ""
  );
}

function searchUrl(code: string): string {
  return `${BASE}/?s=${encodeURIComponent(code)}`;
}

function isChallenge(html: string): boolean {
  return (
    /kvik_cfm|challenges\.cloudflare\.com\/turnstile|Verificăm dacă sunteți om/i.test(html) ||
    (html.length < 40000 &&
      /cloudflare|turnstile/i.test(html) &&
      !/woocommerce|product|add-to-cart|price/i.test(html))
  );
}

function shell(article: string, error?: string): SupplierSearchResult {
  return {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    ok: true,
    blocked: true,
    error:
      error ||
      "Cloudflare Turnstile — откройте в браузере или задайте FIXBOX_COOKIE / PARTS_BROWSER_UNLOCK=1",
    durationMs: 0,
    offers: [
      {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        brand: "—",
        article,
        name: `Открыть ${article} на ${SUPPLIER_NAME}`,
        price: null,
        currency: "MDL",
        stock: "unknown",
        url: searchUrl(article),
        priceConfidence: "low",
        isShell: true,
      },
    ],
  };
}

function parseFixbox(html: string, article: string): PartOffer[] {
  const ctx = {
    supplier: SUPPLIER,
    supplierName: SUPPLIER_NAME,
    baseUrl: BASE,
    article,
    currency: "MDL",
  };
  return dedupeOffers([
    ...parseWooCommerce(html, ctx),
    ...parseMdlShopCards(html, ctx),
    ...parseSchemaProducts(html, ctx),
  ]).filter((o) => {
    // keep exact-ish or priced products
    const art = normalizeArticle(o.article || "");
    const q = normalizeArticle(article);
    if (o.price != null && o.price > 0) return true;
    if (art && (art === q || art.includes(q) || q.includes(art))) return true;
    if (normalizeArticle(o.name || "").includes(q)) return true;
    return false;
  });
}

async function fetchWithCookie(
  url: string,
  cookie: string
): Promise<{ ok: boolean; html: string; strategy: string }> {
  if (hasCurlImpersonate()) {
    const ci = await curlImpersonateFetch({
      url,
      cookies: cookie,
      timeoutMs: 22000,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ro-RO,ro;q=0.9,ru;q=0.8,en;q=0.7",
        Referer: BASE + "/",
      },
    });
    if (ci.text && !isChallenge(ci.text) && ci.text.length > 5000) {
      return { ok: true, html: ci.text, strategy: ci.strategy };
    }
  }
  const res = await fetchText({
    url,
    cookies: cookie,
    preferCurl: true,
    skipWarmup: true,
    retries: 1,
    timeoutMs: 22000,
    headers: { Referer: BASE + "/" },
  });
  if (res.ok && res.text && !isChallenge(res.text)) {
    return { ok: true, html: res.text, strategy: res.strategy };
  }
  return { ok: false, html: res.text || "", strategy: res.strategy };
}

export async function searchFixbox(code: string): Promise<SupplierSearchResult> {
  const started = Date.now();
  const article = articleForUrl(code);
  if (article.length < 3) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: "Артикул слишком короткий",
      durationMs: 0,
      offers: [],
    };
  }

  const url = searchUrl(article);
  let cookie =
    envCookie() || loadCachedHostCookies("fixbox.md") || loadCachedHostCookies("www.fixbox.md") || "";

  if (cookie) {
    setHostCookies(BASE, cookie);
  }

  // 1) Cookie path
  if (cookie) {
    const r = await fetchWithCookie(url, cookie);
    if (r.ok) {
      const offers = parseFixbox(r.html, article);
      if (offers.length) {
        return {
          supplier: SUPPLIER,
          supplierName: SUPPLIER_NAME,
          ok: true,
          durationMs: Date.now() - started,
          offers: offers.slice(0, 40),
        };
      }
      // page OK but no parse — still not shell if has content
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: [
          {
            supplier: SUPPLIER,
            supplierName: SUPPLIER_NAME,
            brand: "—",
            article,
            name: `Открыть ${article} на FixBox`,
            price: null,
            currency: "MDL",
            stock: "unknown",
            url,
            priceConfidence: "low",
            isShell: true,
          },
        ],
        error: "HTML получен, позиции не распарсились",
      };
    }
  }

  // 2) Direct probe (usually challenge)
  const direct = await fetchText({
    url,
    preferCurl: true,
    retries: 0,
    timeoutMs: 12000,
    skipWarmup: true,
  });
  if (direct.ok && direct.text && !isChallenge(direct.text)) {
    const offers = parseFixbox(direct.text, article);
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      durationMs: Date.now() - started,
      offers: offers.length
        ? offers.slice(0, 40)
        : [
            {
              supplier: SUPPLIER,
              supplierName: SUPPLIER_NAME,
              brand: "—",
              article,
              name: `Открыть ${article} на FixBox`,
              price: null,
              currency: "MDL",
              stock: "unknown",
              url,
              priceConfidence: "low",
              isShell: true,
            },
          ],
    };
  }

  // 3) Browser unlock (optional)
  if (browserUnlockEnabled()) {
    const unlocked = await browserFetchUnlock(url, {
      timeoutMs: Number(process.env.PARTS_BROWSER_UNLOCK_MS || 90000),
    });
    if (unlocked.ok && unlocked.html && !isChallenge(unlocked.html)) {
      if (unlocked.cookies) {
        setHostCookies(BASE, unlocked.cookies);
        cookie = unlocked.cookies;
      }
      const offers = parseFixbox(unlocked.html, article);
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: offers.length
          ? offers.slice(0, 40)
          : [
              {
                supplier: SUPPLIER,
                supplierName: SUPPLIER_NAME,
                brand: "—",
                article,
                name: `Открыть ${article} на FixBox`,
                price: null,
                currency: "MDL",
                stock: "unknown",
                url,
                priceConfidence: "low",
                isShell: true,
              },
            ],
        error: offers.length ? undefined : `Страница OK (${unlocked.strategy}), парсер пуст`,
      };
    }
  }

  // 4) Managed unlock services
  if (
    process.env.FLARESOLVERR_URL ||
    process.env.SCRAPINGBEE_API_KEY ||
    process.env.PARTS_UNLOCK_URL
  ) {
    const res = await fetchText({
      url,
      forceUnlock: true,
      timeoutMs: 55000,
      retries: 0,
    });
    if (res.ok && res.text && !isChallenge(res.text)) {
      const offers = parseFixbox(res.text, article);
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: true,
        durationMs: Date.now() - started,
        offers: offers.length ? offers.slice(0, 40) : shell(article).offers,
        error: offers.length ? undefined : res.strategy,
      };
    }
  }

  const out = shell(article);
  out.durationMs = Date.now() - started;
  out.error =
    "FixBox: Cloudflare Turnstile (HTTP 444). Бесплатно: откройте fixbox.md в Chrome → devtools → Cookie (cf_clearance) → FIXBOX_COOKIE=... " +
    "или PARTS_BROWSER_UNLOCK=1 (headed Chrome, клик по капче). Free proxy / curl не проходят Turnstile.";
  return out;
}
