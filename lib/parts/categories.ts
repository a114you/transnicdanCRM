import {
  CATEGORY_GROUPS,
  categoryLinksFor,
  UNIFIED_CATEGORIES,
  type UnifiedCategoryId,
} from "./suppliers/catalog";
import type { PartCategory } from "./types";

/** @deprecated path kept for AutoMall deep links — prefer UNIFIED_CATEGORIES */
export const PART_CATEGORIES: PartCategory[] = UNIFIED_CATEGORIES.map((c) => ({
  id: c.id,
  nameRu: c.nameRu,
  nameRo: c.nameRo,
  path: c.id,
  group: c.group,
}));

export { CATEGORY_GROUPS, UNIFIED_CATEGORIES, categoryLinksFor };
export type { UnifiedCategoryId };

/** Common passenger car marks for vehicle selection UI */
export const VEHICLE_MARKS: { id: string; name: string }[] = [
  { id: "5", name: "AUDI" },
  { id: "16", name: "BMW" },
  { id: "138", name: "CHEVROLET" },
  { id: "21", name: "CITROËN" },
  { id: "139", name: "DACIA" },
  { id: "35", name: "FIAT" },
  { id: "36", name: "FORD" },
  { id: "45", name: "HONDA" },
  { id: "183", name: "HYUNDAI" },
  { id: "56", name: "JAGUAR" },
  { id: "184", name: "KIA" },
  { id: "1820", name: "LAND ROVER" },
  { id: "72", name: "MAZDA" },
  { id: "74", name: "MERCEDES" },
  { id: "77", name: "MITSUBISHI" },
  { id: "80", name: "NISSAN" },
  { id: "84", name: "OPEL" },
  { id: "93", name: "RENAULT" },
  { id: "106", name: "SKODA" },
  { id: "107", name: "SUBARU" },
  { id: "111", name: "SUZUKI" },
  { id: "112", name: "TOYOTA" },
  { id: "121", name: "VOLKSWAGEN" },
  { id: "122", name: "VOLVO" },
];

export function automallCategoryUrl(path: string): string {
  const base = (process.env.AUTOMALL_BASE_URL || "https://automall.md").replace(/\/$/, "");
  if (path.startsWith("http")) return path;
  // unified ids map to automall where known
  const map: Record<string, string> = {
    "oils-motor": "/Auto/10345/motor-oil",
    "oils-trans": "/Auto/oil/trans_oil",
    "selection-car": "/Auto/Selection?forTrucks=False",
    lamps: "/Auto/autolamp/lamp-12volt",
    chemistry: "/Auto/avtohimia",
    accessories: "/Auto/accessory",
    fluids: "/Auto/9083",
    brakes: "/Auto/9241",
  };
  const p = map[path] || (path.startsWith("/") ? path : `/${path}`);
  return `${base}${p}`;
}
