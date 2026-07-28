/**
 * NiponAuto.md — Laravel catalog.
 * Guest: brand/article table, often no prices.
 * Auth: full item-cards with `.article-price[data-price]` ("Ваша цена" in lei).
 *
 * Credentials (never commit):
 *   NIPON_EMAIL / NIPON_PASSWORD
 * or session cookie string:
 *   NIPON_COOKIE
 */

import { articleForUrl, normalizeArticle, parsePrice } from "../normalize";
import { fetchText, setHostCookies } from "../http";
import { parseNipon } from "../parse/html-products";
import type { PartOffer, StockStatus, SupplierSearchResult } from "../types";

const BASE = "https://niponauto.md";
const SUPPLIER = "niponauto" as const;
const SUPPLIER_NAME = "Nipon Auto";

let sessionReadyUntil = 0;
let loginInFlight: Promise<boolean> | null = null;

function envEmail(): string {
  return (process.env.NIPON_EMAIL || process.env.NIPONAUTO_EMAIL || "").trim();
}
function envPassword(): string {
  return (process.env.NIPON_PASSWORD || process.env.NIPONAUTO_PASSWORD || "").trim();
}
function envCookie(): string {
  return (process.env.NIPON_COOKIE || process.env.NIPONAUTO_COOKIE || "").trim();
}

function hasAuthConfig(): boolean {
  return Boolean(envCookie() || (envEmail() && envPassword()));
}

/** Parse authenticated search grid: .item-card + .article-price[data-price] */
export function parseNiponAuthCards(html: string, article: string): PartOffer[] {
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  // Split by item-card blocks (Nipon search results when logged in)
  const blocks = html.split(/(?=<div[^>]+class="[^"]*item-card)/i);
  for (const block of blocks) {
    if (!/article-price|external-producer-name|searched-article/i.test(block)) continue;

    const brand =
      block.match(/data-producer="([^"]+)"/i)?.[1]?.trim() ||
      block.match(/external-producer-name[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      block.match(/name="brand"\s+value="([^"]+)"/i)?.[1]?.trim() ||
      "—";

    const art =
      block.match(/searched-article[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      block.match(/name="code"\s+value="([^"]+)"/i)?.[1]?.trim() ||
      article;

    const name =
      block.match(/name="namesRu"\s+value="([^"]+)"/i)?.[1]?.trim() ||
      block.match(/Оформить заказ товара\s*"([^"]+)"/i)?.[1]?.trim() ||
      `${brand} ${art}`;

    // Prefer "Ваша цена" / data-price on card header (MDL lei)
    let price: number | null = null;
    const dataPrice = block.match(/article-price[^>]*data-price="([^"]+)"/i)?.[1];
    if (dataPrice) price = parsePrice(dataPrice);
    if (price == null) {
      const num = block.match(/article-price-num[^>]*>\s*([\d\s]+)\s*ле/i)?.[1];
      if (num) price = parsePrice(num);
    }
    // Fallback: cheapest supply[xxx][price] in modal (also MDL)
    if (price == null) {
      const supplyPrices = [...block.matchAll(/name="supply\[[^\]]+\]\[price\]"\s+value="([^"]+)"/gi)].map(
        (m) => parsePrice(m[1]!)
      );
      const valid = supplyPrices.filter((p): p is number => p != null && p > 0 && p < 50_000);
      if (valid.length) price = Math.min(...valid);
    }

    if (price != null && (price < 3 || price > 50_000)) price = null;

    let stock: StockStatus = "unknown";
    if (/в наличии|на складе|в филиал/i.test(block)) stock = "in_stock";
    else if (/под заказ|доступно под заказ|дней/i.test(block)) stock = "order";
    else if (/нет в наличии/i.test(block)) stock = "out";

    const delivery =
      block.match(/>(\d+\s*дней?)</i)?.[1] ||
      block.match(/доставка[^\d]{0,20}(\d+\s*дней?)/i)?.[1];

    const href =
      block.match(/href="(\/ru\/search\?key=[^"]+)"/i)?.[1] ||
      block.match(/href="(\/[^"]*product[^"]*)"/i)?.[1];

    const key = `${brand}|${normalizeArticle(art)}|${price ?? "np"}`;
    if (seen.has(key)) continue;
    if (!art || art.length < 2) continue;
    // skip empty shells
    if (price == null && brand === "—") continue;
    seen.add(key);

    offers.push({
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      brand: brand || "—",
      article: art,
      name: name.slice(0, 200),
      price,
      currency: "MDL",
      stock,
      delivery: delivery || undefined,
      url: href
        ? href.startsWith("http")
          ? href
          : `${BASE}${href}`
        : `${BASE}/ru/search?key=${encodeURIComponent(art)}`,
      priceConfidence: price != null ? "high" : "low",
      rawPriceText: price != null ? `${price} MDL` : undefined,
      isAnalog: normalizeArticle(art) !== normalizeArticle(article),
    });
  }

  offers.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return offers.slice(0, 80);
}

async function ensureNiponSession(): Promise<boolean> {
  const cookie = envCookie();
  if (cookie) {
    setHostCookies(BASE, cookie);
    sessionReadyUntil = Date.now() + 6 * 60 * 60_000;
    return true;
  }
  const email = envEmail();
  const password = envPassword();
  if (!email || !password) return false;

  if (Date.now() < sessionReadyUntil) return true;
  if (loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    try {
      // 1) GET login page for CSRF + session cookie (must land in jar)
      const page = await fetchText({
        url: `${BASE}/login`,
        timeoutMs: 20000,
        retries: 1,
        preferCurl: true,
        skipWarmup: false,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
      });
      if (!page.ok || page.blocked || !page.text) {
        console.warn("[nipon] login page fail", page.status, page.strategy);
        return false;
      }
      const token =
        page.text.match(/name="_token"\s+value="([^"]+)"/i)?.[1] ||
        page.text.match(/csrf-token"\s+content="([^"]+)"/i)?.[1];
      if (!token) {
        console.warn("[nipon] no CSRF token");
        return false;
      }

      const body = new URLSearchParams({
        _token: token,
        email,
        password,
        remember: "on",
      }).toString();

      // 2) POST login — expect 302 + session/remember cookies (no follow → avoid 405)
      const post = await fetchText({
        url: `${BASE}/login`,
        method: "POST",
        body,
        timeoutMs: 25000,
        retries: 0,
        preferCurl: true,
        skipWarmup: true,
        followRedirects: false,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: BASE,
          Referer: `${BASE}/login`,
          Accept: "text/html,application/xhtml+xml",
        },
      });

      // 419 = CSRF/session cookie mismatch (old curl path dropped Set-Cookie)
      if (post.status === 419) {
        console.warn("[nipon] login rejected 419 CSRF — session cookie missing from jar");
        sessionReadyUntil = 0;
        return false;
      }

      const badCreds =
        /неверн|invalid credentials|these credentials|пароль невер/i.test(post.text);
      const redirectedHome =
        post.status === 302 ||
        post.status === 301 ||
        post.status === 303 ||
        (/niponauto\.md\/?$/i.test(post.finalUrl) && post.status < 400);
      const bodyLoggedIn = /logout|выход|кабинет|remember_web/i.test(post.text);
      const jarHint = /remember_web|niponauto_session/i.test(post.cookies || "");

      let ok =
        !badCreds &&
        post.status !== 401 &&
        post.status !== 403 &&
        (redirectedHome || bodyLoggedIn || jarHint || (post.ok && post.status < 400));

      // 3) Confirm session on home/search if we only saw a bare redirect
      if (ok && !bodyLoggedIn) {
        const home = await fetchText({
          url: `${BASE}/ru`,
          timeoutMs: 15000,
          retries: 0,
          preferCurl: true,
          skipWarmup: true,
          headers: {
            Referer: `${BASE}/login`,
            Accept: "text/html,application/xhtml+xml",
          },
        });
        ok =
          home.ok &&
          !/\/login/i.test(home.finalUrl) &&
          (/logout|выход|кабинет|статья|каталог/i.test(home.text) ||
            home.text.length > 5000);
        if (!ok) {
          console.warn(
            "[nipon] login redirect ok but session not visible",
            home.status,
            home.finalUrl?.slice(0, 60)
          );
        }
      }

      if (ok) {
        sessionReadyUntil = Date.now() + 4 * 60 * 60_000; // 4h
        console.info("[nipon] login ok", post.status, post.strategy);
        return true;
      }
      console.warn("[nipon] login rejected", post.status, post.finalUrl?.slice(0, 80));
      sessionReadyUntil = 0;
      return false;
    } catch (e) {
      console.warn("[nipon] login error", e);
      sessionReadyUntil = 0;
      return false;
    } finally {
      loginInFlight = null;
    }
  })();

  return loginInFlight;
}

/** Brand drill-down URLs from the pieces-grid (prices only after ?brand=). */
function extractNiponBrandUrls(html: string, article: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re =
    /href="(https?:\/\/niponauto\.md)?(\/ru\/search\?key=[^"&]+(?:&amp;|&)brand=[^"]+)"/gi;
  for (const m of html.matchAll(re)) {
    const path = (m[2] || "").replace(/&amp;/g, "&");
    if (!path) continue;
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  // Prefer exact article key match first
  const artNorm = normalizeArticle(article);
  out.sort((a, b) => {
    const aHit = normalizeArticle(decodeURIComponent(a)).includes(artNorm) ? 0 : 1;
    const bHit = normalizeArticle(decodeURIComponent(b)).includes(artNorm) ? 0 : 1;
    return aHit - bHit;
  });
  return out.slice(0, 8); // cap brand expansions
}

async function fetchNiponOffersFromUrl(
  url: string,
  article: string
): Promise<PartOffer[]> {
  const res = await fetchText({
    url,
    timeoutMs: 22000,
    retries: 0,
    preferCurl: true,
    skipWarmup: true,
    headers: {
      Referer: `${BASE}/ru`,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9,ro;q=0.8,en;q=0.7",
    },
  });
  if (!res.ok || res.blocked || !res.text) return [];
  let offers = parseNiponAuthCards(res.text, article);
  if (!offers.length) {
    offers = parseNipon(res.text, {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      baseUrl: BASE,
      article,
      currency: "MDL",
    });
  }
  return offers;
}

function mergeNiponOffers(lists: PartOffer[][]): PartOffer[] {
  const seen = new Set<string>();
  const out: PartOffer[] = [];
  for (const list of lists) {
    for (const o of list) {
      const key = `${o.brand}|${normalizeArticle(o.article)}|${o.price ?? "np"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  out.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return out.slice(0, 80);
}

export async function searchNipon(code: string): Promise<SupplierSearchResult> {
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

  const searchUrl = `${BASE}/ru/search?key=${encodeURIComponent(article)}`;
  let authed = false;
  if (hasAuthConfig()) {
    authed = await ensureNiponSession();
  }

  try {
    const res = await fetchText({
      url: searchUrl,
      timeoutMs: 22000,
      retries: 1,
      preferCurl: true,
      skipWarmup: true,
      headers: {
        Referer: `${BASE}/ru`,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,ro;q=0.8,en;q=0.7",
      },
    });

    if (res.blocked) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: false,
        blocked: true,
        error: `WAF/блок (${res.strategy})`,
        durationMs: Date.now() - started,
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
            url: searchUrl,
            priceConfidence: "low",
            isShell: true,
          },
        ],
      };
    }

    if (!res.ok || !res.text) {
      return {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        ok: false,
        error: `HTTP ${res.status}`,
        durationMs: Date.now() - started,
        offers: [],
      };
    }

    // Prefer auth card parser when prices already present (rare on bare search)
    let offers = parseNiponAuthCards(res.text, article);
    if (!offers.length) {
      offers = parseNipon(res.text, {
        supplier: SUPPLIER,
        supplierName: SUPPLIER_NAME,
        baseUrl: BASE,
        article,
        currency: "MDL",
      });
    }

    let anyPrice = offers.some((o) => o.price != null && o.price > 0);

    // Nipon prices live on brand drill-down: /ru/search?key=OC90&brand=KNECHT
    // Bare search is only a brand index (even when logged in).
    if (!anyPrice && authed) {
      let brandUrls = extractNiponBrandUrls(res.text, article);
      if (!brandUrls.length) {
        // session may have expired — re-login once and re-fetch index
        sessionReadyUntil = 0;
        const again = await ensureNiponSession();
        if (again) {
          const res2 = await fetchText({
            url: searchUrl,
            timeoutMs: 22000,
            retries: 0,
            preferCurl: true,
            skipWarmup: true,
            headers: { Referer: `${BASE}/ru` },
          });
          if (res2.ok && res2.text) {
            brandUrls = extractNiponBrandUrls(res2.text, article);
            offers = parseNiponAuthCards(res2.text, article);
            if (!offers.length) {
              offers = parseNipon(res2.text, {
                supplier: SUPPLIER,
                supplierName: SUPPLIER_NAME,
                baseUrl: BASE,
                article,
                currency: "MDL",
              });
            }
          }
        }
      }

      if (brandUrls.length) {
        // Parallel brand pages (max 4 concurrent) — prices only here when authed
        const batchSize = 4;
        const brandLists: PartOffer[][] = [];
        for (let i = 0; i < brandUrls.length; i += batchSize) {
          const chunk = brandUrls.slice(i, i + batchSize);
          const parts = await Promise.all(
            chunk.map((u) => fetchNiponOffersFromUrl(u, article))
          );
          brandLists.push(...parts);
        }
        offers = mergeNiponOffers([offers, ...brandLists]);
        anyPrice = offers.some((o) => o.price != null && o.price > 0);
      }
    }

    if (!offers.length) {
      offers = [
        {
          supplier: SUPPLIER,
          supplierName: SUPPLIER_NAME,
          brand: "—",
          article,
          name: `Открыть ${article} на ${SUPPLIER_NAME}`,
          price: null,
          currency: "MDL",
          stock: "unknown",
          url: searchUrl,
          priceConfidence: "low",
          isShell: true,
        },
      ];
    }

    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: true,
      durationMs: Date.now() - started,
      offers,
      error: !anyPrice && !hasAuthConfig()
        ? "Гость: часто без цен — задайте NIPON_EMAIL/NIPON_PASSWORD"
        : !anyPrice && hasAuthConfig() && !authed
          ? "Логин Nipon не удался — проверьте NIPON_EMAIL/PASSWORD"
          : !anyPrice && authed
            ? "Логин OK, но цен на brand-страницах нет"
            : undefined,
    };
  } catch (e) {
    return {
      supplier: SUPPLIER,
      supplierName: SUPPLIER_NAME,
      ok: false,
      error: e instanceof Error ? e.message : "Ошибка",
      durationMs: Date.now() - started,
      offers: [],
    };
  }
}
