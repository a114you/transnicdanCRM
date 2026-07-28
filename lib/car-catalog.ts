import { CAR_CATALOG } from "./car-catalog-data";

export const CAR_MAKES = Object.keys(CAR_CATALOG);

const normalizedMakeMap = new Map(CAR_MAKES.map((make) => [normalizeCatalogText(make), make]));

function normalizeCatalogText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function scoreSuggestion(value: string, query: string) {
  const normalizedValue = normalizeCatalogText(value);
  const normalizedQuery = normalizeCatalogText(query);
  if (!normalizedQuery) return 0;
  if (normalizedValue === normalizedQuery) return 100;
  if (normalizedValue.startsWith(normalizedQuery)) return 80 - Math.min(value.length, 40) / 10;
  if (normalizedValue.includes(normalizedQuery)) return 45 - normalizedValue.indexOf(normalizedQuery);
  return -1;
}

export function getCanonicalMake(make: string) {
  return normalizedMakeMap.get(normalizeCatalogText(make));
}

export function getCarMakeSuggestions(query: string, limit = 8) {
  const normalizedQuery = normalizeCatalogText(query);
  if (!normalizedQuery) return CAR_MAKES.slice(0, limit);

  return CAR_MAKES
    .map((make) => ({ make, score: scoreSuggestion(make, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.make.localeCompare(b.make))
    .slice(0, limit)
    .map((item) => item.make);
}

export function getCarModelSuggestions(make: string, query: string, limit = 8) {
  const canonicalMake = getCanonicalMake(make);
  const makePool = canonicalMake ? [canonicalMake] : getCarMakeSuggestions(make, 3);
  const models = Array.from(new Set(makePool.flatMap((item) => [...CAR_CATALOG[item as keyof typeof CAR_CATALOG]])));
  const normalizedQuery = normalizeCatalogText(query);

  if (!normalizedQuery) return models.slice(0, limit);

  return models
    .map((model) => ({ model, score: scoreSuggestion(model, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
    .slice(0, limit)
    .map((item) => item.model);
}
