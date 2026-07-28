/**
 * Open-data supplements for EU / Moldova market VINs — all major brands.
 *
 * Why this exists:
 * - OSS (chassi, NHTSA vPIC) is strong for NA, thin for Europe-export / CIS WMIs
 *   and for model inference on many EU cars.
 * - Paid APIs (Vincario, Auto.dev) need keys; we stay free + offline-first.
 *
 * Sources (public / observational):
 * - ISO 3779 / ISO 3780
 * - NHTSA vPIC WMI (partial)
 * - Wikibooks VIN codes (Kia, etc.)
 * - Common TecDoc / aftermarket platform codes used in MD catalogs
 *
 * Not a full proprietary decoder — fills gaps so workshops get make+model+year.
 */

export type OpenVdsPattern = {
  /** Prefix of VDS (positions 4–8), longest match wins */
  prefix: string;
  model: string;
  generation?: string;
  /** Inclusive model-year window */
  years?: [number, number];
  confidence?: number;
};

export type OpenWmiEntry = {
  make: string;
  country?: string;
  countryCode?: string;
  note?: string;
  /** Other WMI keys whose patterns may apply */
  patternAlias?: string[];
};

// ─── helpers to keep tables readable ─────────────────────────────────────────

function p(
  prefix: string,
  model: string,
  opts?: { generation?: string; years?: [number, number]; confidence?: number }
): OpenVdsPattern {
  return {
    prefix,
    model,
    generation: opts?.generation,
    years: opts?.years,
    confidence: opts?.confidence ?? 0.85,
  };
}

/** Extra / corrected WMIs for MD workshop fleet (all brands). */
export const OPEN_WMI: Record<string, OpenWmiEntry> = {
  // ── Kia ──
  KNA: { make: "KIA", country: "South Korea", countryCode: "KR" },
  KNB: { make: "KIA", country: "South Korea", countryCode: "KR" },
  KNC: { make: "KIA", country: "South Korea", countryCode: "KR" },
  KND: { make: "KIA", country: "South Korea", countryCode: "KR" },
  KNE: {
    make: "KIA",
    country: "South Korea",
    countryCode: "KR",
    note: "Kia Europe export (passenger) thru ~2009",
    patternAlias: ["KNA", "KND", "MAKE:KIA"],
  },
  KNF: { make: "KIA", country: "South Korea", countryCode: "KR", patternAlias: ["KNA", "MAKE:KIA"] },
  KNJ: { make: "KIA", country: "South Korea", countryCode: "KR", patternAlias: ["MAKE:KIA"] },
  U5Y: {
    make: "KIA",
    country: "Slovakia",
    countryCode: "SK",
    note: "Kia Motors Slovakia",
    patternAlias: ["KNA", "KND", "MAKE:KIA"],
  },
  U6Y: { make: "KIA", country: "Slovakia", countryCode: "SK", patternAlias: ["KND", "MAKE:KIA"] },
  XWE: { make: "KIA", country: "Russia", countryCode: "RU", note: "Avtotor", patternAlias: ["MAKE:KIA"] },
  "3KP": { make: "KIA", country: "Mexico", countryCode: "MX", patternAlias: ["MAKE:KIA"] },
  "5XX": { make: "KIA", country: "USA", countryCode: "US", patternAlias: ["MAKE:KIA"] },
  "5XY": { make: "KIA", country: "USA", countryCode: "US", patternAlias: ["MAKE:KIA"] },

  // ── Hyundai ──
  KMH: { make: "HYUNDAI", country: "South Korea", countryCode: "KR", patternAlias: ["MAKE:HYUNDAI"] },
  KM8: { make: "HYUNDAI", country: "South Korea", countryCode: "KR", patternAlias: ["MAKE:HYUNDAI"] },
  KMF: { make: "HYUNDAI", country: "South Korea", countryCode: "KR", patternAlias: ["MAKE:HYUNDAI"] },
  KMC: { make: "HYUNDAI", country: "South Korea", countryCode: "KR", patternAlias: ["MAKE:HYUNDAI"] },
  TMA: {
    make: "HYUNDAI",
    country: "Czech Republic",
    countryCode: "CZ",
    note: "HMMC Czech",
    patternAlias: ["MAKE:HYUNDAI"],
  },
  Z94: {
    make: "HYUNDAI",
    country: "Russia",
    countryCode: "RU",
    note: "HMMR / also Kia builds",
    patternAlias: ["MAKE:HYUNDAI", "MAKE:KIA"],
  },
  "5NM": { make: "HYUNDAI", country: "USA", countryCode: "US", patternAlias: ["MAKE:HYUNDAI"] },
  "5NP": { make: "HYUNDAI", country: "USA", countryCode: "US", patternAlias: ["MAKE:HYUNDAI"] },

  // ── Volkswagen Group ──
  WVW: { make: "VOLKSWAGEN", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:VOLKSWAGEN"] },
  WVG: { make: "VOLKSWAGEN", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:VOLKSWAGEN"] },
  WV1: { make: "VOLKSWAGEN", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:VOLKSWAGEN"] },
  WV2: { make: "VOLKSWAGEN", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:VOLKSWAGEN"] },
  "3VW": { make: "VOLKSWAGEN", country: "Mexico", countryCode: "MX", patternAlias: ["MAKE:VOLKSWAGEN"] },
  LSV: { make: "VOLKSWAGEN", country: "China", countryCode: "CN", patternAlias: ["MAKE:VOLKSWAGEN"] },
  LFV: { make: "VOLKSWAGEN", country: "China", countryCode: "CN", note: "FAW-VW", patternAlias: ["MAKE:VOLKSWAGEN"] },
  TMB: { make: "SKODA", country: "Czech Republic", countryCode: "CZ", patternAlias: ["MAKE:SKODA"] },
  TM9: { make: "SKODA", country: "Czech Republic", countryCode: "CZ", patternAlias: ["MAKE:SKODA"] },
  VSS: { make: "SEAT", country: "Spain", countryCode: "ES", patternAlias: ["MAKE:SEAT"] },
  WAU: { make: "AUDI", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:AUDI"] },
  WUA: { make: "AUDI", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:AUDI"] },
  TRU: { make: "AUDI", country: "Hungary", countryCode: "HU", patternAlias: ["MAKE:AUDI"] },
  WA1: { make: "AUDI", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:AUDI"] },

  // ── French ──
  VF1: { make: "RENAULT", country: "France", countryCode: "FR", patternAlias: ["MAKE:RENAULT"] },
  VF2: { make: "RENAULT", country: "France", countryCode: "FR", patternAlias: ["MAKE:RENAULT"] },
  VF3: { make: "PEUGEOT", country: "France", countryCode: "FR", patternAlias: ["MAKE:PEUGEOT"] },
  VF7: { make: "CITROEN", country: "France", countryCode: "FR", patternAlias: ["MAKE:CITROEN"] },
  VR1: { make: "DS", country: "France", countryCode: "FR", patternAlias: ["MAKE:CITROEN"] },
  UU1: {
    make: "DACIA",
    country: "Romania",
    countryCode: "RO",
    note: "Dacia (chassi may label Renault)",
    patternAlias: ["MAKE:DACIA", "MAKE:RENAULT"],
  },
  UU2: { make: "DACIA", country: "Romania", countryCode: "RO", patternAlias: ["MAKE:DACIA"] },
  UU3: { make: "DACIA", country: "Romania", countryCode: "RO", patternAlias: ["MAKE:DACIA"] },

  // ── German premium / Opel / Ford EU ──
  WBA: { make: "BMW", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:BMW"] },
  WBS: { make: "BMW", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:BMW"] },
  WBY: { make: "BMW", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:BMW"] },
  WMW: { make: "MINI", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MINI"] },
  WDB: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  WDD: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  WDC: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  WDF: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  W1K: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  W1N: { make: "MERCEDES-BENZ", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:MERCEDES-BENZ"] },
  W0L: { make: "OPEL", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:OPEL"] },
  W0V: { make: "OPEL", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:OPEL"] },
  WF0: { make: "FORD", country: "Germany", countryCode: "DE", patternAlias: ["MAKE:FORD"] },
  SFA: { make: "FORD", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:FORD"] },
  "1FA": { make: "FORD", country: "USA", countryCode: "US", patternAlias: ["MAKE:FORD"] },
  "1FT": { make: "FORD", country: "USA", countryCode: "US", patternAlias: ["MAKE:FORD"] },
  "1FM": { make: "FORD", country: "USA", countryCode: "US", patternAlias: ["MAKE:FORD"] },

  // ── Italian ──
  ZFA: { make: "FIAT", country: "Italy", countryCode: "IT", patternAlias: ["MAKE:FIAT"] },
  ZAR: { make: "ALFA ROMEO", country: "Italy", countryCode: "IT", patternAlias: ["MAKE:ALFA ROMEO"] },
  ZAM: { make: "MASERATI", country: "Italy", countryCode: "IT" },
  ZFF: { make: "FERRARI", country: "Italy", countryCode: "IT" },
  ZLA: { make: "LANCIA", country: "Italy", countryCode: "IT", patternAlias: ["MAKE:FIAT"] },

  // ── Japan ──
  JTD: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JTE: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JTN: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JT2: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JT3: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JT4: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JT6: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  JT8: { make: "TOYOTA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:TOYOTA"] },
  SB1: { make: "TOYOTA", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:TOYOTA"] },
  JHM: { make: "HONDA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:HONDA"] },
  JH4: { make: "HONDA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:HONDA"] },
  "1HG": { make: "HONDA", country: "USA", countryCode: "US", patternAlias: ["MAKE:HONDA"] },
  "2HG": { make: "HONDA", country: "Canada", countryCode: "CA", patternAlias: ["MAKE:HONDA"] },
  SHH: { make: "HONDA", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:HONDA"] },
  JN1: { make: "NISSAN", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:NISSAN"] },
  JN6: { make: "NISSAN", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:NISSAN"] },
  JN8: { make: "NISSAN", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:NISSAN"] },
  SJN: { make: "NISSAN", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:NISSAN"] },
  VSK: { make: "NISSAN", country: "Spain", countryCode: "ES", patternAlias: ["MAKE:NISSAN"] },
  JM1: { make: "MAZDA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MAZDA"] },
  JMZ: { make: "MAZDA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MAZDA"] },
  JM3: { make: "MAZDA", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MAZDA"] },
  JF1: { make: "SUBARU", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:SUBARU"] },
  JF2: { make: "SUBARU", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:SUBARU"] },
  JA3: { make: "MITSUBISHI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MITSUBISHI"] },
  JA4: { make: "MITSUBISHI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MITSUBISHI"] },
  JMB: { make: "MITSUBISHI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:MITSUBISHI"] },
  JS1: { make: "SUZUKI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:SUZUKI"] },
  JS2: { make: "SUZUKI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:SUZUKI"] },
  JS3: { make: "SUZUKI", country: "Japan", countryCode: "JP", patternAlias: ["MAKE:SUZUKI"] },
  TSM: { make: "SUZUKI", country: "Hungary", countryCode: "HU", patternAlias: ["MAKE:SUZUKI"] },

  // ── UK / Sweden ──
  SAJ: { make: "JAGUAR", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:JAGUAR"] },
  SAL: { make: "LAND ROVER", country: "United Kingdom", countryCode: "GB", patternAlias: ["MAKE:LAND ROVER"] },
  YV1: { make: "VOLVO", country: "Sweden", countryCode: "SE", patternAlias: ["MAKE:VOLVO"] },
  YV4: { make: "VOLVO", country: "Sweden", countryCode: "SE", patternAlias: ["MAKE:VOLVO"] },

  // ── CIS / Eastern ──
  XTA: { make: "LADA", country: "Russia", countryCode: "RU", patternAlias: ["MAKE:LADA"] },
  XTB: { make: "LADA", country: "Russia", countryCode: "RU", patternAlias: ["MAKE:LADA"] },
  XTC: { make: "LADA", country: "Russia", countryCode: "RU", patternAlias: ["MAKE:LADA"] },
  X7L: { make: "LADA", country: "Russia", countryCode: "RU", patternAlias: ["MAKE:LADA"] },
  XUF: { make: "CHEVROLET", country: "Russia", countryCode: "RU", note: "GM-AvtoVAZ / Chevy", patternAlias: ["MAKE:CHEVROLET"] },
  XW8: { make: "VOLKSWAGEN", country: "Russia", countryCode: "RU", patternAlias: ["MAKE:VOLKSWAGEN"] },
  X96: { make: "GAZ", country: "Russia", countryCode: "RU" },
  Y6D: { make: "ZAZ", country: "Ukraine", countryCode: "UA" },

  // ── US common ──
  "1G1": { make: "CHEVROLET", country: "USA", countryCode: "US", patternAlias: ["MAKE:CHEVROLET"] },
  "1GC": { make: "CHEVROLET", country: "USA", countryCode: "US", patternAlias: ["MAKE:CHEVROLET"] },
  "1G0": { make: "CHEVROLET", country: "USA", countryCode: "US", patternAlias: ["MAKE:CHEVROLET"] },
  "2G1": { make: "CHEVROLET", country: "Canada", countryCode: "CA", patternAlias: ["MAKE:CHEVROLET"] },
  "1C3": { make: "CHRYSLER", country: "USA", countryCode: "US" },
  "1C4": { make: "JEEP", country: "USA", countryCode: "US", patternAlias: ["MAKE:JEEP"] },
  "1J4": { make: "JEEP", country: "USA", countryCode: "US", patternAlias: ["MAKE:JEEP"] },
  "5YJ": { make: "TESLA", country: "USA", countryCode: "US", patternAlias: ["MAKE:TESLA"] },
  "7SA": { make: "TESLA", country: "USA", countryCode: "US", patternAlias: ["MAKE:TESLA"] },
};

/**
 * VDS patterns: WMI keys + MAKE:BRAND keys (brand-level fallback).
 * Prefer longer prefixes; year window disambiguates reused codes.
 */
export const OPEN_VDS_BY_WMI: Record<string, OpenVdsPattern[]> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // KIA (WMI-specific + brand)
  // ═══════════════════════════════════════════════════════════════════════════
  KNE: [
    p("FE", "Cerato", { generation: "LD", years: [2004, 2009], confidence: 0.95 }),
    p("FB", "Spectra", { years: [2000, 2004] }),
    p("DC", "Rio", { years: [2001, 2005] }),
    p("DE", "Rio", { years: [2006, 2011] }),
    p("ED", "Ceed", { generation: "ED", years: [2006, 2012], confidence: 0.92 }),
    p("GD", "Optima", { years: [2001, 2006] }),
    p("GE", "Optima", { years: [2006, 2010] }),
    p("FG", "Rondo", { years: [2007, 2012] }),
  ],
  KNA: [
    p("FE", "Cerato", { generation: "LD", years: [2004, 2009], confidence: 0.95 }),
    p("FB", "Spectra", { years: [2000, 2004] }),
    p("FU", "Forte", { years: [2009, 2013] }),
    p("TD", "Cerato", { generation: "TD", years: [2008, 2013], confidence: 0.9 }),
    p("YD", "Cerato", { generation: "YD", years: [2012, 2018], confidence: 0.9 }),
    p("BD", "Cerato", { generation: "BD", years: [2018, 2024], confidence: 0.9 }),
    p("ED", "Ceed", { generation: "ED", years: [2006, 2012], confidence: 0.92 }),
    p("JD", "Ceed", { generation: "JD", years: [2012, 2018], confidence: 0.9 }),
    p("CD", "Ceed", { generation: "CD", years: [2018, 2026], confidence: 0.9 }),
    p("DC", "Rio", { years: [2001, 2005] }),
    p("DE", "Rio", { years: [2006, 2011] }),
    p("UB", "Rio", { generation: "UB", years: [2011, 2017] }),
    p("YB", "Rio", { generation: "YB", years: [2017, 2026] }),
    p("TF", "Optima", { generation: "TF", years: [2010, 2015] }),
    p("JF", "Optima", { generation: "JF", years: [2015, 2020] }),
    p("CK", "Stinger", { generation: "CK", years: [2017, 2023], confidence: 0.9 }),
    p("TA", "Picanto", { years: [2004, 2011] }),
    p("JA", "Picanto", { years: [2011, 2017] }),
    p("SA", "Picanto", { years: [2017, 2026] }),
  ],
  KND: [
    p("JE", "Sportage", { years: [2005, 2010], confidence: 0.9 }),
    p("JF", "Sportage", { years: [2005, 2010] }),
    p("SL", "Sportage", { generation: "SL", years: [2010, 2016], confidence: 0.9 }),
    p("QL", "Sportage", { generation: "QL", years: [2016, 2022], confidence: 0.9 }),
    p("NQ", "Sportage", { generation: "NQ", years: [2021, 2026], confidence: 0.9 }),
    p("JC", "Sorento", { years: [2003, 2009], confidence: 0.9 }),
    p("JD", "Sorento", { years: [2003, 2009] }),
    p("XM", "Sorento", { generation: "XM", years: [2009, 2015], confidence: 0.9 }),
    p("UM", "Sorento", { generation: "UM", years: [2015, 2020], confidence: 0.9 }),
    p("MQ", "Sorento", { generation: "MQ", years: [2020, 2026], confidence: 0.9 }),
    p("UP", "Carnival", { years: [2002, 2005] }),
    p("MB", "Carnival", { years: [2006, 2010] }),
    p("YP", "Carnival", { years: [2014, 2021] }),
    p("KP", "Soul", { years: [2009, 2013] }),
    p("PS", "Soul", { years: [2014, 2019] }),
  ],
  U5Y: [
    p("ED", "Ceed", { generation: "ED", years: [2006, 2012], confidence: 0.9 }),
    p("JD", "Ceed", { generation: "JD", years: [2012, 2018], confidence: 0.9 }),
    p("CD", "Ceed", { generation: "CD", years: [2018, 2026], confidence: 0.9 }),
    p("DE", "ProCeed", { years: [2018, 2026] }),
    p("SL", "Sportage", { generation: "SL", years: [2010, 2016] }),
    p("QL", "Sportage", { generation: "QL", years: [2016, 2022] }),
  ],
  "MAKE:KIA": [
    p("FE", "Cerato", { generation: "LD", years: [2004, 2009], confidence: 0.95 }),
    p("ED", "Ceed", { generation: "ED", years: [2006, 2012] }),
    p("JD", "Ceed", { generation: "JD", years: [2012, 2018] }),
    p("CD", "Ceed", { generation: "CD", years: [2018, 2026] }),
    p("TD", "Cerato", { generation: "TD", years: [2008, 2013] }),
    p("YD", "Cerato", { generation: "YD", years: [2012, 2018] }),
    p("BD", "Cerato", { generation: "BD", years: [2018, 2024] }),
    p("UB", "Rio", { generation: "UB", years: [2011, 2017] }),
    p("YB", "Rio", { generation: "YB", years: [2017, 2026] }),
    p("SL", "Sportage", { generation: "SL", years: [2010, 2016] }),
    p("QL", "Sportage", { generation: "QL", years: [2016, 2022] }),
    p("NQ", "Sportage", { generation: "NQ", years: [2021, 2026] }),
    p("XM", "Sorento", { generation: "XM", years: [2009, 2015] }),
    p("UM", "Sorento", { generation: "UM", years: [2015, 2020] }),
    p("MQ", "Sorento", { generation: "MQ", years: [2020, 2026] }),
    p("PS", "Soul"),
    p("CK", "Stinger", { generation: "CK", years: [2017, 2023] }),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // HYUNDAI
  // ═══════════════════════════════════════════════════════════════════════════
  KMH: [
    p("CM", "Accent", { years: [2006, 2011] }),
    p("RB", "Accent", { years: [2011, 2017] }),
    p("HC", "Accent", { years: [2017, 2023] }),
    p("MD", "i30", { generation: "FD/GD", years: [2007, 2012] }),
    p("GD", "i30", { generation: "GD", years: [2012, 2017] }),
    p("PD", "i30", { generation: "PD", years: [2017, 2026] }),
    p("NF", "Sonata", { years: [2005, 2010] }),
    p("YF", "Sonata", { years: [2010, 2014] }),
    p("LF", "Sonata", { years: [2014, 2019] }),
    p("DN", "Sonata", { years: [2019, 2026] }),
    p("JM", "Tucson", { years: [2004, 2009] }),
    p("LM", "Tucson", { years: [2009, 2015] }),
    p("TL", "Tucson", { years: [2015, 2020] }),
    p("NX", "Tucson", { years: [2020, 2026] }),
    p("SM", "Santa Fe", { years: [2001, 2006] }),
    p("CM8", "Santa Fe", { years: [2006, 2012] }),
    p("TM", "Santa Fe", { years: [2012, 2018] }),
    p("TM", "Santa Fe", { years: [2018, 2024] }),
    p("BA", "i10", { years: [2008, 2013] }),
    p("IA", "i10", { years: [2013, 2019] }),
    p("AC", "i20", { years: [2008, 2014] }),
    p("GB", "i20", { years: [2014, 2020] }),
    p("BC", "i20", { years: [2020, 2026] }),
    p("EL", "Elantra", { years: [2001, 2006] }),
    p("HD", "Elantra", { years: [2006, 2010] }),
    p("MD", "Elantra", { years: [2010, 2015] }),
    p("AD", "Elantra", { years: [2015, 2020] }),
    p("CN", "Elantra", { years: [2020, 2026] }),
  ],
  KM8: [
    p("J", "Tucson"),
    p("SM", "Santa Fe"),
    p("SC", "Santa Fe"),
    p("SH", "Santa Fe"),
  ],
  "MAKE:HYUNDAI": [
    p("RB", "Accent"),
    p("HC", "Accent"),
    p("PD", "i30", { generation: "PD" }),
    p("GD", "i30", { generation: "GD" }),
    p("MD", "i30"),
    p("TL", "Tucson"),
    p("NX", "Tucson"),
    p("LM", "Tucson"),
    p("JM", "Tucson"),
    p("TM", "Santa Fe"),
    p("LF", "Sonata"),
    p("YF", "Sonata"),
    p("NF", "Sonata"),
    p("BA", "i10"),
    p("IA", "i10"),
    p("AC", "i20"),
    p("GB", "i20"),
    p("BC", "i20"),
    p("AD", "Elantra"),
    p("CN", "Elantra"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // VOLKSWAGEN / SKODA / SEAT / AUDI
  // EU often embeds model in VDS (ZZZ + type)
  // ═══════════════════════════════════════════════════════════════════════════
  WVW: [
    p("ZZZ1K", "Golf", { generation: "Mk5/Mk6", years: [2003, 2012], confidence: 0.9 }),
    p("ZZZ1J", "Golf", { generation: "Mk4", years: [1997, 2006], confidence: 0.9 }),
    p("ZZZAU", "Passat", { generation: "B6/B7", years: [2005, 2014], confidence: 0.9 }),
    p("ZZZ3C", "Passat", { generation: "B6", years: [2005, 2010], confidence: 0.88 }),
    p("ZZZ3G", "Passat", { generation: "B8", years: [2014, 2023], confidence: 0.9 }),
    p("ZZZ5N", "Tiguan", { years: [2007, 2016], confidence: 0.9 }),
    p("ZZZAD", "Tiguan", { years: [2016, 2024], confidence: 0.9 }),
    p("ZZZ1T", "Touran", { years: [2003, 2015], confidence: 0.88 }),
    p("ZZZ1T", "Touran", { years: [2015, 2024] }),
    p("ZZZ7H", "Transporter", { years: [2003, 2015] }),
    p("ZZZ7J", "Transporter", { years: [2003, 2015] }),
    p("ZZZ7HC", "Transporter", { years: [2015, 2024] }),
    p("ZZZ6R", "Polo", { generation: "5", years: [2009, 2017], confidence: 0.9 }),
    p("ZZZ6C", "Polo", { generation: "5", years: [2009, 2014] }),
    p("ZZZAW", "Polo", { generation: "6", years: [2017, 2026], confidence: 0.9 }),
    p("ZZZ16", "Polo", { generation: "4", years: [2001, 2009] }),
    p("ZZZ1F", "Caddy", { years: [2004, 2020] }),
    p("ZZZ2K", "Caddy", { years: [2004, 2015] }),
    p("ZZZ5Z", "Jetta", { years: [2005, 2010] }),
    p("ZZZ16", "Jetta", { years: [2010, 2018] }),
    p("ZZZ3H", "Arteon", { years: [2017, 2026] }),
    p("ZZZCA", "Crafter", { years: [2006, 2016] }),
    p("ZZZSY", "Crafter", { years: [2016, 2026] }),
    p("ZZZ7L", "Touareg", { years: [2002, 2010] }),
    p("ZZZ7P", "Touareg", { years: [2010, 2018] }),
    p("ZZZCR", "Touareg", { years: [2018, 2026] }),
  ],
  WVG: [
    p("ZZZ5N", "Tiguan"),
    p("ZZZAD", "Tiguan"),
    p("ZZZ7L", "Touareg"),
    p("ZZZ7P", "Touareg"),
  ],
  "MAKE:VOLKSWAGEN": [
    p("ZZZ1K", "Golf"),
    p("ZZZ1J", "Golf"),
    p("ZZZAU", "Passat"),
    p("ZZZ3C", "Passat"),
    p("ZZZ3G", "Passat"),
    p("ZZZ5N", "Tiguan"),
    p("ZZZAD", "Tiguan"),
    p("ZZZ6R", "Polo"),
    p("ZZZAW", "Polo"),
    p("ZZZ1T", "Touran"),
    p("ZZZ7H", "Transporter"),
    p("ZZZ1F", "Caddy"),
  ],
  TMB: [
    p("JF", "Octavia", { generation: "1U", years: [1996, 2010] }),
    p("NE", "Octavia", { generation: "1Z", years: [2004, 2013], confidence: 0.9 }),
    p("5E", "Octavia", { generation: "5E", years: [2013, 2020], confidence: 0.92 }),
    p("NX", "Octavia", { generation: "NX", years: [2020, 2026], confidence: 0.9 }),
    p("5J", "Fabia", { generation: "5J", years: [2007, 2014], confidence: 0.9 }),
    p("NJ", "Fabia", { generation: "NJ", years: [2014, 2021], confidence: 0.9 }),
    p("PJ", "Fabia", { generation: "PJ", years: [2021, 2026], confidence: 0.9 }),
    p("6Y", "Fabia", { years: [1999, 2007] }),
    p("5L", "Yeti", { years: [2009, 2017], confidence: 0.9 }),
    p("NS", "Superb", { generation: "3T", years: [2008, 2015] }),
    p("3T", "Superb", { years: [2001, 2008] }),
    p("3V", "Superb", { years: [2015, 2023], confidence: 0.9 }),
    p("NU", "Rapid", { years: [2012, 2019], confidence: 0.9 }),
    p("NH", "Rapid", { years: [2012, 2019] }),
    p("5J", "Roomster", { years: [2006, 2015] }),
    p("NL", "Kodiaq", { years: [2016, 2023], confidence: 0.9 }),
    p("NS", "Kodiaq", { years: [2016, 2023] }),
    p("NU", "Karoq", { years: [2017, 2026] }),
    p("NW", "Kamiq", { years: [2019, 2026] }),
  ],
  "MAKE:SKODA": [
    p("5E", "Octavia", { generation: "5E" }),
    p("NE", "Octavia"),
    p("NX", "Octavia"),
    p("NJ", "Fabia"),
    p("5J", "Fabia"),
    p("PJ", "Fabia"),
    p("3V", "Superb"),
    p("NS", "Superb"),
    p("5L", "Yeti"),
    p("NU", "Rapid"),
    p("NL", "Kodiaq"),
  ],
  VSS: [
    p("ZZZ6L", "Ibiza", { years: [2002, 2008] }),
    p("ZZZ6J", "Ibiza", { years: [2008, 2017] }),
    p("ZZZ6P", "Ibiza", { years: [2017, 2026] }),
    p("ZZZ1M", "Leon", { years: [1999, 2005] }),
    p("ZZZ1P", "Leon", { years: [2005, 2012] }),
    p("ZZZ5F", "Leon", { years: [2012, 2020], confidence: 0.9 }),
    p("ZZZKL", "Leon", { years: [2020, 2026] }),
    p("ZZZ5P", "Toledo", { years: [2004, 2009] }),
    p("ZZZ5P", "Altea", { years: [2004, 2015] }),
    p("ZZZ5N", "Alhambra", { years: [2010, 2020] }),
    p("ZZZ7N", "Alhambra", { years: [1996, 2010] }),
    p("ZZZKN", "Arona", { years: [2017, 2026] }),
    p("ZZZKL", "Ateca", { years: [2016, 2026] }),
  ],
  "MAKE:SEAT": [
    p("ZZZ6J", "Ibiza"),
    p("ZZZ6P", "Ibiza"),
    p("ZZZ5F", "Leon"),
    p("ZZZ1P", "Leon"),
    p("ZZZKN", "Arona"),
    p("ZZZKL", "Ateca"),
  ],
  WAU: [
    p("ZZZ8E", "A4", { generation: "B6/B7", years: [2000, 2008] }),
    p("ZZZ8K", "A4", { generation: "B8", years: [2007, 2015], confidence: 0.9 }),
    p("ZZZ8W", "A4", { generation: "B9", years: [2015, 2023], confidence: 0.9 }),
    p("ZZZ8L", "A3", { years: [1996, 2003] }),
    p("ZZZ8P", "A3", { years: [2003, 2012] }),
    p("ZZZ8V", "A3", { years: [2012, 2020], confidence: 0.9 }),
    p("ZZZ8Y", "A3", { years: [2020, 2026] }),
    p("ZZZ8T", "A6", { years: [1997, 2004] }),
    p("ZZZ4F", "A6", { years: [2004, 2011] }),
    p("ZZZ4G", "A6", { years: [2011, 2018], confidence: 0.9 }),
    p("ZZZ4K", "A6", { years: [2018, 2026] }),
    p("ZZZ8R", "A6", { years: [1997, 2005] }),
    p("ZZZ8X", "A1", { years: [2010, 2018] }),
    p("ZZZGB", "A1", { years: [2018, 2026] }),
    p("ZZZ8U", "Q3", { years: [2011, 2018] }),
    p("ZZZF3", "Q3", { years: [2018, 2026] }),
    p("ZZZ8R", "Q5", { years: [2008, 2017] }),
    p("ZZZFY", "Q5", { years: [2017, 2026] }),
    p("ZZZ4L", "Q7", { years: [2005, 2015] }),
    p("ZZZ4M", "Q7", { years: [2015, 2026] }),
  ],
  "MAKE:AUDI": [
    p("ZZZ8K", "A4"),
    p("ZZZ8W", "A4"),
    p("ZZZ8V", "A3"),
    p("ZZZ8P", "A3"),
    p("ZZZ4G", "A6"),
    p("ZZZ4F", "A6"),
    p("ZZZ8U", "Q3"),
    p("ZZZFY", "Q5"),
    p("ZZZ4M", "Q7"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // RENAULT / DACIA / PEUGEOT / CITROEN
  // ═══════════════════════════════════════════════════════════════════════════
  VF1: [
    p("B1", "Clio", { years: [1998, 2005] }),
    p("B2", "Clio", { years: [2005, 2012] }),
    p("B3", "Clio", { years: [2012, 2019] }),
    p("RJA", "Clio", { years: [2019, 2026] }),
    p("C1", "Megane", { years: [1995, 2002] }),
    p("C2", "Megane", { years: [2002, 2008] }),
    p("BZ", "Megane", { years: [2008, 2016] }),
    p("RFB", "Megane", { years: [2016, 2026] }),
    p("B0", "Twingo", { years: [1993, 2007] }),
    p("N0", "Twingo", { years: [2007, 2014] }),
    p("AH", "Twingo", { years: [2014, 2026] }),
    p("J0", "Scenic", { years: [1996, 2003] }),
    p("J5", "Scenic", { years: [2003, 2009] }),
    p("JZ", "Scenic", { years: [2009, 2016] }),
    p("RFA", "Scenic", { years: [2016, 2026] }),
    p("L0", "Laguna", { years: [1993, 2001] }),
    p("B56", "Laguna", { years: [2001, 2007] }),
    p("BT", "Laguna", { years: [2007, 2015] }),
    p("K0", "Kangoo", { years: [1997, 2007] }),
    p("FW", "Kangoo", { years: [2007, 2021] }),
    p("RKL", "Kangoo", { years: [2021, 2026] }),
    p("J8", "Espace", { years: [2002, 2014] }),
    p("JR", "Espace", { years: [2015, 2023] }),
    p("H5", "Trafic", { years: [2001, 2014] }),
    p("JL", "Trafic", { years: [2014, 2026] }),
    p("F1", "Master", { years: [1997, 2010] }),
    p("MA", "Master", { years: [2010, 2026] }),
    p("JZ", "Fluence", { years: [2009, 2016] }),
    p("LZ", "Latitude", { years: [2010, 2015] }),
    p("HZ", "Captur", { years: [2013, 2019] }),
    p("RJB", "Captur", { years: [2019, 2026] }),
    p("HZ", "Kadjar", { years: [2015, 2022] }),
    p("RJJ", "Austral", { years: [2022, 2026] }),
    p("JZ", "Symbol", { years: [2008, 2013] }),
    p("L8", "Symbol", { years: [2013, 2021] }),
  ],
  "MAKE:RENAULT": [
    p("B1", "Clio"),
    p("B2", "Clio"),
    p("B3", "Clio"),
    p("C1", "Megane"),
    p("C2", "Megane"),
    p("BZ", "Megane"),
    p("K0", "Kangoo"),
    p("FW", "Kangoo"),
    p("J5", "Scenic"),
    p("JZ", "Scenic"),
    p("HZ", "Captur"),
  ],
  UU1: [
    p("KS", "Logan", { years: [2004, 2012], confidence: 0.92 }),
    p("L9", "Logan", { years: [2004, 2012] }),
    p("LS", "Logan", { years: [2012, 2020], confidence: 0.92 }),
    p("L8", "Logan", { years: [2012, 2020] }),
    p("B0", "Sandero", { years: [2008, 2012] }),
    p("JR", "Sandero", { years: [2008, 2012] }),
    p("B8", "Sandero", { years: [2012, 2020], confidence: 0.9 }),
    p("B9", "Sandero", { years: [2020, 2026] }),
    p("H8", "Duster", { years: [2010, 2017], confidence: 0.92 }),
    p("HM", "Duster", { years: [2010, 2017] }),
    p("HJD", "Duster", { years: [2017, 2023], confidence: 0.9 }),
    p("DJF", "Duster", { years: [2023, 2026] }),
    p("JD", "Lodgy", { years: [2012, 2022], confidence: 0.9 }),
    p("JS", "Dokker", { years: [2012, 2021], confidence: 0.9 }),
    p("RJA", "Jogger", { years: [2021, 2026] }),
  ],
  "MAKE:DACIA": [
    p("KS", "Logan"),
    p("LS", "Logan"),
    p("L8", "Logan"),
    p("B8", "Sandero"),
    p("B0", "Sandero"),
    p("H8", "Duster"),
    p("HJD", "Duster"),
    p("JD", "Lodgy"),
    p("JS", "Dokker"),
  ],
  VF3: [
    p("6", "206", { years: [1998, 2012] }),
    p("2A", "206", { years: [1998, 2009] }),
    p("A", "207", { years: [2006, 2014] }),
    p("8", "208", { years: [2012, 2019] }),
    p("U", "208", { years: [2019, 2026] }),
    p("3", "307", { years: [2001, 2008] }),
    p("4", "308", { years: [2007, 2013] }),
    p("C", "308", { years: [2013, 2021] }),
    p("L", "308", { years: [2021, 2026] }),
    p("4", "407", { years: [2004, 2011] }),
    p("D", "508", { years: [2010, 2018] }),
    p("F", "508", { years: [2018, 2026] }),
    p("5", "Partner", { years: [1996, 2008] }),
    p("7", "Partner", { years: [2008, 2018] }),
    p("K", "Partner", { years: [2018, 2026] }),
    p("T", "3008", { years: [2009, 2016] }),
    p("M", "3008", { years: [2016, 2023] }),
    p("P", "5008", { years: [2009, 2016] }),
    p("P", "5008", { years: [2017, 2026] }),
    p("G", "2008", { years: [2013, 2019] }),
    p("P", "2008", { years: [2019, 2026] }),
    p("V", "Boxer", { years: [2006, 2026] }),
  ],
  "MAKE:PEUGEOT": [
    p("8", "208"),
    p("C", "308"),
    p("4", "308"),
    p("D", "508"),
    p("T", "3008"),
    p("M", "3008"),
    p("G", "2008"),
    p("7", "Partner"),
  ],
  VF7: [
    p("N", "C3", { years: [2002, 2009] }),
    p("S", "C3", { years: [2009, 2016] }),
    p("B", "C3", { years: [2016, 2026] }),
    p("L", "C4", { years: [2004, 2010] }),
    p("B", "C4", { years: [2010, 2018] }),
    p("C", "C4", { years: [2020, 2026] }),
    p("R", "C5", { years: [2001, 2008] }),
    p("D", "C5", { years: [2008, 2017] }),
    p("F", "C5 Aircross", { years: [2018, 2026] }),
    p("A", "Berlingo", { years: [1996, 2008] }),
    p("G", "Berlingo", { years: [2008, 2018] }),
    p("K", "Berlingo", { years: [2018, 2026] }),
    p("J", "Jumper", { years: [2006, 2026] }),
    p("A", "C1", { years: [2005, 2014] }),
    p("P", "C1", { years: [2014, 2022] }),
  ],
  "MAKE:CITROEN": [
    p("S", "C3"),
    p("B", "C3"),
    p("L", "C4"),
    p("G", "Berlingo"),
    p("K", "Berlingo"),
    p("D", "C5"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // OPEL / FORD EU
  // ═══════════════════════════════════════════════════════════════════════════
  W0L: [
    p("0AH", "Astra", { years: [1998, 2004] }),
    p("0AJ", "Astra", { years: [2004, 2009] }),
    p("0AHC", "Astra", { years: [2009, 2015] }),
    p("0VKL", "Astra", { years: [2015, 2021] }),
    p("0TGF", "Insignia", { years: [2008, 2017], confidence: 0.9 }),
    p("0G", "Insignia", { years: [2017, 2022] }),
    p("0AHL", "Corsa", { years: [2000, 2006] }),
    p("0S", "Corsa", { years: [2006, 2014] }),
    p("0PED", "Corsa", { years: [2014, 2019] }),
    p("0AHF", "Zafira", { years: [1999, 2005] }),
    p("0AHG", "Zafira", { years: [2005, 2014] }),
    p("0", "Zafira", { years: [2011, 2019] }),
    p("0V", "Mokka", { years: [2012, 2019] }),
    p("0", "Mokka", { years: [2020, 2026] }),
    p("0", "Meriva", { years: [2003, 2017] }),
    p("0", "Vectra", { years: [2002, 2008] }),
  ],
  "MAKE:OPEL": [
    p("0AJ", "Astra"),
    p("0AH", "Astra"),
    p("0TGF", "Insignia"),
    p("0S", "Corsa"),
    p("0AHF", "Zafira"),
  ],
  WF0: [
    p("XXG", "Focus", { years: [1998, 2004] }),
    p("XXW", "Fiesta", { years: [2002, 2008] }),
    p("XXC", "Mondeo", { years: [2000, 2007] }),
    p("XXR", "Kuga", { years: [2008, 2012] }),
    p("AXX", "Focus", { years: [2004, 2011] }),
    p("BXX", "Focus", { years: [2011, 2018] }),
    p("CXX", "Focus", { years: [2018, 2026] }),
    p("AXX", "Fiesta", { years: [2008, 2017] }),
    p("BXX", "Fiesta", { years: [2017, 2023] }),
    p("AXX", "Mondeo", { years: [2007, 2014] }),
    p("BXX", "Mondeo", { years: [2014, 2022] }),
    p("AXX", "Kuga", { years: [2012, 2019] }),
    p("BXX", "Kuga", { years: [2019, 2026] }),
    p("AXX", "C-Max", { years: [2003, 2010] }),
    p("BXX", "C-Max", { years: [2010, 2019] }),
    p("AXX", "S-Max", { years: [2006, 2014] }),
    p("BXX", "S-Max", { years: [2015, 2023] }),
    p("AXX", "Galaxy", { years: [2006, 2015] }),
    p("BXX", "Transit", { years: [2006, 2014] }),
    p("CXX", "Transit", { years: [2014, 2026] }),
    p("AXX", "Transit Connect", { years: [2002, 2013] }),
    p("BXX", "Transit Connect", { years: [2013, 2023] }),
    p("AXX", "EcoSport", { years: [2012, 2022] }),
    p("AXX", "Puma", { years: [2019, 2026] }),
  ],
  "MAKE:FORD": [
    p("XXG", "Focus"),
    p("XXW", "Fiesta"),
    p("XXC", "Mondeo"),
    p("XXR", "Kuga"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BMW / MERCEDES / MINI
  // (coarse — chassis codes vary; year helps catalogs)
  // ═══════════════════════════════════════════════════════════════════════════
  WBA: [
    p("PA", "3 Series", { years: [2005, 2011] }),
    p("VA", "3 Series", { years: [2011, 2018] }),
    p("8E", "3 Series", { years: [2018, 2026] }),
    p("PV", "5 Series", { years: [2003, 2010] }),
    p("NB", "5 Series", { years: [2010, 2016] }),
    p("5G", "5 Series", { years: [2016, 2023] }),
    p("UF", "X5", { years: [2006, 2013] }),
    p("CM", "X5", { years: [2013, 2018] }),
    p("JU", "X5", { years: [2018, 2026] }),
    p("VT", "X3", { years: [2003, 2010] }),
    p("WX", "X3", { years: [2010, 2017] }),
    p("G0", "X3", { years: [2017, 2024] }),
    p("1A", "1 Series", { years: [2004, 2011] }),
    p("1C", "1 Series", { years: [2011, 2019] }),
    p("7L", "1 Series", { years: [2019, 2026] }),
  ],
  "MAKE:BMW": [
    p("VA", "3 Series"),
    p("PA", "3 Series"),
    p("NB", "5 Series"),
    p("PV", "5 Series"),
    p("UF", "X5"),
    p("VT", "X3"),
  ],
  WDB: [
    p("HF", "C-Class", { years: [2000, 2007] }),
    p("204", "C-Class", { years: [2007, 2014] }),
    p("205", "C-Class", { years: [2014, 2021] }),
    p("RF", "E-Class", { years: [2002, 2009] }),
    p("212", "E-Class", { years: [2009, 2016] }),
    p("213", "E-Class", { years: [2016, 2023] }),
    p("CF", "S-Class", { years: [1998, 2005] }),
    p("221", "S-Class", { years: [2005, 2013] }),
    p("222", "S-Class", { years: [2013, 2020] }),
    p("GF", "ML-Class", { years: [2005, 2011] }),
    p("166", "ML-Class", { years: [2011, 2015] }),
    p("166", "GLE", { years: [2015, 2019] }),
    p("DF", "GLK", { years: [2008, 2015] }),
    p("253", "GLC", { years: [2015, 2022] }),
    p("203", "C-Class", { years: [2000, 2007] }),
    p("211", "E-Class", { years: [2002, 2009] }),
  ],
  WDD: [
    p("204", "C-Class", { years: [2007, 2014] }),
    p("205", "C-Class", { years: [2014, 2021] }),
    p("212", "E-Class", { years: [2009, 2016] }),
    p("213", "E-Class", { years: [2016, 2023] }),
    p("221", "S-Class"),
    p("222", "S-Class"),
    p("166", "GLE"),
    p("253", "GLC"),
    p("117", "CLA", { years: [2013, 2019] }),
    p("118", "CLA", { years: [2019, 2026] }),
    p("176", "A-Class", { years: [2012, 2018] }),
    p("177", "A-Class", { years: [2018, 2026] }),
    p("246", "B-Class", { years: [2011, 2018] }),
  ],
  "MAKE:MERCEDES-BENZ": [
    p("204", "C-Class"),
    p("205", "C-Class"),
    p("212", "E-Class"),
    p("213", "E-Class"),
    p("177", "A-Class"),
    p("176", "A-Class"),
    p("253", "GLC"),
    p("166", "GLE"),
  ],
  WMW: [
    p("RE", "Cooper", { years: [2006, 2013] }),
    p("XM", "Cooper", { years: [2013, 2023] }),
    p("ZB", "Countryman", { years: [2010, 2016] }),
    p("F6", "Countryman", { years: [2016, 2023] }),
  ],
  "MAKE:MINI": [
    p("RE", "Cooper"),
    p("XM", "Cooper"),
    p("ZB", "Countryman"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FIAT / ALFA
  // ═══════════════════════════════════════════════════════════════════════════
  ZFA: [
    p("223", "Punto", { years: [1999, 2005] }),
    p("188", "Punto", { years: [2005, 2010] }),
    p("199", "Punto", { years: [2005, 2018] }),
    p("312", "500", { years: [2007, 2026], confidence: 0.9 }),
    p("169", "Panda", { years: [2003, 2012] }),
    p("319", "Panda", { years: [2011, 2026], confidence: 0.9 }),
    p("198", "Bravo", { years: [2007, 2014] }),
    p("192", "Stilo", { years: [2001, 2007] }),
    p("350", "Tipo", { years: [2015, 2026], confidence: 0.9 }),
    p("263", "Doblo", { years: [2000, 2009] }),
    p("263", "Doblo", { years: [2009, 2022] }),
    p("250", "Ducato", { years: [2006, 2014] }),
    p("250", "Ducato", { years: [2014, 2026] }),
    p("330", "Fiorino", { years: [2007, 2026] }),
    p("356", "500X", { years: [2014, 2026] }),
    p("334", "500L", { years: [2012, 2022] }),
  ],
  "MAKE:FIAT": [
    p("312", "500"),
    p("319", "Panda"),
    p("350", "Tipo"),
    p("199", "Punto"),
    p("250", "Ducato"),
    p("263", "Doblo"),
  ],
  ZAR: [
    p("939", "159", { years: [2005, 2011] }),
    p("940", "Giulietta", { years: [2010, 2020], confidence: 0.9 }),
    p("955", "MiTo", { years: [2008, 2018] }),
    p("952", "Giulia", { years: [2016, 2026], confidence: 0.9 }),
    p("949", "Stelvio", { years: [2016, 2026], confidence: 0.9 }),
    p("932", "147", { years: [2000, 2010] }),
    p("936", "156", { years: [1997, 2007] }),
  ],
  "MAKE:ALFA ROMEO": [
    p("940", "Giulietta"),
    p("952", "Giulia"),
    p("949", "Stelvio"),
    p("939", "159"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TOYOTA / HONDA / NISSAN / MAZDA / MITSUBISHI / SUBARU / SUZUKI
  // ═══════════════════════════════════════════════════════════════════════════
  JTD: [
    p("KT", "Corolla", { years: [2000, 2006] }),
    p("BT", "Corolla", { years: [2006, 2013] }),
    p("BU", "Corolla", { years: [2013, 2018] }),
    p("KW", "Corolla", { years: [2018, 2026] }),
    p("BA", "Camry", { years: [2001, 2006] }),
    p("BF", "Camry", { years: [2006, 2011] }),
    p("BF", "Camry", { years: [2011, 2017] }),
    p("AX", "Camry", { years: [2017, 2026] }),
    p("HA", "RAV4", { years: [2000, 2005] }),
    p("XA", "RAV4", { years: [2005, 2012] }),
    p("XA", "RAV4", { years: [2012, 2018] }),
    p("XA", "RAV4", { years: [2018, 2026] }),
    p("ZA", "Yaris", { years: [1999, 2005] }),
    p("SP", "Yaris", { years: [2005, 2011] }),
    p("NSP", "Yaris", { years: [2011, 2020] }),
    p("MX", "Yaris", { years: [2020, 2026] }),
    p("AZ", "Avensis", { years: [2003, 2008] }),
    p("AZ", "Avensis", { years: [2008, 2018] }),
    p("AC", "Auris", { years: [2006, 2012] }),
    p("NZE", "Auris", { years: [2012, 2018] }),
    p("ACA", "RAV4"),
    p("ZZE", "Corolla"),
    p("NDE", "Yaris"),
  ],
  "MAKE:TOYOTA": [
    p("KT", "Corolla"),
    p("BT", "Corolla"),
    p("KW", "Corolla"),
    p("XA", "RAV4"),
    p("HA", "RAV4"),
    p("SP", "Yaris"),
    p("ZA", "Yaris"),
    p("BF", "Camry"),
    p("AZ", "Avensis"),
    p("AC", "Auris"),
  ],
  JHM: [
    p("GD", "Civic", { years: [2001, 2005] }),
    p("FD", "Civic", { years: [2005, 2011] }),
    p("FB", "Civic", { years: [2011, 2015] }),
    p("FC", "Civic", { years: [2015, 2021] }),
    p("FL", "Civic", { years: [2021, 2026] }),
    p("CL", "Accord", { years: [2002, 2008] }),
    p("CU", "Accord", { years: [2008, 2012] }),
    p("CR", "Accord", { years: [2012, 2017] }),
    p("CV", "Accord", { years: [2017, 2026] }),
    p("RD", "CR-V", { years: [2001, 2006] }),
    p("RE", "CR-V", { years: [2006, 2012] }),
    p("RM", "CR-V", { years: [2012, 2016] }),
    p("RW", "CR-V", { years: [2016, 2022] }),
    p("RS", "CR-V", { years: [2022, 2026] }),
    p("GD", "Jazz", { years: [2002, 2008] }),
    p("GE", "Jazz", { years: [2008, 2015] }),
    p("GK", "Jazz", { years: [2015, 2020] }),
    p("GR", "Jazz", { years: [2020, 2026] }),
    p("YE", "HR-V", { years: [2015, 2021] }),
    p("RV", "HR-V", { years: [2021, 2026] }),
  ],
  "MAKE:HONDA": [
    p("FD", "Civic"),
    p("FB", "Civic"),
    p("FC", "Civic"),
    p("RE", "CR-V"),
    p("RM", "CR-V"),
    p("RW", "CR-V"),
    p("GE", "Jazz"),
    p("GK", "Jazz"),
    p("CU", "Accord"),
  ],
  JN1: [
    p("B", "Almera", { years: [2000, 2006] }),
    p("Y", "Almera", { years: [2012, 2018] }),
    p("C", "Primera", { years: [2002, 2008] }),
    p("T", "X-Trail", { years: [2001, 2007] }),
    p("T", "X-Trail", { years: [2007, 2013] }),
    p("T", "X-Trail", { years: [2013, 2021] }),
    p("J", "Qashqai", { years: [2006, 2013], confidence: 0.9 }),
    p("J", "Qashqai", { years: [2013, 2021], confidence: 0.9 }),
    p("J", "Qashqai", { years: [2021, 2026] }),
    p("K", "Juke", { years: [2010, 2019] }),
    p("F", "Juke", { years: [2019, 2026] }),
    p("B", "Note", { years: [2006, 2013] }),
    p("E", "Note", { years: [2013, 2020] }),
    p("C", "Tiida", { years: [2004, 2012] }),
    p("L", "Leaf", { years: [2010, 2017] }),
    p("Z", "Leaf", { years: [2017, 2026] }),
    p("P", "Pathfinder", { years: [2004, 2012] }),
    p("R", "Pathfinder", { years: [2012, 2020] }),
    p("V", "Murano", { years: [2002, 2007] }),
    p("Z", "Murano", { years: [2007, 2014] }),
  ],
  "MAKE:NISSAN": [
    p("J", "Qashqai"),
    p("T", "X-Trail"),
    p("K", "Juke"),
    p("B", "Note"),
    p("Y", "Almera"),
    p("L", "Leaf"),
  ],
  JM1: [
    p("BK", "3", { years: [2003, 2008] }),
    p("BL", "3", { years: [2008, 2013] }),
    p("BM", "3", { years: [2013, 2018] }),
    p("BP", "3", { years: [2018, 2026] }),
    p("GG", "6", { years: [2002, 2007] }),
    p("GH", "6", { years: [2007, 2012] }),
    p("GJ", "6", { years: [2012, 2018] }),
    p("GL", "6", { years: [2018, 2026] }),
    p("CR", "CX-5", { years: [2012, 2016] }),
    p("KE", "CX-5", { years: [2016, 2026], confidence: 0.9 }),
    p("TB", "CX-3", { years: [2015, 2021] }),
    p("DK", "CX-30", { years: [2019, 2026] }),
    p("ER", "CX-7", { years: [2006, 2012] }),
    p("TB", "CX-9", { years: [2006, 2015] }),
    p("TC", "CX-9", { years: [2015, 2023] }),
    p("DE", "2", { years: [2007, 2014] }),
    p("DJ", "2", { years: [2014, 2022] }),
  ],
  "MAKE:MAZDA": [
    p("BL", "3"),
    p("BM", "3"),
    p("BP", "3"),
    p("GH", "6"),
    p("GJ", "6"),
    p("KE", "CX-5"),
    p("CR", "CX-5"),
    p("DJ", "2"),
  ],
  JA3: [
    p("A", "Lancer", { years: [2000, 2007] }),
    p("A", "Lancer", { years: [2007, 2017] }),
    p("B", "Outlander", { years: [2003, 2006] }),
    p("C", "Outlander", { years: [2006, 2012] }),
    p("G", "Outlander", { years: [2012, 2021] }),
    p("Z", "Outlander", { years: [2021, 2026] }),
    p("D", "Pajero", { years: [1999, 2006] }),
    p("V", "Pajero", { years: [2006, 2021] }),
    p("A", "ASX", { years: [2010, 2019] }),
    p("G", "ASX", { years: [2019, 2026] }),
    p("H", "L200", { years: [2005, 2015] }),
    p("K", "L200", { years: [2015, 2023] }),
  ],
  "MAKE:MITSUBISHI": [
    p("A", "Lancer"),
    p("C", "Outlander"),
    p("G", "Outlander"),
    p("V", "Pajero"),
    p("A", "ASX"),
    p("H", "L200"),
  ],
  JF1: [
    p("GD", "Impreza", { years: [2000, 2007] }),
    p("GE", "Impreza", { years: [2007, 2011] }),
    p("GJ", "Impreza", { years: [2011, 2016] }),
    p("GT", "Impreza", { years: [2016, 2023] }),
    p("SG", "Forester", { years: [2002, 2007] }),
    p("SH", "Forester", { years: [2007, 2012] }),
    p("SJ", "Forester", { years: [2012, 2018] }),
    p("SK", "Forester", { years: [2018, 2026] }),
    p("BL", "Legacy", { years: [2003, 2009] }),
    p("BM", "Legacy", { years: [2009, 2014] }),
    p("BN", "Legacy", { years: [2014, 2019] }),
    p("BP", "Outback", { years: [2003, 2009] }),
    p("BR", "Outback", { years: [2009, 2014] }),
    p("BS", "Outback", { years: [2014, 2019] }),
    p("BT", "Outback", { years: [2019, 2026] }),
    p("GP", "XV", { years: [2011, 2017] }),
    p("GT", "XV", { years: [2017, 2023] }),
  ],
  "MAKE:SUBARU": [
    p("GE", "Impreza"),
    p("GJ", "Impreza"),
    p("SH", "Forester"),
    p("SJ", "Forester"),
    p("SK", "Forester"),
    p("BR", "Outback"),
    p("BS", "Outback"),
    p("GP", "XV"),
  ],
  JS1: [
    p("YB", "Swift", { years: [2004, 2010] }),
    p("FZ", "Swift", { years: [2010, 2017] }),
    p("AZ", "Swift", { years: [2017, 2026] }),
    p("RB", "SX4", { years: [2006, 2013] }),
    p("YA", "SX4", { years: [2013, 2021] }),
    p("GY", "Vitara", { years: [2005, 2014] }),
    p("LY", "Vitara", { years: [2015, 2026], confidence: 0.9 }),
    p("FF", "Jimny", { years: [1998, 2018] }),
    p("GJ", "Jimny", { years: [2018, 2026] }),
    p("ZC", "Ignis", { years: [2016, 2026] }),
    p("EY", "Baleno", { years: [2015, 2022] }),
  ],
  "MAKE:SUZUKI": [
    p("FZ", "Swift"),
    p("AZ", "Swift"),
    p("LY", "Vitara"),
    p("YA", "SX4"),
    p("GJ", "Jimny"),
    p("ZC", "Ignis"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // VOLVO / LAND ROVER / JAGUAR
  // ═══════════════════════════════════════════════════════════════════════════
  YV1: [
    p("A", "S40", { years: [2004, 2012] }),
    p("M", "V40", { years: [2012, 2019] }),
    p("S", "S60", { years: [2000, 2009] }),
    p("F", "S60", { years: [2010, 2018] }),
    p("Z", "S60", { years: [2018, 2026] }),
    p("T", "V70", { years: [2000, 2007] }),
    p("B", "V70", { years: [2007, 2016] }),
    p("L", "V60", { years: [2010, 2018] }),
    p("Z", "V60", { years: [2018, 2026] }),
    p("C", "XC90", { years: [2002, 2014] }),
    p("L", "XC90", { years: [2014, 2026], confidence: 0.9 }),
    p("D", "XC60", { years: [2008, 2017] }),
    p("U", "XC60", { years: [2017, 2026], confidence: 0.9 }),
    p("C", "XC70", { years: [2000, 2007] }),
    p("B", "XC70", { years: [2007, 2016] }),
    p("M", "XC40", { years: [2017, 2026], confidence: 0.9 }),
    p("R", "S80", { years: [1998, 2006] }),
    p("A", "S80", { years: [2006, 2016] }),
  ],
  "MAKE:VOLVO": [
    p("L", "XC90"),
    p("U", "XC60"),
    p("D", "XC60"),
    p("M", "XC40"),
    p("F", "S60"),
    p("L", "V60"),
  ],
  SAL: [
    p("AA", "Freelander", { years: [1997, 2006] }),
    p("LA", "Freelander", { years: [2006, 2014] }),
    p("CA", "Discovery", { years: [1998, 2004] }),
    p("FA", "Discovery", { years: [2004, 2009] }),
    p("GA", "Discovery", { years: [2009, 2016] }),
    p("HA", "Discovery", { years: [2016, 2026] }),
    p("DA", "Defender", { years: [1983, 2016] }),
    p("LA", "Defender", { years: [2019, 2026], confidence: 0.9 }),
    p("MA", "Range Rover", { years: [2002, 2012] }),
    p("GA", "Range Rover", { years: [2012, 2021] }),
    p("NA", "Range Rover", { years: [2021, 2026] }),
    p("LA", "Range Rover Sport", { years: [2005, 2013] }),
    p("WA", "Range Rover Sport", { years: [2013, 2022] }),
    p("BA", "Range Rover Evoque", { years: [2011, 2018], confidence: 0.9 }),
    p("ZA", "Range Rover Evoque", { years: [2018, 2026] }),
    p("YA", "Discovery Sport", { years: [2014, 2026], confidence: 0.9 }),
  ],
  "MAKE:LAND ROVER": [
    p("BA", "Range Rover Evoque"),
    p("YA", "Discovery Sport"),
    p("LA", "Defender"),
    p("HA", "Discovery"),
    p("WA", "Range Rover Sport"),
  ],
  SAJ: [
    p("AA", "X-Type", { years: [2001, 2009] }),
    p("EA", "S-Type", { years: [1999, 2007] }),
    p("FA", "XF", { years: [2007, 2015] }),
    p("CA", "XF", { years: [2015, 2024] }),
    p("JA", "XE", { years: [2015, 2024], confidence: 0.9 }),
    p("AA", "XJ", { years: [2003, 2009] }),
    p("KA", "XJ", { years: [2009, 2019] }),
    p("AB", "F-Pace", { years: [2016, 2026], confidence: 0.9 }),
    p("AC", "E-Pace", { years: [2017, 2026] }),
    p("AD", "I-Pace", { years: [2018, 2026] }),
  ],
  "MAKE:JAGUAR": [
    p("JA", "XE"),
    p("FA", "XF"),
    p("CA", "XF"),
    p("AB", "F-Pace"),
    p("AC", "E-Pace"),
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LADA / CHEVROLET (CIS)
  // ═══════════════════════════════════════════════════════════════════════════
  XTA: [
    p("210", "2107", { years: [1982, 2012] }),
    p("211", "2110", { years: [1995, 2007] }),
    p("211", "2114", { years: [2001, 2013] }),
    p("217", "Priora", { years: [2007, 2018], confidence: 0.9 }),
    p("111", "Kalina", { years: [2004, 2013] }),
    p("219", "Kalina", { years: [2013, 2018] }),
    p("219", "Granta", { years: [2011, 2026], confidence: 0.92 }),
    p("212", "Niva", { years: [1977, 2020] }),
    p("213", "Niva", { years: [1993, 2020] }),
    p("2123", "Niva", { years: [2002, 2020] }),
    p("4X4", "Niva", { years: [2020, 2026] }),
    p("2180", "Vesta", { years: [2015, 2026], confidence: 0.95 }),
    p("GFL", "Vesta", { years: [2015, 2026] }),
    p("B0", "Largus", { years: [2012, 2026], confidence: 0.9 }),
    p("KS", "Largus", { years: [2012, 2021] }),
    p("GFK", "XRAY", { years: [2016, 2022] }),
  ],
  "MAKE:LADA": [
    p("2180", "Vesta"),
    p("GFL", "Vesta"),
    p("219", "Granta"),
    p("217", "Priora"),
    p("B0", "Largus"),
    p("2123", "Niva"),
    p("212", "Niva"),
    p("GFK", "XRAY"),
  ],
  "1G1": [
    p("A", "Aveo", { years: [2002, 2011] }),
    p("T", "Aveo", { years: [2011, 2020] }),
    p("J", "Cruze", { years: [2008, 2016], confidence: 0.9 }),
    p("B", "Lacetti", { years: [2002, 2012] }),
    p("C", "Captiva", { years: [2006, 2018] }),
    p("S", "Spark", { years: [2005, 2015] }),
    p("M", "Malibu", { years: [2011, 2023] }),
    p("E", "Epica", { years: [2006, 2012] }),
    p("T", "Trax", { years: [2013, 2022] }),
    p("O", "Orlando", { years: [2010, 2018] }),
  ],
  "MAKE:CHEVROLET": [
    p("J", "Cruze"),
    p("A", "Aveo"),
    p("T", "Aveo"),
    p("B", "Lacetti"),
    p("C", "Captiva"),
    p("S", "Spark"),
  ],
  "MAKE:JEEP": [
    p("K", "Cherokee"),
    p("J", "Grand Cherokee"),
    p("W", "Wrangler"),
    p("B", "Compass"),
    p("R", "Renegade"),
  ],
  "MAKE:TESLA": [
    p("S", "Model S"),
    p("3", "Model 3"),
    p("X", "Model X"),
    p("Y", "Model Y"),
  ],
};

export function formatModelLabel(model: string, generation?: string): string {
  if (!generation) return model;
  const g = generation.toUpperCase();
  if (model.toUpperCase().includes(`(${g})`)) return model;
  return `${model} (${generation})`;
}

export function lookupOpenWmi(wmi: string): OpenWmiEntry | undefined {
  const u = wmi.toUpperCase();
  if (OPEN_WMI[u]) return OPEN_WMI[u];
  // partial: some WMIs are 3 chars; try first 3 of longer keys already exact
  return undefined;
}

/**
 * Match VDS against open patterns for this WMI (+ aliases + MAKE:brand).
 * Prefer year-fitting rules; otherwise longest prefix, then confidence.
 */
export function lookupOpenModel(
  wmi: string,
  vds: string,
  modelYear?: number,
  makeHint?: string
): { model: string; generation?: string; confidence: number; source: string } | null {
  const wmiU = wmi.toUpperCase();
  const vdsU = vds.toUpperCase();
  const entry = OPEN_WMI[wmiU];
  const make = (makeHint || entry?.make || "").toUpperCase();

  const keys: string[] = [wmiU];
  if (entry?.patternAlias) keys.push(...entry.patternAlias);
  if (make) keys.push(`MAKE:${make}`);
  // unique preserve order
  const seen = new Set<string>();
  const uniqKeys = keys.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  type Hit = OpenVdsPattern & { key: string };
  const hits: Hit[] = [];
  for (const key of uniqKeys) {
    const list = OPEN_VDS_BY_WMI[key];
    if (!list) continue;
    for (const pat of list) {
      if (vdsU.startsWith(pat.prefix.toUpperCase())) {
        hits.push({ ...pat, key });
      }
    }
  }
  if (!hits.length) return null;

  hits.sort((a, b) => {
    const yearFit = (h: OpenVdsPattern): number => {
      if (modelYear == null || !h.years) return 0;
      return modelYear >= h.years[0] && modelYear <= h.years[1] ? 1 : -1;
    };
    const af = yearFit(a);
    const bf = yearFit(b);
    if (bf !== af) return bf - af;
    // Prefer WMI-specific over MAKE: generic
    const aSpec = a.key.startsWith("MAKE:") ? 0 : 1;
    const bSpec = b.key.startsWith("MAKE:") ? 0 : 1;
    if (bSpec !== aSpec) return bSpec - aSpec;
    if (b.prefix.length !== a.prefix.length) return b.prefix.length - a.prefix.length;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const best = hits[0]!;
  return {
    model: formatModelLabel(best.model, best.generation),
    generation: best.generation,
    confidence: best.confidence ?? 0.8,
    source: `open-data:${best.key}/${best.prefix}`,
  };
}

/** Stats for diagnostics / UI */
export function openDataCoverage(): { wmiCount: number; patternKeys: number; brands: string[] } {
  const brands = new Set<string>();
  for (const e of Object.values(OPEN_WMI)) brands.add(e.make);
  return {
    wmiCount: Object.keys(OPEN_WMI).length,
    patternKeys: Object.keys(OPEN_VDS_BY_WMI).length,
    brands: [...brands].sort(),
  };
}
