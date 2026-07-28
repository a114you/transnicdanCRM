import * as cheerio from "cheerio";
import { parsePrice } from "../normalize";
import type { PartOffer, StockStatus, SupplierId } from "../types";

export interface ParseContext {
  supplier: SupplierId;
  supplierName: string;
  baseUrl: string;
  article: string;
  currency?: string;
}

function absUrl(base: string, href?: string | null): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function stockFromText(t: string): StockStatus {
  const s = t.toLowerCase();
  if (/in.?stock|в наличии|în stoc|есть|на складе|available/i.test(s)) return "in_stock";
  if (/под заказ|la comandă|to order|pre-?order|ожида|рабочих.?дня|дней/i.test(s)) return "order";
  if (/out of stock|нет в наличии|indisponibil|lipsă|sold out/i.test(s)) return "out";
  if (/✔|✓/.test(t)) return "in_stock";
  return "unknown";
}

/** Reject garbage prices (SKU ids, years, shipping aggregates). */
export function isSanePartPrice(price: number | null | undefined): price is number {
  if (price == null || !Number.isFinite(price)) return false;
  // under 3 MDL is almost always noise (placeholders, partial parses)
  if (price < 3) return false;
  // typical MD retail auto part: under 50k MDL; reject product-id style millions
  if (price > 50_000) return false;
  return true;
}

/** Non-auto marketplace titles (PandaShop dolls/puzzles etc.) */
function isJunkProductName(name: string): boolean {
  return /(?:кукл|игрушк|пазл|puzzle|doll|barbie|avengers|trefl|lego|лего|радиоуправл|chi\s*toys|honey\s*baby|fantasy\s*patrol|proxxon|настольн\w*\s*ламп|лампа\s*настольн|светильник|конструктор|настольн\w*\s*игр|board\s*game|плюшев|электроника|бытовая техника|дом и сад|детские товары|красота и здоровье)/i.test(
    name
  );
}

/** Schema.org / generic product cards — never stamp query as article on random products */
export function parseSchemaProducts(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const currency = ctx.currency || "MDL";

  // Prefer real product cards — avoid matching footer/nav "name" nodes
  let roots = $('[itemtype*="schema.org/Product"], .product.group, [class*="product "]').toArray();
  if (!roots.length) {
    roots = $('[itemprop="offers"]').toArray();
  }

  for (const el of roots) {
    const scope = $(el);
    // skip navigation/footer / category menus
    const nameEl =
      scope.find('a[itemprop="name"], [itemprop="name"]').filter((_, n) => {
        const t = $(n).text().trim();
        return (
          t.length > 3 &&
          !/cum să|contact|garan|livrar|despre|how to|электроника|бытовая|детские|fashion|спорт/i.test(t)
        );
      }).first();

    const price =
      parsePrice(scope.find('meta[itemprop="price"]').attr("content")) ??
      parsePrice(scope.find('[itemprop="price"]').first().attr("content")) ??
      parsePrice(scope.find('[itemprop="price"]').first().text()) ??
      parsePrice(scope.find(".price-now, .woocommerce-Price-amount, .card-price_curr").first().text());

    if (!isSanePartPrice(price)) continue;

    let name =
      nameEl.text().trim() ||
      scope.find("a[title]").first().attr("title")?.trim() ||
      scope.find(".card-title, .product-title").first().text().trim() ||
      scope.find("a").filter((_, a) => ($(a).text().trim().length > 5)).first().text().trim() ||
      "";
    name = name.replace(/\s+/g, " ").trim();
    if (!name || name.length < 3) continue;
    if (/cum să|contacte|despre noi|costul livr|результаты поиска/i.test(name)) continue;
    if (isJunkProductName(name)) continue;

    let brand =
      scope.find('[itemprop="brand"]').first().text().trim() ||
      scope.find(".brand, .product-brand").first().text().trim() ||
      "";
    if (!brand) brand = extractBrandFromName(name);

    const skuMeta =
      scope.find('meta[itemprop="sku"]').attr("content")?.trim() ||
      scope.find('[itemprop="sku"]').first().text().trim() ||
      "";
    const descMeta =
      scope.find('meta[itemprop="description"]').attr("content")?.trim() ||
      scope.find('[itemprop="description"]').first().text().trim() ||
      "";

    // Prefer code from title/sku — NEVER fall back to the search query (that stamps OEM on dolls)
    let article = extractArticleFromName(name, "");
    if (skuMeta && skuMeta.length >= 3 && skuMeta.length <= 32) {
      const skuN = skuMeta.replace(/\s+/g, "").toUpperCase();
      const qN = (ctx.article || "").replace(/[\s\-_./]/g, "").toUpperCase();
      // only trust SKU if it equals/contains full query or looks like real part number
      if (qN && (skuN === qN || skuN.includes(qN) || qN.includes(skuN))) {
        article = skuMeta;
      } else if (!article && /[A-Za-z]/.test(skuMeta) && skuMeta.length <= 24) {
        article = skuMeta;
      }
    }

    // Must relate to the searched article — drop partial "23000" hits for "43852-23000"
    // Include description: AllPiese "zamiennik OC90" lives in meta description
    if (!cardMatchesQuery(ctx, name, article, `${brand} ${skuMeta} ${descMeta.slice(0, 200)}`)) continue;
    if (!article) article = ctx.article;

    const href =
      scope.find('meta[itemprop="url"]').attr("content") ||
      nameEl.attr("href") ||
      scope.find("a[href*='product'], a[href*='catalog'], a.card").first().attr("href");

    const avail = scope.find('link[itemprop="availability"]').attr("href") || "";
    const stock = /InStock/i.test(avail)
      ? "in_stock"
      : /OutOfStock/i.test(avail)
        ? "out"
        : stockFromText(scope.text());

    const key = `${brand}|${article}|${price}|${name.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: brand || "—",
      article,
      name: name.slice(0, 200),
      price,
      currency,
      stock,
      url: absUrl(ctx.baseUrl, href),
      rawPriceText: `${price} ${currency}`,
      priceConfidence: "medium",
    });
  }

  return offers;
}

function extractArticleFromName(name: string, fallback: string): string {
  // After brand, first token is usually the article: "TRW GDB199 Set…" / "ENERGY 96133555/1 …"
  // Do NOT grab random trailing (23000) from "Puzzle Avengers (23000)".
  const brand = extractBrandFromName(name);
  let rest = name.trim();
  if (brand && brand !== "—") {
    const re = new RegExp("^" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i");
    rest = rest.replace(re, "").trim();
  }
  const up = rest.toUpperCase();
  // OEM with hyphen first: 43852-23000
  const oem = up.match(/\b(\d{5}-[0-9A-Z]{4,10})\b/);
  if (oem?.[1]) return oem[1];
  const m =
    up.match(/^([A-Z]{1,6}[\s\-]?[0-9]{2,8}[A-Z0-9\-]*)\b/) ||
    up.match(/^([0-9]{1,2}\.[0-9]{3,4}-[0-9.]+)\b/) ||
    up.match(/^([0-9]{5,12}[A-Z0-9\/\-]*)\b/) ||
    up.match(/^([A-Z0-9][A-Z0-9.\-\/]{3,20})\b/);
  if (m?.[1] && m[1].replace(/\s/g, "").length >= 3 && m[1].length <= 24) {
    return m[1].replace(/\s+/g, " ").trim();
  }
  return fallback;
}

/** AutoPort-style: .item_title / .item_number / .item_price */
export function parseAutoPort(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  $(".widget_sale_item, .row.widget_sale_item, a.item_inner").each((_, el) => {
    const root = $(el);
    const name = root.find(".item_title").text().trim() || root.attr("title") || "";
    const artRaw = root.find(".item_number").text().replace(/^№\s*/i, "").trim();
    // WP empty search often shows random featured products — only keep if related to query
    const art = artRaw || extractArticleFromName(name, "") || "";
    if (!cardMatchesQuery(ctx, name, art, root.text().slice(0, 160))) return;

    const price = parsePrice(root.find(".price_new, .item_price").first().text());
    if (!price || price <= 0 || !isSanePartPrice(price)) return;
    const href = root.is("a") ? root.attr("href") : root.find("a").attr("href");
    const key = `${art}|${price}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: extractBrandFromName(name),
      article: art || ctx.article,
      name: name || art,
      price,
      currency: "MDL",
      stock: "unknown",
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: "high",
    });
  });

  return offers;
}

/** DAAC Piese: .item-product — price only in ._price-new (not .to_order_price "Под заказ") */
export function parseDaac(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  // Only full cards — avoid nested .item-product__* fragments
  $(".item-product, .main-store__item.item-product").each((_, el) => {
    const scope = $(el);
    if (!scope.hasClass("item-product") && !scope.hasClass("main-store__item")) return;

    const brand = scope.find(".item-product__brand").first().text().trim();
    const artRaw = scope.find(".item-product__code").first().text().trim();
    const name = scope.find(".item-product__name").first().text().replace(/\s+/g, " ").trim() || artRaw;
    const art = artRaw || extractArticleFromName(name, "") || "";
    // Drop false hits like 82537OC900 when searching OC90 (middle substring)
    if (!cardMatchesQuery(ctx, name, art, `${brand} ${scope.text().slice(0, 120)}`)) return;

    // Critical: .to_order_price is stock status ("Под заказ"), NOT the retail price.
    // Document order puts it before ._price-new, so multi-selectors must not include it.
    const price =
      parsePrice(scope.find("span._price-new").first().text()) ??
      parsePrice(scope.find(".item-product__price span._price-new, .item-product__price").first().text());
    if (!isSanePartPrice(price)) return;

    const stockText = scope.find(".item-product__presence, ._presence_off, ._presence_on").text();
    const stock = stockFromText(stockText || scope.text());
    let href =
      scope.find("a.item-product__name[href]").attr("href") ||
      scope
        .find('a[href*="/product"], a[href*="/tovar"], a[href*="catalog"]')
        .not('[href^="javascript"]')
        .first()
        .attr("href");
    if (!href || /^javascript:/i.test(href)) {
      href = `/ru/poisk?search=${encodeURIComponent(art || ctx.article)}`;
    }

    const key = `${brand}|${art}|${price}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);

    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: brand || extractBrandFromName(name) || "—",
      article: art,
      name,
      price,
      currency: "MDL",
      stock,
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: "high",
      rawPriceText: `${price} MDL`,
    });
  });

  return offers;
}

/**
 * NiponAuto: guest search is often a brand/article table WITHOUT real prices
 * (prices after login). Never harvest digits from the article itself (OC 90 → 90).
 */
export function parseNipon(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  $("table tr").each((_, el) => {
    const row = $(el);
    if (row.find("th").length) return;
    const tds = row.find("td");
    if (tds.length < 2) return;

    // pieces-grid: brand | article | name (or brand | article)
    const brand = $(tds[0]).text().replace(/\s+/g, " ").trim();
    const art =
      $(tds[1]).find("a").first().text().replace(/\s+/g, " ").trim() ||
      $(tds[1]).text().replace(/\s+/g, " ").trim() ||
      ctx.article;
    const name =
      (tds.length >= 3 ? $(tds[2]).text().replace(/\s+/g, " ").trim() : "") || art;

    if (!brand || brand.length < 2) return;
    if (/бренд|brand|производитель/i.test(brand)) return;

    // Only dedicated price cells — never whole-row text (OC 90 would parse as 90 MDL)
    const priceCell = row.find("td.price, td[class*='price'], .price, [class*='price-value']").first();
    let price: number | null = null;
    if (priceCell.length) {
      const raw = priceCell.text().replace(/\s+/g, " ").trim();
      // require currency hint or obvious money format — reject bare article digits
      if (/mdl|lei|€|\$|руб/i.test(raw) || /\d+[.,]\d{2}/.test(raw) || /\d{2,}\s*$/.test(raw)) {
        const p = parsePrice(raw);
        if (isSanePartPrice(p)) price = p;
      }
    }

    const href =
      row.find("a.pieces-grid-link, a[href*='search'], a[href*='product']").first().attr("href") ||
      row.find("a").first().attr("href");

    const key = `${brand}|${art}|${price ?? "np"}`;
    if (seen.has(key)) return;
    seen.add(key);

    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand,
      article: art,
      name: name || art,
      price,
      currency: "MDL",
      stock: stockFromText(row.text()),
      url: absUrl(ctx.baseUrl, href) || `${ctx.baseUrl}/ru/search?key=${encodeURIComponent(ctx.article)}`,
      priceConfidence: price != null ? "high" : "low",
    });
  });

  return offers.slice(0, 40);
}

function extractBrandFromName(name: string): string {
  const known = [
    "FEDERAL MOGUL", "HERTH+BUSS", "JAPANPARTS", "KAVO PARTS", "BLUE PRINT",
    "BREMBO", "TEXTAR", "FERODO", "JURID", "LUCAS", "DELPHI", "ATE",
    "BOSCH", "MANN-FILTER", "MANN", "MAHLE", "KNECHT", "FILTRON", "TRW", "FEBI",
    "SACHS", "KYB", "NGK", "DENSO", "GATES", "SKF", "VALEO", "HELLA",
    "NISSENS", "SNR", "RUVILLE", "CONTITECH", "DAYCO", "SWAG", "HENGST", "PURFLUX",
    "SAMKO", "ICER", "ABE", "FRENKIT", "QUICK BRAKE", "DENCKERMANN", "TOMEX",
    "FOMAR", "KRAFT", "ENERGY", "WIX", "KOLBENSCHMIDT", "METELLI", "LPR",
  ];
  const up = name.toUpperCase();
  // Prefer brand at start of name
  for (const b of known) {
    if (up.startsWith(b) || up.includes(" " + b + " ") || up.includes(b + " ")) return b;
  }
  for (const b of known) {
    if (up.includes(b)) return b;
  }
  // First token if it looks like a brand (letters, 2–15 chars)
  const first = name.trim().split(/\s+/)[0] || "";
  if (/^[A-Za-z][A-Za-z0-9+.\-]{1,14}$/.test(first) && !/^(set|kit|the|and)$/i.test(first)) {
    return first.toUpperCase();
  }
  return "—";
}

/**
 * APS / ENORM / AutoResident (productslist tables) — open guest catalogs.
 * ENORM: priceroz filled on list. APS: list often "—" / empty, price on product page
 * (Розничная цена: 188,00 лей) — enrich via fetchApsProductPrice.
 * Each row is parsed on its own — never attach analog prices to parent GDB199.
 */
export function parseApsPlatform(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const currency = ctx.currency || "MDL";

  $("table.productslist tr, #listtable tr, table.productslist > tbody > tr").each((_, el) => {
    const row = $(el);
    if (row.find("th").length) return;
    if (row.hasClass("empty") || row.hasClass("hanalogs") || row.hasClass("analogsend")) return;

    // Article ONLY from this row's code cell
    const art = row.find("td.code a").first().text().replace(/\s+/g, " ").trim();
    if (!art || art.length < 2) return;
    if (/отправить|сообщение|новое поступлен/i.test(art)) return;

    // Brand: span.supplier OR plain text in td.supplier (APS uses plain text "TRW")
    const brandCell = row.find("td.supplier").first();
    let brand =
      brandCell.children("span.supplier").first().text().trim() ||
      brandCell.find("span.supplier").first().text().trim() ||
      brandCell.clone().children().remove().end().text().replace(/\s+/g, " ").trim() ||
      brandCell.text().replace(/\s+/g, " ").trim();
    if (/^производитель$/i.test(brand)) brand = "";

    let name =
      row.find("td.name > div.name > a, td.name div.name a").first().text().trim() ||
      row.find("td.name a").first().text().trim() ||
      art;
    // Strip "Производитель: … Каталожный код: … Аналогичные товары" noise
    name = name
      .replace(/\s*Производитель\s*:\s*[^\s].*$/i, "")
      .replace(/\s*Каталожный код\s*:\s*.*$/i, "")
      .replace(/\s*Аналогичные товары\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || art;

    // Price from priceroz (ENORM has numbers; APS list often &mdash;)
    const priceCell = row.find("td.priceroz").first();
    let price: number | null = null;
    if (priceCell.length) {
      const raw = priceCell.text().replace(/\s+/g, " ").trim();
      if (raw && raw !== "—" && raw !== "–" && raw !== "-" && !/^&mdash;$/i.test(raw)) {
        const p = parsePrice(raw);
        if (isSanePartPrice(p)) price = p;
      }
    }

    const warehouse =
      row.find("td.warehouse .whborder").first().text().trim() ||
      row.find("td.warehouse").first().text().replace(/\s+/g, " ").trim();
    const qtyText = row.find("td.quantity").first().text().replace(/\s+/g, " ").trim();
    const qtyHtml = row.find("td.quantity").first().html() || "";
    let stock: StockStatus = "unknown";
    if (/✔|✓/.test(qtyHtml) || /^\d+$/.test(qtyText) && Number(qtyText) > 0) stock = "in_stock";
    else if (qtyText === "0") stock = "order";
    else if (/под заказ|рабочих|дней|\d+\+/i.test(warehouse + qtyText)) stock = "order";
    else if (warehouse) stock = /кишин|chisinau|chișinău|буребиста/i.test(warehouse) ? "in_stock" : "order";

    const href =
      row.attr("data-href") ||
      row.find("td.code a").attr("href") ||
      row.find("td.name a").attr("href");

    if (price == null && !brand && !href) return;

    const key = `${brand}|${art}|${price ?? "np"}|${warehouse}`;
    if (seen.has(key)) return;
    seen.add(key);

    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: brand || extractBrandFromName(name) || "—",
      article: art,
      name: name || art,
      price,
      currency,
      stock,
      delivery: warehouse || undefined,
      url: absUrl(ctx.baseUrl, href) || `${ctx.baseUrl}/search_products/?query=${encodeURIComponent(ctx.article)}`,
      isAnalog: row.hasClass("analog"),
      priceConfidence: price != null ? "high" : "low",
      rawPriceText: price != null ? `${price} ${currency}` : undefined,
    });
  });

  offers.sort((a, b) => {
    const ap = a.price != null ? 0 : 1;
    const bp = b.price != null ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.price ?? 1e12) - (b.price ?? 1e12);
  });
  return offers;
}

/** Product card: «Розничная цена: 188,00 лей» + qty (open guest HTML). */
export function parseApsProductPage(
  html: string,
  ctx: ParseContext
): { price: number | null; stock: StockStatus; name?: string; warehouse?: string } {
  const $ = cheerio.load(html);
  const name =
    $("h1.productname, h1").first().text().replace(/\s+/g, " ").trim() || undefined;

  // Prefer block near main product (first priceroz with strong label)
  let price: number | null = null;
  const labelMatch = html.match(
    /Розничная цена:\s*<\/strong>\s*([\d\s]+[.,]\d{2})/i
  );
  if (labelMatch) {
    const p = parsePrice(labelMatch[1]!);
    if (isSanePartPrice(p)) price = p;
  }
  if (price == null) {
    $(".priceroz, td.priceroz, .finalprice").each((_, el) => {
      if (price != null) return;
      const p = parsePrice($(el).text());
      if (isSanePartPrice(p)) price = p;
    });
  }

  const qtyBlob =
    $(".quantity").first().text() +
    " " +
    (html.match(/Кол-во:\s*<\/strong>\s*([^<]+)/i)?.[1] || "");
  let stock: StockStatus = "unknown";
  if (/✔|✓|≥|\d+/.test(qtyBlob) && !/\b0\b/.test(qtyBlob.trim())) stock = "in_stock";
  else if (/под заказ/i.test(html)) stock = "order";

  const warehouse =
    $(".whname, .warehouse .whborder, .warehouse").first().text().replace(/\s+/g, " ").trim() ||
    undefined;

  return { price, stock, name, warehouse };
}

/** AutoMall-family tiles: .tile .brand .ware-num .price (webmallpmr, automall) */
/**
 * AutoMall / WebMall tiles.
 * - MDL pages: keep numeric prices.
 * - PMR rub pages: strip price (caller maps to MD URLs + "см. на сайте").
 *   Never return PMR руб as MDL.
 */
export function parseAutomallTiles(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const currency = ctx.currency || "MDL";
  const allowZeroPrice = ctx.currency === "MDL" || !ctx.currency;
  // Detect PMR rub on page — never treat as MDL
  const pageIsPmr =
    /webmallpmr|руб\.?|RUB/i.test(html.slice(0, 8000)) &&
    !/лей|lei|MDL/i.test($(".price").first().text());

  $(".tile, .tile-border").each((_, el) => {
    const tile = $(el);
    const brand = tile.find(".brand").attr("title") || tile.find(".brand").text().trim() || "";
    const art = tile.find(".ware-num").text().trim() || ctx.article;
    if (!art || art.length < 2) return;

    const priceText = tile.find(".price").first().text();
    const isRub = /руб|RUB/i.test(priceText) || pageIsPmr;
    let price = parsePrice(priceText);
    if (isRub) price = null; // never import PMR money
    if (price != null && (price <= 0 || !isSanePartPrice(price))) price = null;
    if (price == null && !allowZeroPrice && !isRub) return;

    const name =
      tile.find("h4 a").text().trim() ||
      tile.find("a[title]").attr("title") ||
      `${brand} ${art}`.trim() ||
      art;
    const href = tile.find("a[href]").first().attr("href") || tile.find("a").attr("url");
    const noPresent = tile.find(".no-present").length > 0 || /Нет в наличии/i.test(tile.text());
    const key = `${brand}|${art}|${price ?? "np"}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: brand || "—",
      article: art,
      name: name.slice(0, 200),
      price,
      currency: "MDL",
      stock: noPresent ? "out" : /Под заказ/i.test(tile.text()) ? "order" : "in_stock",
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: price != null ? "high" : "low",
      rawPriceText: price != null ? undefined : "см. на сайте",
    });
  });

  return offers;
}

/** WooCommerce product grid — never stamp query onto featured tiles */
export function parseWooCommerce(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const currency = ctx.currency || "MDL";

  // Explicit empty search (KoreaAuto etc.)
  if (
    $(".woocommerce-no-products-found, .woocommerce-info").text().match(
      /не найден|не знайден|no products|nu a fost|соответствующ/i
    )
  ) {
    return [];
  }

  $("li.product, .product.type-product, ul.products li, .woocommerce ul.products li").each((_, el) => {
    const card = $(el);
    const price =
      parsePrice(card.find(".woocommerce-Price-amount bdi, .woocommerce-Price-amount").first().text()) ??
      parsePrice(card.find(".price").first().text());
    if (price == null || price <= 0 || !isSanePartPrice(price)) return;
    const name =
      card.find(".woocommerce-loop-product__title, .product-title, h2, h3").first().text().trim() ||
      card.find("a").attr("aria-label") ||
      "";
    if (!name || name.length < 3) return;
    const href = card.find("a").first().attr("href");
    const skuRaw = card.find(".sku").text().trim() || "";
    const art = skuRaw || extractArticleFromName(name, "") || "";
    // Drop featured/related tiles that don't mention the searched OEM/article
    if (!cardMatchesQuery(ctx, name, art, card.text().slice(0, 160))) return;

    const key = `${name}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: extractBrandFromName(name),
      article: art || ctx.article,
      name: name.slice(0, 200),
      price,
      currency,
      stock: card.hasClass("outofstock") ? "out" : "unknown",
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: "high",
    });
  });

  return offers;
}

/**
 * Procar ADAC (procar.md): `.search-result-item.product-page`
 * — brand from `.brand-thumbs[alt]`, article `.item-supplier`,
 * — retail price in `.price-row p` or hidden `input[name=price]`,
 * — stock lines «Depozit …».
 */
export function parseProcar(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  const currency = ctx.currency || "MDL";

  $(".search-result-item.product-page, div.row.search-result-item").each((_, el) => {
    const card = $(el);
    // skip nested thumb-only nodes
    if (card.hasClass("search-result-item-thumb")) return;

    const art =
      card.find(".item-supplier").first().text().replace(/\s+/g, " ").trim() || ctx.article;
    const name =
      card.find("a.item-title-link").first().text().replace(/\s+/g, " ").trim() || art;
    const brand =
      card.find("img.brand-thumbs").attr("alt")?.trim() ||
      extractBrandFromName(name) ||
      "—";

    const price =
      parsePrice(card.find(".price-row p").first().text()) ??
      parsePrice(card.find('input[name="price"]').attr("value")) ??
      parsePrice(card.find(".price-row").first().text());

    if (!isSanePartPrice(price) || price === 0) return;

    const stockText = card.find(".stock-details").text() || card.text();
    let stock: StockStatus = "unknown";
    if (/>\s*0|[1-9]\d*\s*$/m.test(stockText) || />4|>\s*[1-9]/.test(stockText)) {
      stock = "in_stock";
    }
    // all depots zero → out / order
    const qtys = [...stockText.matchAll(/(?:Depozit[^:]*:|:\s*)\s*(>\s*\d+|\d+)/gi)].map((m) =>
      m[1].replace(/\s/g, "")
    );
    if (qtys.length && qtys.every((q) => q === "0" || q === ">0")) {
      stock = qtys.some((q) => q.startsWith(">") && q !== ">0") ? "in_stock" : "out";
    } else if (qtys.some((q) => q.startsWith(">") || (parseInt(q, 10) > 0))) {
      stock = "in_stock";
    }

    const href =
      card.find("a.item-title-link").attr("href") ||
      card.find('a[href*="/product"]').first().attr("href");
    const warehouses = card
      .find(".stock-details p")
      .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean)
      .join("; ");

    const key = `${brand}|${art}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);

    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand,
      article: art,
      name: name.slice(0, 200),
      price,
      currency,
      stock,
      delivery: warehouses || undefined,
      url: absUrl(ctx.baseUrl, href) || `${ctx.baseUrl}/search?q=${encodeURIComponent(ctx.article)}`,
      rawPriceText: `${price} ${currency}`,
    });
  });

  offers.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return offers;
}

/**
 * True if product text is actually about the searched article (not homepage junk).
 * Never attach query code to unrelated catalog tiles.
 * Rejects middle-substring traps like article 82537OC900 for query OC90.
 */
function cardMatchesQuery(ctx: ParseContext, name: string, art: string, extra = ""): boolean {
  const q = (ctx.article || "").replace(/[\s\-_./]/g, "").toUpperCase();
  if (q.length < 3) return false;

  const nArt = (art || "").replace(/[\s\-_./]/g, "").toUpperCase();
  if (nArt === q) return true;
  // OC90 / OC90OF / OC 90 OF — suffix only, not longer digit prefix (82537OC900)
  if (
    nArt.startsWith(q) &&
    nArt.length - q.length <= 4 &&
    /^[A-Z]*$/i.test(nArt.slice(q.length))
  ) {
    return true;
  }

  const blob = `${name} ${extra}`.replace(/\s+/g, " ");
  const blobN = blob.replace(/[\s\-_./]/g, "").toUpperCase();
  // name must contain query as its own token-ish run (allow OC 90)
  const flexible = q.replace(/([A-Z]+)(\d+)/i, "$1[\\s\\-]*$2");
  try {
    if (new RegExp(`(^|[^A-Z0-9])${flexible}([^A-Z0-9]|$)`, "i").test(blobN) ||
        new RegExp(`(^|[^A-Z0-9])${flexible}([^A-Z0-9]|$)`, "i").test(blob.toUpperCase())) {
      return true;
    }
  } catch {
    /* ignore bad re */
  }
  if (blobN.includes(q)) {
    const idx = blobN.indexOf(q);
    // only at start or after non-alnum boundary in normalized blob
    if (idx === 0 || /[^A-Z0-9]/.test(blobN[idx - 1] || "")) return true;
  }

  // tire-size query: 205/55R16
  if (/^\d{3}\d{2}R?\d{2}/i.test(q) && blobN.includes(q.slice(0, 5))) return true;
  return false;
}

/** Autoshina / SmadShop / Aproteh: .price or .preview_price with MDL */
export function parseMdlShopCards(html: string, ctx: ParseContext): PartOffer[] {
  const $ = cheerio.load(html);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  // Aproteh: .new_slider_slide + .preview_price "205 <span>MDL</span>"
  $(".new_slider_slide, .product_area .df > div[data-product_id]").each((_, el) => {
    const card = $(el);
    const priceText = card.find(".preview_price").first().text() || "";
    const m = priceText.match(/([0-9][0-9\s]*)(?:[.,]([0-9]{2}))?\s*MDL/i);
    if (!m) return;
    const price = parsePrice(`${m[1].replace(/\s/g, "")}.${m[2] || "00"}`);
    if (!isSanePartPrice(price)) return;

    const name =
      card.find(".preview_title a, .preview_title").first().text().replace(/\s+/g, " ").trim() ||
      card.find("img[alt]").attr("alt")?.trim() ||
      "";
    const artRaw =
      card.find(".characteristic_value").first().text().trim() ||
      card.find(".preview_code").first().text().trim() ||
      "";
    const art = artRaw || extractArticleFromName(name, "") || "";
    if (!name && !art) return;
    // Drop homepage / unrelated tiles that only match by inventing the query code
    if (!cardMatchesQuery(ctx, name, art, card.text().slice(0, 200))) return;

    const href = card.find("a[href]").first().attr("href");
    const outOfStock = card.find(".non_stock:not(.hidden)").length > 0;

    const key = `${art}|${name}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: extractBrandFromName(name),
      article: art || ctx.article,
      name: (name || art).slice(0, 200),
      price,
      currency: "MDL",
      stock: outOfStock ? "out" : "unknown",
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: "high",
    });
  });

  // cards with .price containing MDL — require query mention
  $(".product, .product-item, .item, .catalog-item, a.item_inner, .goods-item").each((_, el) => {
    const card = $(el);
    const priceText = card.find(".price, .preview_price").first().text() || "";
    const m = priceText.match(/([0-9][0-9\s]*)(?:[.,]([0-9]{2}))?\s*MDL/i);
    if (!m) return;
    const price = parsePrice(`${m[1].replace(/\s/g, "")}.${m[2] || "00"}`);
    if (!isSanePartPrice(price)) return;
    const name =
      card.find(".title, .name, .product-title, h2, h3, .item_title, .preview_title").first().text().trim() ||
      card.attr("title") ||
      "";
    if (!name || name.length < 3) return;
    const art = extractArticleFromName(name, "") || "";
    if (!cardMatchesQuery(ctx, name, art, card.text().slice(0, 200))) return;

    const href = card.is("a") ? card.attr("href") : card.find("a").attr("href");
    const key = `${name}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({
      supplier: ctx.supplier,
      supplierName: ctx.supplierName,
      brand: extractBrandFromName(name),
      article: art || ctx.article,
      name: name.slice(0, 200),
      price,
      currency: "MDL",
      stock: "unknown",
      url: absUrl(ctx.baseUrl, href),
      priceConfidence: "medium",
    });
  });

  // No blind ".price" harvest that stamps ctx.article on every tire on the homepage

  return offers;
}

export function dedupeOffers(offers: PartOffer[]): PartOffer[] {
  const seen = new Set<string>();
  const out: PartOffer[] = [];
  for (const o of offers) {
    const k = `${o.supplier}|${o.brand}|${o.article}|${o.price}|${o.name.slice(0, 30)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
}
