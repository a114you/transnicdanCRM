/** Normalize OEM / aftermarket article codes for comparison and search. */
export function normalizeArticle(input: string): string {
  let s = (input || "").trim().toUpperCase();
  if (!s) return "";

  s = s.replace(/^(OE|OEM|O\.E\.|S-)[\s:_-]*/i, "");
  s = s.replace(/[\s\u00A0._\-–—/\\]+/g, "");
  s = s.replace(/[^A-Z0-9]/g, "");

  return s;
}

/** Soft form for URLs: keep common separators some shops expect. */
export function articleForUrl(input: string): string {
  let s = (input || "").trim().toUpperCase();
  s = s.replace(/^(OE|OEM|O\.E\.|S-)[\s:_-]*/i, "");
  s = s.replace(/[\s\u00A0]+/g, " ").trim();
  return s;
}

/** Compare two codes ignoring separators. */
export function articlesMatch(a: string, b: string): boolean {
  return normalizeArticle(a) === normalizeArticle(b);
}

export function parsePrice(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = String(text)
    .replace(/\u00A0/g, " ")
    .replace(/[^\d,.\s]/g, "")
    .trim();
  if (!cleaned) return null;

  // European: 1.234,56 or 1234,56 → 1234.56
  let n: number;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  } else if (cleaned.includes(",")) {
    n = Number(cleaned.replace(/\s/g, "").replace(",", "."));
  } else {
    n = Number(cleaned.replace(/\s/g, ""));
  }

  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function isValidVin(vin: string): boolean {
  const v = (vin || "").trim().toUpperCase().replace(/\s+/g, "");
  if (v.length !== 17) return false;
  if (/[IOQ]/.test(v)) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

export function normalizeVin(vin: string): string {
  return (vin || "").trim().toUpperCase().replace(/[\s\-]/g, "");
}
