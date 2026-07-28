/**
 * VIN decode for Moldova market (workshop / CautPiese).
 *
 * Pipeline (no paid API keys):
 *  1) **chassi** — modern offline OSS (ISO 3779 validate, WMI, year, model patterns)
 *  2) **Mercedes chassis decoder** — EU FIN positions 4–6 (LastVIN / MB EPC style)
 *     https://www.lastvin.com/  (+ deep-link for full datacard)
 *  3) **Open-data EU pack** — all major brands (Kia FE→Cerato, VW, Dacia…)
 *  4) **NHTSA vPIC** — free online US/global API (weak for pure EU VINs)
 */

import { decodeVin as chassiDecode, validateVin as chassiValidate } from "chassi";
import { isValidVin, normalizeVin } from "./normalize";
import type { VinDecodeResult } from "./types";
import { lookupOpenModel, lookupOpenWmi } from "./vin-open-data";
import { decodeMercedesVin, isMercedesWmi } from "./vin-mercedes";

function emptyToUndef(v?: string | null): string | undefined {
  if (!v) return undefined;
  const t = String(v).trim();
  if (!t || t === "Not Applicable" || t === "Null" || t === "0" || /^not\s/i.test(t)) {
    return undefined;
  }
  return t;
}

function titleMake(raw?: string | null): string | undefined {
  const t = emptyToUndef(raw);
  if (!t) return undefined;
  // "Kia car" / "Volkswagen" → brand style used elsewhere in CRM
  const cleaned = t.replace(/\s+car$/i, "").trim();
  return cleaned.toUpperCase();
}

/** Offline decode: chassi + open-data EU pack */
export function decodeVinLocal(vinRaw: string): VinDecodeResult {
  const vin = normalizeVin(vinRaw);
  if (!isValidVin(vin)) {
    return {
      vin,
      valid: false,
      error: "VIN должен содержать 17 символов (без I, O, Q)",
    };
  }

  const chassi = chassiDecode(vin, { includeComponents: true });
  const validation = chassiValidate(vin);
  const wmi = vin.slice(0, 3).toUpperCase();
  const vds = vin.slice(3, 8).toUpperCase();

  const openWmi = lookupOpenWmi(wmi);
  // Prefer open-data make when we explicitly correct chassi (e.g. UU1 = Dacia not Renault)
  const make =
    (openWmi?.make ? openWmi.make : undefined) ||
    titleMake(chassi.manufacturer);

  const yearNum =
    chassi.year ??
    (chassi.possibleYears?.length
      ? Math.max(...chassi.possibleYears.filter((y: number) => y <= new Date().getFullYear() + 1))
      : undefined);
  const modelYear = yearNum != null ? String(yearNum) : undefined;

  // Open-data model (year-aware) — all brands (MD/EU pack)
  // Prefer open-data over chassi when ≥0.85: chassi often reports confidence=1
  // with coarse/wrong models (e.g. BMW VA → "5 Series").
  const openModel = lookupOpenModel(wmi, vds, yearNum, make);

  // Mercedes EU chassis (LastVIN / EPC style) — highest priority for MB, never override
  const mb = isMercedesWmi(wmi) ? decodeMercedesVin(vin, yearNum) : null;

  let model: string | undefined;
  let modelSource = "";
  let confidence = 0;
  let extraNote: string | undefined;
  let lastvinUrl: string | undefined;
  /** Prefer generation year window over ISO pos.10 when it is clearly wrong (common on EU MB) */
  let modelYearOut = modelYear;

  if (mb && mb.confidence >= 0.55) {
    model = mb.model;
    modelSource = mb.source;
    confidence = mb.confidence;
    lastvinUrl = mb.lastvinUrl;
    extraNote =
      `Шасси ${mb.chassisCode}${mb.typeCode ? ` · тип ${mb.typeCode}` : ""}. ` +
      `Полный datacard (двигатель, SA-коды, краска): ${mb.lastvinUrl}`;

    // ISO pos.10 year is often wrong on EU MB — only keep if inside chassis window
    if (mb.years && yearNum != null) {
      const [y0, y1] = mb.years;
      if (yearNum < y0 - 1 || yearNum > y1 + 1) {
        // Don't invent a fake year; user can open LastVIN for factory year
        modelYearOut = undefined;
      }
    }
  } else {
    if (openModel && openModel.confidence >= 0.85) {
      model = openModel.model;
      modelSource = openModel.source;
      confidence = openModel.confidence;
    } else if (openModel && openModel.confidence >= 0.75) {
      model = openModel.model;
      modelSource = openModel.source;
      confidence = openModel.confidence;
    }

    if (!model && chassi.model) {
      model = chassi.model;
      modelSource = "chassi";
      confidence = chassi.confidence ?? 0.5;
    } else if (
      chassi.model &&
      openModel &&
      openModel.confidence < 0.85 &&
      (chassi.confidence ?? 0) > confidence + 0.1
    ) {
      model = chassi.model;
      modelSource = "chassi";
      confidence = chassi.confidence ?? 0.7;
    }

    if (
      openModel?.generation &&
      model &&
      modelSource === "chassi" &&
      !/\([A-Z0-9][\w/.-]*\)$/i.test(model)
    ) {
      const bare = openModel.model.split(" (")[0]!.toLowerCase();
      if (model.toLowerCase() === bare || model.toLowerCase().includes(bare)) {
        model = openModel.model;
        modelSource = openModel.source;
      }
    }
  }

  const resolvedMake = mb?.make || make;
  const plantCountry = openWmi?.country || chassi.country || undefined;

  const sources = ["chassi"];
  if (mb) sources.push("mercedes-chassis+lastvin-link");
  if (!mb && (openWmi || openModel)) sources.push("open-data-eu");

  const notes: string[] = [];
  if (!resolvedMake) {
    notes.push(
      `Не удалось определить марку по WMI «${wmi}». Выберите марку вручную.`
    );
  } else if (extraNote) {
    notes.push(extraNote);
  }

  return {
    vin,
    valid: validation.valid || chassi.valid || isValidVin(vin),
    make: resolvedMake,
    model,
    modelYear: modelYearOut,
    plantCountry,
    error: notes[0],
    raw: {
      WMI: wmi,
      VDS: vds,
      MakeLocal: resolvedMake || "",
      ModelLocal: model || "",
      ModelYearLocal: modelYearOut || "",
      ChassiManufacturer: chassi.manufacturer || "",
      ChassiModel: chassi.model || "",
      ChassiConfidence: String(chassi.confidence ?? ""),
      OpenDataSource: modelSource,
      MercedesChassis: mb?.chassisCode || "",
      MercedesType: mb?.typeCode || "",
      LastVIN: lastvinUrl || "",
      Country: plantCountry || chassi.country || "",
      Source: sources.join("+"),
    },
  };
}

async function fetchNhtsaFlat(vin: string): Promise<Record<string, string> | null> {
  const urls = [
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Montatorul-SPARK-CRM/1.0" },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { Results?: Array<Record<string, string>> };
      const row = data.Results?.[0];
      if (row) return row;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchNhtsaVariableList(vin: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Montatorul-SPARK-CRM/1.0" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      Results?: Array<{ Variable?: string; Value?: string | null }>;
    };
    for (const r of data.Results || []) {
      const k = r.Variable?.trim();
      const v = emptyToUndef(r.Value ?? undefined);
      if (k && v) out[k] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function decodeVin(raw: string): Promise<VinDecodeResult> {
  const vin = normalizeVin(raw);
  const local = decodeVinLocal(vin);
  if (!local.valid && !isValidVin(vin)) return local;

  const [flat, vars] = await Promise.all([fetchNhtsaFlat(vin), fetchNhtsaVariableList(vin)]);

  const nhtsaMake = titleMake(
    emptyToUndef(flat?.Make) || emptyToUndef(vars.Make) || emptyToUndef(vars["Manufacturer Name"])
  );
  const nhtsaModel =
    emptyToUndef(flat?.Model) ||
    emptyToUndef(vars.Model) ||
    emptyToUndef(flat?.Series) ||
    emptyToUndef(vars.Series);
  const nhtsaYear = emptyToUndef(flat?.ModelYear) || emptyToUndef(vars["Model Year"]);
  const nhtsaTrim = emptyToUndef(flat?.Trim) || emptyToUndef(vars.Trim) || emptyToUndef(vars["Series2"]);
  const nhtsaBody =
    emptyToUndef(flat?.BodyClass) || emptyToUndef(vars["Body Class"]) || emptyToUndef(vars.BodyClass);
  const nhtsaFuel =
    emptyToUndef(flat?.FuelTypePrimary) || emptyToUndef(vars["Fuel Type - Primary"]);
  const nhtsaPlant = emptyToUndef(flat?.PlantCountry) || emptyToUndef(vars["Plant Country"]);
  const engine = [
    emptyToUndef(flat?.DisplacementL) ||
      emptyToUndef(vars.DisplacementL) ||
      emptyToUndef(vars["Displacement (L)"]),
    emptyToUndef(flat?.EngineModel) || emptyToUndef(vars["Engine Model"]),
    emptyToUndef(flat?.EngineCylinders) || emptyToUndef(vars["Engine Number of Cylinders"]),
  ]
    .filter(Boolean)
    .join(" / ");

  // Prefer NHTSA only when it actually resolved make/model (US-market VINs).
  // Mercedes EU chassis (W204…) from local always wins over coarse NHTSA names.
  const isMbLocal = !!local.raw?.MercedesChassis;
  const make = isMbLocal ? local.make || nhtsaMake : nhtsaMake || local.make;
  let model = isMbLocal ? local.model || nhtsaModel : nhtsaModel || local.model;
  const modelYear = isMbLocal
    ? local.modelYear || nhtsaYear
    : nhtsaYear || local.modelYear;

  // If NHTSA returned a bare US name (Spectra) for same platform, keep local generation label when richer
  if (
    local.model &&
    nhtsaModel &&
    /cerato|spectra|forte/i.test(local.model) &&
    /spectra|forte/i.test(nhtsaModel) &&
    local.model.includes("(")
  ) {
    model = local.model;
  }
  if (isMbLocal && local.model) {
    model = local.model;
  }

  let modelDisplay = model;
  if (model && nhtsaTrim && !model.toLowerCase().includes(nhtsaTrim.toLowerCase())) {
    modelDisplay = `${model} ${nhtsaTrim}`.trim();
  }

  const sources: string[] = [local.raw?.Source || "chassi+open-data-eu"];
  if (flat) sources.push("nhtsa-flat");
  if (Object.keys(vars).length) sources.push("nhtsa-vars");

  const notes: string[] = [];
  if (make && modelDisplay) {
    notes.push(
      `VIN: ${make} ${modelDisplay}${modelYear ? ` · ${modelYear}` : ""}` +
        ` (${nhtsaModel ? "NHTSA + " : ""}chassi/open-data).`
    );
  } else if (make && !modelDisplay) {
    notes.push(
      `NHTSA/chassi не знают модель (часто EU). По WMI: ${make}` +
        `${modelYear ? `, ~${modelYear}` : ""}. Уточните модификацию в списке.`
    );
  }

  return {
    vin,
    valid: true,
    make,
    model: modelDisplay,
    modelYear,
    bodyClass: nhtsaBody,
    engine: engine || undefined,
    fuel: nhtsaFuel,
    plantCountry: nhtsaPlant || local.plantCountry,
    error: notes[0] || local.error,
    raw: {
      ...(local.raw || {}),
      Make: make || "",
      Model: modelDisplay || "",
      ModelYear: modelYear || "",
      Trim: nhtsaTrim || "",
      BodyClass: nhtsaBody || "",
      VehicleType: flat?.VehicleType || vars["Vehicle Type"] || "",
      ErrorText: flat?.ErrorText || "",
      Source: sources.join("+"),
    },
  };
}
