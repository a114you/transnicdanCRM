/**
 * Full catalog of Moldovan auto-parts suppliers.
 * scrape=true → online price search enabled
 * scrape=false → listed for comparison UI / category links / manual open
 */

export type ScrapeMode =
  | "none"
  | "automall"
  | "proparts"
  | "schema"
  | "autoport"
  | "daac"
  | "nipon"
  | "wp_search"
  | "query_search"
  | "autotrade"
  | "aps" // APS / ENORM / AutoResident productslist tables
  | "automall_tiles" // webmallpmr / AutoMall HTML tiles
  | "woocommerce"
  | "mdl_shop" // autoshina / smadshop / aproteh price+MDL cards
  | "procar" // procar.md search-result-item + retail price
  | "autodoctor";

export interface SupplierCategoryLink {
  categoryId: string;
  url: string;
}

export interface SupplierDef {
  id: string;
  name: string;
  nameRo?: string;
  website?: string;
  searchUrl?: string; // {q} placeholder
  scrape: ScrapeMode;
  city?: string;
  notes?: string;
  phone?: string;
  /** categoryId → deep link on this supplier */
  categories?: Record<string, string>;
  priority?: number; // lower = search first
  enabledByDefault?: boolean;
  /**
   * Guest sees little / no price without account.
   * User can register and give login for adapter study.
   */
  authRequired?: boolean;
  /** Direct login / registration page */
  loginUrl?: string;
  /** Short note for UI: what login unlocks */
  authNotes?: string;
}

/** Unified category IDs used across ALL suppliers */
export const UNIFIED_CATEGORY_IDS = [
  "filters-oil",
  "filters-air",
  "filters-cabin",
  "filters-fuel",
  "brakes",
  "brake-discs",
  "brake-pads",
  "suspension",
  "steering",
  "engine",
  "cooling",
  "ignition",
  "electrics",
  "lamps",
  "belts",
  "clutch",
  "transmission",
  "exhaust",
  "body",
  "oils-motor",
  "oils-trans",
  "fluids",
  "chemistry",
  "wipers",
  "batteries",
  "tires",
  "accessories",
  "selection-car",
] as const;

export type UnifiedCategoryId = (typeof UNIFIED_CATEGORY_IDS)[number];

export const UNIFIED_CATEGORIES: Array<{
  id: UnifiedCategoryId;
  nameRu: string;
  nameRo: string;
  group: string;
  searchHints: string[]; // article/name hints for category browse search
}> = [
  { id: "filters-oil", nameRu: "Масляные фильтры", nameRo: "Filtre ulei", group: "filters", searchHints: ["OC90", "W712/75", "HU6008x"] },
  { id: "filters-air", nameRu: "Воздушные фильтры", nameRo: "Filtre aer", group: "filters", searchHints: ["C27022", "LX1780"] },
  { id: "filters-cabin", nameRu: "Салонные фильтры", nameRo: "Filtre habitaclu", group: "filters", searchHints: ["LAK182", "CU2939"] },
  { id: "filters-fuel", nameRu: "Топливные фильтры", nameRo: "Filtre combustibil", group: "filters", searchHints: ["WK820/14", "KL228/1"] },
  { id: "brakes", nameRu: "Тормозная система", nameRo: "Sistem de frânare", group: "brakes", searchHints: ["GDB1550", "0986424590"] },
  { id: "brake-discs", nameRu: "Тормозные диски", nameRo: "Discuri frână", group: "brakes", searchHints: ["0986479D32", "DF4180"] },
  { id: "brake-pads", nameRu: "Тормозные колодки", nameRo: "Plăcuțe frână", group: "brakes", searchHints: ["GDB1550", "0986494614"] },
  { id: "suspension", nameRu: "Подвеска", nameRo: "Suspensie", group: "chassis", searchHints: ["JTS392", "VKDA40111"] },
  { id: "steering", nameRu: "Рулевое управление", nameRo: "Direcție", group: "chassis", searchHints: ["JTE357", "BDA466"] },
  { id: "engine", nameRu: "Двигатель", nameRo: "Motor", group: "engine", searchHints: ["02915F", "038103485"] },
  { id: "cooling", nameRu: "Охлаждение", nameRo: "Răcire", group: "engine", searchHints: ["P1500", "CRF0008"] },
  { id: "ignition", nameRu: "Зажигание / свечи", nameRo: "Aprindere / bujii", group: "engine", searchHints: ["BKR6E", "IK20"] },
  { id: "electrics", nameRu: "Электрика", nameRo: "Electrică", group: "electrics", searchHints: ["0 986 041 280"] },
  { id: "lamps", nameRu: "Лампы / свет", nameRo: "Becuri / iluminat", group: "electrics", searchHints: ["H7", "H4 12V"] },
  { id: "belts", nameRu: "Ремни / ролики", nameRo: "Curele / role", group: "engine", searchHints: ["6PK1195", "VKM31032"] },
  { id: "clutch", nameRu: "Сцепление", nameRo: "Ambreiaj", group: "drivetrain", searchHints: ["3000 951 003"] },
  { id: "transmission", nameRu: "Трансмиссия", nameRo: "Transmisie", group: "drivetrain", searchHints: ["ATF", "75W90"] },
  { id: "exhaust", nameRu: "Выхлоп", nameRo: "Evacuare", group: "chassis", searchHints: ["1731A", "1730A"] },
  { id: "body", nameRu: "Кузов / оптика", nameRo: "Caroserie / optică", group: "body", searchHints: ["бампер", "fara"] },
  { id: "oils-motor", nameRu: "Моторные масла", nameRo: "Uleiuri motor", group: "fluids", searchHints: ["5W30", "5W40"] },
  { id: "oils-trans", nameRu: "Трансмиссионные масла", nameRo: "Uleiuri transmisie", group: "fluids", searchHints: ["75W90", "ATF DW1"] },
  { id: "fluids", nameRu: "Жидкости (ТОЖ, тормозная)", nameRo: "Lichide (antigel, frână)", group: "fluids", searchHints: ["DOT4", "G12"] },
  { id: "chemistry", nameRu: "Автохимия", nameRo: "Chimie auto", group: "fluids", searchHints: ["очиститель", "wd40"] },
  { id: "wipers", nameRu: "Дворники", nameRo: "Ștergătoare", group: "accessories", searchHints: ["400mm", "650mm"] },
  { id: "batteries", nameRu: "АКБ", nameRo: "Baterii", group: "electrics", searchHints: ["60Ah", "74Ah"] },
  { id: "tires", nameRu: "Шины / диски", nameRo: "Anvelope / jante", group: "tires", searchHints: ["205/55R16"] },
  { id: "accessories", nameRu: "Аксессуары", nameRo: "Accesorii", group: "accessories", searchHints: ["коврик", "чехол"] },
  { id: "selection-car", nameRu: "Подбор по авто", nameRo: "Selectare după auto", group: "catalog", searchHints: [] },
];

export const CATEGORY_GROUPS: Record<string, { ru: string; ro: string }> = {
  filters: { ru: "Фильтры", ro: "Filtre" },
  brakes: { ru: "Тормоза", ro: "Frâne" },
  chassis: { ru: "Ходовая", ro: "Tren rulare" },
  engine: { ru: "Двигатель", ro: "Motor" },
  drivetrain: { ru: "Трансмиссия", ro: "Transmisie" },
  electrics: { ru: "Электрика", ro: "Electrică" },
  body: { ru: "Кузов", ro: "Caroserie" },
  fluids: { ru: "Масла и жидкости", ro: "Uleiuri și lichide" },
  accessories: { ru: "Аксессуары", ro: "Accesorii" },
  tires: { ru: "Шины", ro: "Anvelope" },
  catalog: { ru: "Каталог", ro: "Catalog" },
};

/**
 * ALL Moldovan suppliers from business list + known online shops.
 * Duplicates from user list are merged once.
 */
export const SUPPLIER_CATALOG: SupplierDef[] = [
  // ── Online scrapable (priority) ──────────────────────────────────────────
  {
    id: "proparts",
    name: "ProParts",
    website: "https://proparts.md",
    searchUrl: "https://proparts.md/search/number/?article={q}",
    scrape: "proparts",
    city: "Chișinău",
    priority: 1,
    enabledByDefault: true,
    categories: {
      "filters-oil": "https://proparts.md/search/number/?article=OC90",
      "brakes": "https://proparts.md/search/number/?article=GDB1550",
      "oils-motor": "https://proparts.md/search/number/?article=5W30",
      "selection-car": "https://proparts.md/",
    },
  },
  {
    id: "automall",
    name: "AutoMall",
    website: "https://www.automall.md",
    searchUrl: "https://www.automall.md/Catalog/Search?number={q}",
    scrape: "automall",
    city: "Chișinău",
    priority: 2,
    enabledByDefault: true,
    notes:
      "MD: www.automall.md (Imperva). Каталог brand/art — через twin webmallpmr (без цен PMR). В UI: ссылки AutoMall MD, цена «см. на сайте».",
    authRequired: false,
    loginUrl: "https://www.automall.md/Security/LogOn",
    authNotes: "Опционально AUTOMALL_COOKIE для MDL-цен; иначе каталог + см. на сайте",
    categories: {
      "selection-car": "https://www.automall.md/Auto/Selection?forTrucks=False",
      "oils-motor": "https://www.automall.md/Auto/10345/motor-oil",
      "oils-trans": "https://www.automall.md/Auto/oil/trans_oil",
      "chemistry": "https://www.automall.md/Auto/avtohimia",
      "lamps": "https://www.automall.md/Auto/autolamp/lamp-12volt",
      "accessories": "https://www.automall.md/Auto/accessory",
      "fluids": "https://www.automall.md/Auto/9083",
      "brakes": "https://www.automall.md/Auto/9241",
      "filters-oil": "https://www.automall.md/Catalog/Search?number=OC90",
    },
  },
  {
    id: "allpiese",
    name: "AllPiese",
    website: "https://allpiese.md",
    searchUrl: "https://allpiese.md/search?q={q}",
    scrape: "schema",
    city: "Chișinău",
    priority: 3,
    enabledByDefault: true,
    categories: {
      "filters-oil": "https://allpiese.md/search?q=filtru+ulei",
      "brakes": "https://allpiese.md/search?q=frana",
      "oils-motor": "https://allpiese.md/search?q=ulei+motor",
      "tires": "https://allpiese.md/search?q=anvelope",
      "selection-car": "https://allpiese.md/",
    },
  },
  {
    id: "autoport",
    name: "AutoPort",
    website: "https://autoport.md",
    searchUrl: "https://autoport.md/?s={q}",
    scrape: "autoport",
    city: "Chișinău",
    priority: 4,
    enabledByDefault: true,
    categories: {
      "filters-oil": "https://autoport.md/?s=filtru+ulei",
      "brakes": "https://autoport.md/?s=placa+frana",
      "cooling": "https://autoport.md/?s=radiator",
      "selection-car": "https://autoport.md/",
    },
  },
  {
    id: "daac",
    name: "DAAC Piese",
    website: "https://daac-piese.md",
    searchUrl: "https://daac-piese.md/ru/poisk?search={q}",
    scrape: "daac",
    city: "Chișinău",
    priority: 5,
    enabledByDefault: true,
    categories: {
      "tires": "https://daac-piese.md/ru/catalog/anvelope",
      "batteries": "https://daac-piese.md/ru/catalog/baterii",
      "accessories": "https://daac-piese.md/ru/catalog/accessorii",
      "oils-motor": "https://daac-piese.md/ru/poisk?search=5W30",
      "selection-car": "https://daac-piese.md/ru/",
    },
  },
  {
    id: "niponauto",
    name: "Nipon Auto",
    website: "https://niponauto.md",
    searchUrl: "https://niponauto.md/ru/search?key={q}",
    scrape: "nipon",
    city: "Chișinău",
    priority: 6,
    enabledByDefault: true,
    notes:
      "Гость: бренд/номер без цен. С NIPON_EMAIL+NIPON_PASSWORD — карточки «Ваша цена» (лей)",
    authRequired: true,
    loginUrl: "https://niponauto.md/login",
    authNotes:
      "Логин: https://niponauto.md/login → env NIPON_EMAIL / NIPON_PASSWORD (или NIPON_COOKIE)",
    categories: {
      "oils-motor": "https://niponauto.md/ru/catalog",
      "selection-car": "https://niponauto.md/ru",
      "filters-oil": "https://niponauto.md/ru/search?key=OC90",
    },
  },
  {
    id: "euroauto",
    name: "EuroAuto",
    website: "http://euroauto.md",
    searchUrl: "http://euroauto.md/?s={q}",
    scrape: "wp_search",
    city: "Chișinău",
    priority: 7,
    enabledByDefault: false,
    notes: "WP-поиск без структурированных OEM-цен — не в дефолтном OEM-поиске",
    categories: {
      "suspension": "http://euroauto.md/catalog-category/podveska/",
      "electrics": "http://euroauto.md/catalog-category/electrica/",
      "filters-oil": "http://euroauto.md/catalog-category/filters/",
      "selection-car": "http://euroauto.md/",
    },
  },
  {
    id: "autodoctor",
    name: "AutoDoctor",
    website: "https://autodoctor.md",
    searchUrl: "https://autodoctor.md/shop/search/products/{q}",
    scrape: "autodoctor",
    city: "Chișinău",
    priority: 2,
    enabledByDefault: true,
    notes: "Публичный каталог /shop/search/products/{code} без логина",
    categories: {
      "selection-car": "https://autodoctor.md/",
      "filters-oil": "https://autodoctor.md/shop/search/products/OC90",
    },
  },
  {
    id: "piese4auto",
    name: "Piese4Auto",
    website: "https://piese4auto.md",
    searchUrl: "https://piese4auto.md/search?q={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 9,
    enabledByDefault: false,
    notes: "uCoz / abandoned — не OEM-каталог",
    categories: { "selection-car": "https://piese4auto.md/", "filters-oil": "https://piese4auto.md/search?q=OC90" },
  },
  {
    id: "automag",
    name: "AutoMag / Piese Auto MD",
    website: "https://automag.md",
    searchUrl: "https://automag.md/?s={q}",
    scrape: "wp_search",
    city: "Stăuceni / Chișinău",
    priority: 10,
    enabledByDefault: false,
    notes: "WP без OEM-прайса в HTML",
    categories: { "body": "https://automag.md/?s=polcar", "selection-car": "https://automag.md/" },
  },
  {
    id: "xpressauto",
    name: "Xpress-Auto",
    website: "https://xpress-auto.md",
    searchUrl: "https://xpress-auto.md/?s={q}",
    scrape: "woocommerce",
    city: "Chișinău",
    priority: 11,
    enabledByDefault: true,
    notes: "WP/Woo: ?s={q}; пустой поиск = featured — match-gate; shell если пусто",
    categories: { "selection-car": "https://xpress-auto.md/", "filters-oil": "https://xpress-auto.md/?s=OC90" },
  },
  {
    id: "autotrade",
    name: "AutoTrade",
    website: "https://www.autotrade.md",
    searchUrl: "https://www.autotrade.md/search.html?article={q}",
    scrape: "autotrade",
    city: "Chișinău",
    priority: 12,
    enabledByDefault: true,
    notes: "SPA: /search.html?article={q} — цены в JS (token). Shell-ссылка OEM в браузер",
    authRequired: true,
    loginUrl: "https://www.autotrade.md/",
    authNotes: "SPA API с token; гостевой HTML без цен — нужен аккаунт/сессия для полного прайса",
    categories: { "selection-car": "https://www.autotrade.md/", "filters-oil": "https://www.autotrade.md/search.html?article=OC90" },
  },
  {
    id: "procar",
    name: "Procar ADAC",
    website: "https://procar.md",
    searchUrl: "https://procar.md/search?q={q}",
    scrape: "procar",
    city: "Chișinău",
    priority: 4,
    enabledByDefault: true,
    notes: "Открытый поиск: бренд, артикул, розница MDL, склады Varnita/Dacia",
    categories: {
      "selection-car": "https://procar.md/",
      "filters-oil": "https://procar.md/search?q=OC90",
      "brakes": "https://procar.md/search?q=GDB199",
    },
  },
  {
    id: "psauto",
    name: "PS Auto",
    website: "https://psauto.md",
    searchUrl: "https://psauto.md/ru/search/?q={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 14,
    enabledByDefault: false,
    notes: "Нет публичного OEM-прайса в HTML",
    categories: { "selection-car": "https://psauto.md/ru/", "oils-motor": "https://psauto.md/ru/" },
  },
  {
    id: "seol",
    name: "Seol / Seol-Group",
    website: "https://seol.md",
    scrape: "none",
    city: "Chișinău",
    priority: 15,
    enabledByDefault: false,
    notes: "Корп. сайт, не прайс автозапчастей",
    categories: { "selection-car": "https://seol.md/" },
  },
  {
    id: "autorai",
    name: "Autorai",
    website: "https://autorai.md",
    scrape: "none",
    city: "Chișinău",
    priority: 16,
    enabledByDefault: false,
    notes: "Авто с пробегом, не каталог запчастей",
    categories: { "selection-car": "https://autorai.md/" },
  },
  {
    id: "technocar",
    name: "TechnoCar",
    website: "https://technocar.md",
    searchUrl: "https://technocar.md/?s={q}",
    scrape: "wp_search",
    city: "Chișinău",
    priority: 17,
    enabledByDefault: false,
    notes: "WP без OEM-прайса",
    categories: { "selection-car": "https://technocar.md/" },
  },
  {
    id: "autoshina",
    name: "Autoshina.md",
    website: "https://autoshina.md",
    searchUrl: "https://autoshina.md/poisk/?search={q}",
    scrape: "mdl_shop",
    city: "Chișinău",
    priority: 14,
    enabledByDefault: true,
    notes: "Шины / резина — открытый прайс MDL",
    categories: {
      "tires": "https://autoshina.md/",
      "selection-car": "https://autoshina.md/",
    },
  },
  {
    id: "zap",
    name: "ZAP.md",
    website: "https://zap.md",
    scrape: "none",
    city: "Chișinău",
    priority: 19,
    enabledByDefault: false,
    notes: "Сайт-заглушка, каталога нет",
    categories: { "selection-car": "https://zap.md/" },
  },
  {
    id: "alvadi",
    name: "Alvadi",
    website: "https://alvadi.md",
    searchUrl: "https://alvadi.md/search?q={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 20,
    enabledByDefault: true,
    notes: "Cloudflare — часто нужен unlock",
    categories: { "selection-car": "https://alvadi.md/" },
  },
  {
    id: "intercars",
    name: "Inter Cars Moldova",
    website: "https://md.e-cat.intercars.eu",
    searchUrl: "https://md.e-cat.intercars.eu/ru/",
    scrape: "none",
    city: "Chișinău",
    priority: 21,
    enabledByDefault: true,
    notes: "B2B e-cat — есть каталог, нужен аккаунт (403 guest)",
    authRequired: true,
    loginUrl: "https://md.e-cat.intercars.eu/ru/",
    authNotes: "B2B TecDoc e-cat Inter Cars: регистрация/договор дилера → после логина можно спарсить OEM+аналоги",
    categories: { "selection-car": "https://md.e-cat.intercars.eu/ru/" },
  },
  {
    id: "groupauto",
    name: "GroupAuto Moldova",
    website: "https://groupauto.md",
    scrape: "none",
    city: "Chișinău",
    priority: 22,
    enabledByDefault: false,
    notes: "Ассоциация дистрибьюторов, не e-shop",
    categories: { "selection-car": "https://groupauto.md/" },
  },
  {
    id: "eurogarage",
    name: "EuroGarage",
    website: "https://eurogarage.md",
    scrape: "none",
    city: "Молдова (сеть СТО)",
    priority: 23,
    enabledByDefault: false,
    notes: "Сеть СТО >30 точек, не прайс запчастей",
    categories: { "selection-car": "https://eurogarage.md/" },
  },
  {
    id: "autoline",
    name: "AutoLine MD",
    website: "https://autoline.md",
    scrape: "none",
    city: "Chișinău",
    priority: 25,
    enabledByDefault: false,
    notes: "Авторынок коммерческого транспорта",
    categories: { "selection-car": "https://autoline.md/" },
  },
  {
    id: "autodoc_md",
    name: "AutoDoc.md",
    website: "https://autodoc.md",
    searchUrl: "https://autodoc.md/index.php?route=product/search&search={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 26,
    enabledByDefault: true,
    categories: { "selection-car": "https://autodoc.md/" },
  },

  // ── Newly discovered open catalogs (quality scrapers) ────────────────────
  {
    id: "enorm",
    name: "ENORM",
    website: "https://www.enorm.md",
    searchUrl: "https://www.enorm.md/search_products/?query={q}",
    scrape: "aps",
    city: "Chișinău",
    priority: 3,
    enabledByDefault: true,
    notes: "Открытый каталог, розничные цены в лей",
    categories: {
      "filters-oil": "https://www.enorm.md/search_products/?query=OC90",
      "oils-motor": "https://www.enorm.md/catalog/oils/",
      "fluids": "https://www.enorm.md/catalog/zhidkosti/",
      "chemistry": "https://www.enorm.md/catalog/avtohimiia/",
      "batteries": "https://www.enorm.md/catalog/batteries/",
      "accessories": "https://www.enorm.md/catalog/aksessuari/",
      "selection-car": "https://www.enorm.md/catalog/avtozapchasti/",
    },
  },
  {
    id: "aps",
    name: "APS / Autoprogresiv Service",
    website: "https://www.aps.md",
    searchUrl: "https://www.aps.md/search_products/?query={q}",
    scrape: "aps",
    city: "Chișinău",
    phone: "+373 69 522 815",
    priority: 3,
    enabledByDefault: true,
    notes:
      "Открытый каталог: список brand/code/склад; розница на /products/… (дотягиваем «Розничная цена»)",
    categories: {
      "filters-oil": "https://www.aps.md/search_products/?query=OC90",
      "engine": "https://www.aps.md/catalog/dvigatel-i-vihlop/",
      "steering": "https://www.aps.md/catalog/rulevoe-upravlenie/",
      "ignition": "https://www.aps.md/catalog/sistema-zazhiganiia/",
      "selection-car": "https://www.aps.md/",
    },
  },
  {
    id: "autoresident",
    name: "AutoResident",
    website: "https://www.autoresident.md",
    searchUrl: "https://www.autoresident.md/search_products/?query={q}",
    scrape: "aps",
    city: "Chișinău",
    priority: 4,
    enabledByDefault: true,
    notes: "Открытый каталог (та же платформа, что APS/ENORM) — без логина",
    categories: {
      "filters-oil": "https://www.autoresident.md/search_products/?query=OC90",
      "selection-car": "https://www.autoresident.md/",
    },
  },
  {
    id: "webmallpmr",
    name: "WebMall / AutoMall PMR",
    website: "https://webmallpmr.md",
    searchUrl: "https://webmallpmr.md/Catalog/Search?number={q}",
    scrape: "none",
    city: "Tiraspol / PMR",
    priority: 99,
    enabledByDefault: false,
    notes:
      "Не отдельный поставщик в UI. Используется только как open-catalog mirror внутри scraper AutoMall (brand/art → ссылки MD, без руб.).",
    categories: {
      "selection-car": "https://webmallpmr.md/",
    },
  },
  {
    id: "aproteh",
    name: "Aproteh",
    website: "https://aproteh.md",
    searchUrl: "https://aproteh.md/poisk/?search={q}",
    scrape: "mdl_shop",
    city: "Chișinău (сеть)",
    priority: 12,
    enabledByDefault: true,
    notes: "Сеть: масла, шины, АКБ, аксессуары — preview_price MDL",
    categories: {
      "selection-car": "https://aproteh.md/",
      "oils-motor": "https://aproteh.md/katalog/masla/",
      "tires": "https://aproteh.md/katalog/shiny/",
      "batteries": "https://aproteh.md/katalog/akkumulyatory/",
      "filters-oil": "https://aproteh.md/poisk/?search=filtru",
    },
  },
  {
    id: "koreaauto",
    name: "KoreaAuto Parts",
    website: "https://koreaauto.md",
    searchUrl: "https://koreaauto.md/?s={q}&post_type=product",
    scrape: "woocommerce",
    city: "Chișinău",
    priority: 12,
    enabledByDefault: true,
    notes: "Hyundai / Kia / корейские",
    categories: {
      "selection-car": "https://koreaauto.md/",
      "filters-oil": "https://koreaauto.md/?s=filtru&post_type=product",
    },
  },
  {
    id: "anvelope_md",
    name: "Anvelope.md",
    website: "https://anvelope.md",
    searchUrl: "https://anvelope.md/cautare?q={q}",
    scrape: "mdl_shop",
    city: "Chișinău",
    priority: 15,
    enabledByDefault: true,
    notes: "Шины",
    categories: {
      "tires": "https://anvelope.md/",
      "selection-car": "https://anvelope.md/",
    },
  },
  {
    id: "masterlux_web",
    name: "MasterLux (master-lux.md)",
    website: "https://master-lux.md",
    searchUrl: "https://master-lux.md/search?search={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 16,
    enabledByDefault: true,
    notes: "Шины / сервис",
    categories: {
      "tires": "https://master-lux.md/",
      "selection-car": "https://master-lux.md/",
    },
  },
  {
    id: "pandashop",
    name: "PandaShop (авто)",
    website: "https://www.pandashop.md",
    searchUrl: "https://www.pandashop.md/ru/search/?text={q}",
    scrape: "schema",
    city: "Chișinău",
    priority: 18,
    enabledByDefault: false,
    notes:
      "Универмаг: поиск по цифрам ловит куклы/пазлы (43852, 23000). По умолчанию выкл.; фильтр всё равно отсекает non-auto",
    categories: {
      "accessories": "https://www.pandashop.md/ru/catalog/auto_electronics/auto_parts/",
      "selection-car": "https://www.pandashop.md/ru/catalog/auto_electronics/auto_parts/",
    },
  },
  {
    id: "smadshop",
    name: "SmadShop (авто)",
    website: "https://smadshop.md",
    searchUrl: "https://smadshop.md/poisk/?search={q}",
    scrape: "mdl_shop",
    city: "Chișinău",
    priority: 19,
    enabledByDefault: true,
    notes: "Универмаг + товары для авто",
    categories: {
      "accessories": "https://smadshop.md/avto/",
      "selection-car": "https://smadshop.md/avto/",
    },
  },
  {
    id: "olmosdon",
    name: "Olmosdon (AE)",
    website: "https://www.olmosdon.com",
    scrape: "none",
    city: "Chișinău",
    priority: 40,
    enabledByDefault: true,
    notes: "Бренд AE, каталоги PDF",
    categories: { "selection-car": "https://www.olmosdon.com/catalogues.html" },
  },

  // ── Offline / phone / marketplace (listed for completeness) ──────────────
  // «сайт» = есть публичный URL, но парсера цен пока нет / WAF / не shop.
  // «офлайн» = нет подтверждённого публичного каталога.
  { id: "almasdon", name: "Almasdon", scrape: "none", city: "Chișinău", priority: 50, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "premierauto", name: "Premier Auto", scrape: "none", city: "Chișinău", priority: 51, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "madalauto", name: "Madal Auto", scrape: "none", city: "Chișinău", priority: 52, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "vegaauto", name: "Vega Auto Market", scrape: "none", city: "Chișinău", priority: 53, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "pieseauto", name: "Piese Auto", scrape: "none", city: "Chișinău", priority: 54, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "pieseauto_burebista", name: "Piese Auto Burebista", scrape: "none", city: "Chișinău", priority: 55, enabledByDefault: false, notes: "Burebista — телефон / визит" },
  // aprotehpro / automall_group removed as duplicates of aproteh + automall
  { id: "gbs", name: "GBS Auto", website: "https://gbsauto.md", scrape: "none", city: "Chișinău", priority: 58, enabledByDefault: false, notes: "Дилер авто, не прайс запчастей" },
  { id: "autoshop", name: "Autoshop.md", website: "https://autoshop.md", scrape: "none", city: "Chișinău", priority: 59, enabledByDefault: false, notes: "Хостинг-заглушка, каталога нет" },
  { id: "avtoplus", name: "AvtoPlus", scrape: "none", city: "Chișinău", priority: 60, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "autolux", name: "AutoLux", website: "https://autolux.md", scrape: "none", city: "Chișinău", priority: 61, enabledByDefault: false, notes: "Автосалон (машины), не запчасти" },
  { id: "carzone", name: "CarZone Moldova", scrape: "none", city: "Chișinău", priority: 62, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "autoexpert", name: "AutoExpert", scrape: "none", city: "Chișinău", priority: 63, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "expert_auto_parts", name: "Expert Auto Parts", scrape: "none", city: "Chișinău", priority: 64, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "diesel_service", name: "Diesel Service MD", scrape: "none", city: "Chișinău", priority: 65, enabledByDefault: false, notes: "Дизель / ТНВД — телефон" },
  { id: "truck_parts", name: "Truck Parts Moldova", scrape: "none", city: "Chișinău", priority: 66, enabledByDefault: false, notes: "Грузовые — нет публичного каталога" },
  { id: "japancar", name: "Japancar Moldova", scrape: "none", city: "Chișinău", priority: 67, enabledByDefault: false, notes: "Японские авто — нет публичного каталога" },
  { id: "autoleader", name: "AutoLeader MD", scrape: "none", city: "Chișinău", priority: 68, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "europarts", name: "EuroParts Moldova", scrape: "none", city: "Chișinău", priority: 69, enabledByDefault: false, notes: "Концепт GroupAuto, не e-shop" },
  { id: "best_auto_parts", name: "Best Auto Parts MD", scrape: "none", city: "Chișinău", priority: 70, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "autoprofi", name: "AutoProfi MD", scrape: "none", city: "Chișinău", priority: 71, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "master_service", name: "Master Service Auto", scrape: "none", city: "Chișinău", priority: 72, enabledByDefault: false, notes: "Сервис — телефон" },
  { id: "original_parts", name: "Original Parts MD", scrape: "none", city: "Chișinău", priority: 73, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  { id: "avtomir", name: "AvtoMir Moldova", scrape: "none", city: "Chișinău", priority: 74, enabledByDefault: false, notes: "Нет публичного .md-каталога" },
  {
    id: "agropiese",
    name: "AgroPiese",
    website: "https://agropiese.md",
    searchUrl: "https://agropiese.md/search?q={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 75,
    enabledByDefault: true,
    notes: "Каталог есть; часто 403/WAF с DC — нужен proxy/unlock",
    categories: { "selection-car": "https://agropiese.md/" },
  },
  {
    id: "fixbox",
    name: "FixBox.md",
    website: "https://fixbox.md",
    searchUrl: "https://fixbox.md/?s={q}",
    scrape: "query_search",
    city: "Chișinău",
    priority: 20,
    enabledByDefault: true,
    notes:
      "Cloudflare Turnstile (KvikShop). HTTP 444 без cookie. FIXBOX_COOKIE=cf_clearance=… или PARTS_BROWSER_UNLOCK=1 (Chrome headed).",
    categories: { "selection-car": "https://fixbox.md/", "filters-oil": "https://fixbox.md/?s=OC90" },
  },
];

export function getSupplier(id: string): SupplierDef | undefined {
  return SUPPLIER_CATALOG.find((s) => s.id === id);
}

export function scrapableSuppliers(): SupplierDef[] {
  return SUPPLIER_CATALOG.filter((s) => s.scrape !== "none").sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  );
}

/**
 * Tier-1: open OEM catalogs (searchUrl?q=OEM → HTML prices or deep links).
 * Same pattern as AutoMall: no proxy required for open hosts.
 */
export const CORE_ARTICLE_SUPPLIERS = [
  "proparts", // /search/number/?article= + top-price-analog rows
  "enorm", // /search_products/?query=  (full guest prices + analog rows)
  "procar", // /search?q=
  "automall", // MD UI + PMR catalog mirror for brand/art (no PMR prices)
  "autodoctor", // /shop/search/products/{code} + matchedBy analog/cross
  "allpiese", // /search?q=
  "daac", // /ru/poisk?search=
  "autoresident", // open APS-platform catalog
  "aps", // open: list + product-page retail prices
  "niponauto", // /ru/search?key= + NIPON_EMAIL prices
  "koreaauto", // Woo Hyundai/Kia — useful for KR OEM
  "autoport", // WP search — OEM when present
  "aproteh", // oils/filters network MDL
];

/**
 * Tier-2: secondary open shops — OEM URL if they have it; shell link if empty.
 * Dead WP shells / tire-only / marketplace noise kept last or off.
 */
export const SECONDARY_ARTICLE_SUPPLIERS = [
  "fixbox", // CF Turnstile — cookie / browser unlock
  "autotrade", // SPA guest — shell link until API token
  "xpressauto", // WP xpress-auto.md
  "autodoc_md", // OpenCart search
  "autoshina", // tires only — useful for size, not OEM pins
  "anvelope_md",
  // weak / abandoned WP (still shell-link via generic if enabled)
  // "euroauto", "automag", "technocar", "psauto", "piese4auto", "smadshop", "masterlux_web"
];

/** Shops that need account — shown in UI with login links (not scraped until creds) */
export function authRequiredSuppliers(): Array<{
  id: string;
  name: string;
  website?: string;
  loginUrl: string;
  authNotes?: string;
  notes?: string;
}> {
  return SUPPLIER_CATALOG.filter((s) => s.authRequired && s.loginUrl)
    .map((s) => ({
      id: s.id,
      name: s.name,
      website: s.website,
      loginUrl: s.loginUrl!,
      authNotes: s.authNotes || s.notes,
      notes: s.notes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * WAF hosts: shell link without proxy; full scrape only with unlock/proxy or PARTS_TRY_WAF=1.
 */
// fixbox moved to secondary with dedicated Turnstile path (cookie / browser unlock)
export const WAF_ARTICLE_SUPPLIERS = ["alvadi", "agropiese"];

/** Full default for phase=all (core + secondary). No WAF unless env forces. */
export const QUALITY_ARTICLE_SUPPLIERS = [
  ...CORE_ARTICLE_SUPPLIERS,
  ...SECONDARY_ARTICLE_SUPPLIERS,
];

function filterScrapableIds(ids: string[]): string[] {
  return ids.filter((id) => {
    const s = getSupplier(id);
    return s && s.scrape !== "none";
  });
}

function hasBypassTools(): boolean {
  // Lazy require to avoid circular init; validate proxy is not a docs placeholder
  let realProxy = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hasConfiguredProxy } = require("../http") as {
      hasConfiguredProxy: () => boolean;
    };
    realProxy = hasConfiguredProxy();
  } catch {
    realProxy = false;
  }
  return !!(
    realProxy ||
    process.env.PARTS_UNLOCK_URL?.trim() ||
    process.env.SCRAPINGBEE_API_KEY?.trim() ||
    process.env.PARTS_SCRAPINGBEE_KEY?.trim() ||
    process.env.FLARESOLVERR_URL?.trim() ||
    process.env.AUTOMALL_COOKIE?.trim()
  );
}

export function coreSearchSupplierIds(): string[] {
  return filterScrapableIds(CORE_ARTICLE_SUPPLIERS);
}

/** WP/dead sites that only waste time on OEM article search */
const OEM_SEARCH_SKIP = new Set([
  "euroauto",
  "automag",
  "technocar",
  "psauto",
  "piese4auto",
  "smadshop",
  "masterlux_web",
  "pandashop", // marketplace number noise
  "olmosdon",
  "webmallpmr", // PMR prices — never in MD search
]);

export function secondarySearchSupplierIds(): string[] {
  // Explicit secondary list only — do not auto-pull abandoned WP shells
  const core = new Set(CORE_ARTICLE_SUPPLIERS);
  const waf = new Set(WAF_ARTICLE_SUPPLIERS);
  return filterScrapableIds(SECONDARY_ARTICLE_SUPPLIERS).filter(
    (id) => !core.has(id) && !waf.has(id) && !OEM_SEARCH_SKIP.has(id)
  );
}

export function wafSearchSupplierIds(): string[] {
  if (process.env.PARTS_TRY_WAF === "0") return [];
  // Allow WAF only with proxy/unlock or explicit PARTS_TRY_WAF=1
  if (!hasBypassTools() && process.env.PARTS_TRY_WAF !== "1") return [];
  return filterScrapableIds(WAF_ARTICLE_SUPPLIERS);
}

export type SearchPhase = "core" | "secondary" | "waf" | "all";

export function defaultSearchSupplierIds(phase: SearchPhase = "all"): string[] {
  const fromEnv = process.env.PARTS_ENABLED_SUPPLIERS?.trim();
  if (fromEnv) {
    return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (phase === "core") return coreSearchSupplierIds();
  if (phase === "secondary") return secondarySearchSupplierIds();
  if (phase === "waf") return wafSearchSupplierIds();
  const quality = [
    ...filterScrapableIds(QUALITY_ARTICLE_SUPPLIERS),
    ...wafSearchSupplierIds(),
  ];
  // unique preserve order
  return [...new Set(quality.length ? quality : scrapableSuppliers().map((s) => s.id))];
}

export function categoryLinksFor(categoryId: string): Array<{ supplierId: string; name: string; url: string; scrape: ScrapeMode }> {
  const out: Array<{ supplierId: string; name: string; url: string; scrape: ScrapeMode }> = [];
  for (const s of SUPPLIER_CATALOG) {
    const url = s.categories?.[categoryId];
    if (url) {
      out.push({ supplierId: s.id, name: s.name, url, scrape: s.scrape });
      continue;
    }
    // fallback: search with first hint
    const cat = UNIFIED_CATEGORIES.find((c) => c.id === categoryId);
    const hint = cat?.searchHints[0];
    if (s.searchUrl && hint) {
      out.push({
        supplierId: s.id,
        name: s.name,
        url: s.searchUrl.replace("{q}", encodeURIComponent(hint)),
        scrape: s.scrape,
      });
    } else if (s.website) {
      out.push({ supplierId: s.id, name: s.name, url: s.website, scrape: s.scrape });
    }
  }
  return out;
}
