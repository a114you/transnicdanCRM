/**
 * Mercedes-Benz VIN decode for EU / world market (MD workshops).
 *
 * LastVIN (https://www.lastvin.com/) and MB EPC use the factory FIN layout:
 *   positions 1–3  WMI   (WDB / WDD / WDC / WDF / W1K / W1N …)
 *   positions 4–6  chassis series  → W204, W211, X253 …
 *   positions 4–9  full model type → e.g. 204.241 = C 200 Kompressor
 *
 * North-American letter codes (Wikibooks pos.4) are different and less common
 * on the Moldova / CIS import fleet — we focus on numeric chassis first.
 *
 * Full equipment datacard (SA codes, paint, engine) is only on LastVIN /
 * official EPC — we expose a deep-link; we do not scrape their captcha form.
 */

export type MercedesDecode = {
  make: "MERCEDES-BENZ";
  /** e.g. "C-Class (W204)" */
  model: string;
  /** Chassis family without body letter, e.g. "204" */
  chassis: string;
  /** Chassis label for catalogs, e.g. "W204" */
  chassisCode: string;
  /** Full type if digits 4–9 parse, e.g. "204.241" */
  typeCode?: string;
  bodyHint?: string;
  /** Production window for this chassis (helps discard bad ISO year) */
  years?: [number, number];
  /**
   * Year to show when ISO pos.10 is outside chassis window.
   * Mid-generation estimate only — LastVIN has factory exact year.
   */
  yearHint?: number;
  confidence: number;
  source: string;
  /** Open LastVIN datacard lookup (user opens in browser) */
  lastvinUrl: string;
};

const MERCEDES_WMI = new Set([
  "WDB",
  "WDD",
  "WDC",
  "WDF",
  "W1K",
  "W1N",
  "W1V",
  "WMX",
  "4JG",
  "55S",
  "9BM",
  "NMB", // smart / some MB
]);

/**
 * Positions 4–6 chassis → model + W/C/X/R/V body family letter used in TecDoc.
 * Sources: LastVIN titles, MB parts catalogs, public chassis lists.
 */
const CHASSIS_MAP: Record<
  string,
  { model: string; code: string; years?: [number, number]; body?: string }
> = {
  // A / B / CLA
  "168": { model: "A-Class", code: "W168", years: [1997, 2004] },
  "169": { model: "A-Class", code: "W169", years: [2004, 2012] },
  "176": { model: "A-Class", code: "W176", years: [2012, 2018] },
  "177": { model: "A-Class", code: "W177", years: [2018, 2026] },
  "245": { model: "B-Class", code: "W245", years: [2005, 2011] },
  "246": { model: "B-Class", code: "W246", years: [2011, 2019] },
  "247": { model: "B-Class", code: "W247", years: [2019, 2026] },
  "117": { model: "CLA-Class", code: "C117", years: [2013, 2019] },
  "118": { model: "CLA-Class", code: "C118", years: [2019, 2026] },

  // C-Class / CLK / CLE
  "201": { model: "190", code: "W201", years: [1982, 1993] },
  "202": { model: "C-Class", code: "W202", years: [1993, 2000] },
  "203": { model: "C-Class", code: "W203", years: [2000, 2007] },
  "204": { model: "C-Class", code: "W204", years: [2007, 2014] },
  "205": { model: "C-Class", code: "W205", years: [2014, 2021] },
  "206": { model: "C-Class", code: "W206", years: [2021, 2026] },
  "208": { model: "CLK-Class", code: "C208", years: [1997, 2003] },
  "209": { model: "CLK-Class", code: "C209", years: [2002, 2010] },
  "236": { model: "CLE-Class", code: "C236", years: [2023, 2026] },

  // E-Class / CLS
  "124": { model: "E-Class", code: "W124", years: [1984, 1997] },
  "210": { model: "E-Class", code: "W210", years: [1995, 2003] },
  "211": { model: "E-Class", code: "W211", years: [2002, 2009] },
  "212": { model: "E-Class", code: "W212", years: [2009, 2016] },
  "213": { model: "E-Class", code: "W213", years: [2016, 2023] },
  "214": { model: "E-Class", code: "W214", years: [2023, 2026] },
  "207": { model: "E-Class Coupe", code: "C207", years: [2009, 2017] },
  "238": { model: "E-Class Coupe", code: "C238", years: [2017, 2023] },
  "218": { model: "CLS-Class", code: "C218", years: [2010, 2018] },
  "219": { model: "CLS-Class", code: "C219", years: [2004, 2010] },
  "257": { model: "CLS-Class", code: "C257", years: [2018, 2023] },

  // S-Class / CL / Maybach
  "126": { model: "S-Class", code: "W126", years: [1979, 1991] },
  "140": { model: "S-Class", code: "W140", years: [1991, 1998] },
  "220": { model: "S-Class", code: "W220", years: [1998, 2005] },
  "221": { model: "S-Class", code: "W221", years: [2005, 2013] },
  "222": { model: "S-Class", code: "W222", years: [2013, 2020] },
  "223": { model: "S-Class", code: "W223", years: [2020, 2026] },
  "215": { model: "CL-Class", code: "C215", years: [1999, 2006] },
  "216": { model: "CL-Class", code: "C216", years: [2006, 2014] },
  "217": { model: "S-Class Coupe", code: "C217", years: [2014, 2021] },

  // SL / SLK / SLC / AMG GT
  "107": { model: "SL-Class", code: "R107", years: [1971, 1989] },
  "129": { model: "SL-Class", code: "R129", years: [1989, 2001] },
  "230": { model: "SL-Class", code: "R230", years: [2001, 2011] },
  "231": { model: "SL-Class", code: "R231", years: [2012, 2020] },
  "232": { model: "SL-Class", code: "R232", years: [2021, 2026] },
  "170": { model: "SLK-Class", code: "R170", years: [1996, 2004] },
  "171": { model: "SLK-Class", code: "R171", years: [2004, 2010] },
  "172": { model: "SLC-Class", code: "R172", years: [2011, 2020] },
  "190": { model: "AMG GT", code: "C190", years: [2014, 2021] },
  "192": { model: "AMG GT", code: "C192", years: [2023, 2026] },
  "290": { model: "AMG GT 4-Door", code: "X290", years: [2018, 2026] },

  // SUV / crossover
  "163": { model: "M-Class", code: "W163", years: [1997, 2005] },
  "164": { model: "M-Class", code: "W164", years: [2005, 2011] },
  "166": { model: "GLE-Class", code: "W166", years: [2011, 2019], body: "ML/GLE" },
  "167": { model: "GLE-Class", code: "W167", years: [2019, 2026] },
  "251": { model: "R-Class", code: "W251", years: [2005, 2013] },
  "164X": { model: "GL-Class", code: "X164", years: [2006, 2012] }, // handled via 164 + context
  "166X": { model: "GLS-Class", code: "X166", years: [2012, 2019] },
  "167X": { model: "GLS-Class", code: "X167", years: [2019, 2026] },
  "204X": { model: "GLK-Class", code: "X204", years: [2008, 2015] },
  "253": { model: "GLC-Class", code: "X253", years: [2015, 2022] },
  "254": { model: "GLC-Class", code: "X254", years: [2022, 2026] },
  "156": { model: "GLA-Class", code: "X156", years: [2013, 2020] },
  "247G": { model: "GLA-Class", code: "H247", years: [2020, 2026] },
  "247B": { model: "GLB-Class", code: "X247", years: [2019, 2026] },
  "463": { model: "G-Class", code: "W463", years: [1990, 2018] },
  "464": { model: "G-Class", code: "W464", years: [2018, 2026] },
  "465": { model: "G-Class", code: "W465", years: [2024, 2026] },

  // Vans / commercial (very common in MD service)
  "638": { model: "Vito", code: "W638", years: [1996, 2003] },
  "639": { model: "Vito", code: "W639", years: [2003, 2014] },
  "447": { model: "V-Class", code: "W447", years: [2014, 2026], body: "Vito/V-Class" },
  "448": { model: "Vito", code: "W448", years: [2023, 2026] },
  "901": { model: "Sprinter", code: "T1N", years: [1995, 2006] },
  "902": { model: "Sprinter", code: "T1N", years: [1995, 2006] },
  "903": { model: "Sprinter", code: "T1N", years: [1995, 2006] },
  "904": { model: "Sprinter", code: "T1N", years: [1995, 2006] },
  "905": { model: "Sprinter", code: "T1N", years: [1995, 2006] },
  "906": { model: "Sprinter", code: "W906", years: [2006, 2018] },
  "907": { model: "Sprinter", code: "W907", years: [2018, 2026] },
  "910": { model: "Citan", code: "W415", years: [2012, 2021] },
  "415": { model: "Citan", code: "W415", years: [2012, 2021] },
  "420": { model: "Citan", code: "W420", years: [2021, 2026] },
  "670": { model: "X-Class", code: "W470", years: [2017, 2020] },

  // EQ electric
  "243": { model: "EQB", code: "X243", years: [2021, 2026] },
  "294": { model: "EQE SUV", code: "X294", years: [2022, 2026] },
  "295": { model: "EQE", code: "V295", years: [2022, 2026] },
  "296": { model: "EQS SUV", code: "X296", years: [2022, 2026] },
  "297": { model: "EQS", code: "V297", years: [2021, 2026] },
};

/** WMI + chassis refinements for SUVs sharing numeric base with sedans */
function refineChassis(
  wmi: string,
  chassis: string,
  year?: number
): { model: string; code: string; body?: string } | null {
  const base = CHASSIS_MAP[chassis];
  if (!base) return null;

  // X164 GL shares "164" with W164 ML — WDC often SUV; GL is X164
  // Heuristic: WDC + 164 → prefer M-Class; can't split GL without more digits.
  // WDC + 166 mid-cycle GL → GLS marketed as X166
  if (wmi === "WDC" || wmi === "W1N" || wmi === "4JG") {
    if (chassis === "164") return { model: "M-Class", code: "W164", body: "ML" };
    if (chassis === "166") {
      // 2012–2015 ML, 2016+ GLE; GL/GLS often same plant codes
      if (year != null && year >= 2016) return { model: "GLE-Class", code: "W166" };
      return { model: "M-Class", code: "W166", body: "ML" };
    }
    if (chassis === "204") return { model: "GLK-Class", code: "X204" };
    if (chassis === "253") return { model: "GLC-Class", code: "X253" };
    if (chassis === "254") return { model: "GLC-Class", code: "X254" };
    if (chassis === "156") return { model: "GLA-Class", code: "X156" };
    if (chassis === "247") return { model: "GLB-Class", code: "X247" };
    if (chassis === "167") return { model: "GLE-Class", code: "W167" };
    if (chassis === "463" || chassis === "464" || chassis === "465") {
      return { model: "G-Class", code: base.code };
    }
  }

  // Vans
  if (wmi === "WDF" || wmi === "W1V") {
    if (chassis === "639") return { model: "Vito", code: "W639" };
    if (chassis === "447") return { model: "V-Class", code: "W447", body: "Vito/Vito Tourer" };
    if (chassis === "906" || chassis === "907") return { model: "Sprinter", code: base.code };
  }

  return { model: base.model, code: base.code, body: base.body };
}

export function isMercedesWmi(wmi: string): boolean {
  return MERCEDES_WMI.has(wmi.toUpperCase());
}

export function lastvinDatacardUrl(vin: string): string {
  // Public site; user submits VIN there for full SA-code datacard
  return `https://www.lastvin.com/?vin=${encodeURIComponent(vin.toUpperCase())}`;
}

/**
 * Decode EU-style Mercedes VIN → class + chassis (Wxxx) for parts catalogs.
 */
export function decodeMercedesVin(
  vinRaw: string,
  modelYear?: number
): MercedesDecode | null {
  const vin = vinRaw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (vin.length !== 17) return null;

  const wmi = vin.slice(0, 3);
  if (!isMercedesWmi(wmi)) return null;

  // EU FIN: chassis = digits at positions 4–6 (1-based)
  const chassisDigits = vin.slice(3, 6);
  if (!/^\d{3}$/.test(chassisDigits)) {
    // NA letter-coded VIN — fall back weakly
    return {
      make: "MERCEDES-BENZ",
      model: "Mercedes-Benz",
      chassis: "",
      chassisCode: "",
      confidence: 0.4,
      source: "mercedes-wmi-only",
      lastvinUrl: lastvinDatacardUrl(vin),
    };
  }

  const refined = refineChassis(wmi, chassisDigits, modelYear);
  const mapped = CHASSIS_MAP[chassisDigits];
  if (!refined && !mapped) {
    return {
      make: "MERCEDES-BENZ",
      model: `Chassis ${chassisDigits}`,
      chassis: chassisDigits,
      chassisCode: `W${chassisDigits}`,
      typeCode: `${chassisDigits}.${vin.slice(6, 9)}`,
      confidence: 0.55,
      source: "mercedes-chassis-unknown",
      lastvinUrl: lastvinDatacardUrl(vin),
    };
  }

  const modelName = refined?.model || mapped!.model;
  const chassisCode = refined?.code || mapped!.code;
  const typeCode = `${chassisDigits}.${vin.slice(6, 9)}`;
  const years = mapped?.years;

  // Year: keep ISO only if it fits chassis window; else leave hint for mid-gen
  let confidence = 0.95;
  let yearHint: number | undefined;
  if (years) {
    if (modelYear != null && modelYear >= years[0] - 1 && modelYear <= years[1] + 1) {
      confidence = 0.96;
    } else {
      // EU FIN year digit is often unreliable vs factory datacard (LastVIN)
      yearHint = Math.round((years[0] + years[1]) / 2);
      confidence = 0.92;
    }
  }

  const model = `${modelName} (${chassisCode})`;

  return {
    make: "MERCEDES-BENZ",
    model,
    chassis: chassisDigits,
    chassisCode,
    typeCode,
    bodyHint: refined?.body,
    years,
    yearHint,
    confidence,
    source: `mercedes-chassis:${chassisCode}`,
    lastvinUrl: lastvinDatacardUrl(vin),
  };
}
