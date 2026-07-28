/**
 * OEM quality filters + search variants.
 * Stops garbage OCR (NO00000001139-style) from burning multi-shop searches,
 * and expands real MB N/A codes into forms shops actually index.
 */

import { normalizeArticle } from "./normalize";

/** Zero-heavy "NO0000000…" almost never hits MD catalogs; often OCR O/0 mess. */
export function isJunkOem(raw: string): boolean {
  const s = normalizeArticle(raw);
  if (s.length < 3 || s.length > 22) return true;
  if (!/\d/.test(s)) return true;
  // Short aftermarket (OC90, W712/95, HU719) — never junk by length alone
  if (s.length <= 8 && /[A-Z]/.test(s) && /\d/.test(s) && !/^NO0/.test(s) && !/0{4,}/.test(s)) {
    return false;
  }
  // 5+ consecutive zeros → almost always OCR/placeholder (NO00000001139)
  if (/0{5,}/.test(s)) return true;
  // O used as fake zeros (NOOOOOOOO1139)
  if ((s.match(/O/g) || []).length >= 3) return true;
  // All zeros after 1–2 letters
  if (/^[A-Z]{1,3}0{6,}$/.test(s)) return true;
  // NO00000001139 — letter O + many zeros
  if (/^NO0{3,}/.test(s)) return true;
  // Too many zeros overall (long codes only)
  if (s.length >= 10) {
    const zeros = (s.match(/0/g) || []).length;
    if (zeros / s.length >= 0.5 && zeros >= 6) return true;
  }
  if (/^NO0+$/i.test(s) || /^0{8,}$/.test(s)) return true;
  if (/^X{3,}|TEST|NULL|UNDEF/i.test(s)) return true;
  return false;
}

/** Score higher for shapes MD shops and MB EPC actually use. */
export function scoreOemCandidate(raw: string): number {
  const s = normalizeArticle(raw);
  if (!s) return 0;
  if (isJunkOem(s)) return 0;
  if (/^A\d{10}$/.test(s)) return 100;
  if (/^A\d{11,12}$/.test(s)) return 95;
  // MB standard hardware N910…
  if (/^N9\d{10,}$/.test(s)) return 92;
  if (/^N\d{11,14}$/.test(s)) return 88;
  if (/^N[A-Z0-9]{10,}$/.test(s) && !/^NO0/.test(s)) return 75;
  // Short filter codes: OC90, HU719, W712
  if (/^[A-Z]{1,3}\d{2,5}[A-Z0-9]*$/.test(s) && s.length <= 10) return 70;
  // Common aftermarket / OEM
  if (/^\d{5}[A-Z0-9]{4,}$/.test(s)) return 70;
  if (/^[A-Z]{1,3}\d{6,}$/.test(s)) return 65;
  if (s.length >= 8 && s.length <= 16) return 40;
  if (s.length >= 4 && s.length <= 7) return 50;
  return 15;
}

export function isPlausibleOem(raw: string): boolean {
  return scoreOemCandidate(raw) >= 40;
}

/**
 * OCR confuses 0/O, 1/I, 5/S. Build alternate readings and pick best.
 */
export function ocrOemHypotheses(rawText: string): string[] {
  const base = (rawText || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (!base) return [];

  const set = new Set<string>();
  const add = (s: string) => {
    const n = normalizeArticle(s);
    if (n.length >= 6) set.add(n);
  };
  add(base);

  // Prefer digit forms (O→0), never mass 0→O (creates NOOOOO junk)
  add(base.replace(/O/g, "0"));
  add(base.replace(/I/g, "1").replace(/L/g, "1"));
  add(base.replace(/S/g, "5"));

  // N-series: NO0… → N00… / N91…
  if (/^N/.test(base)) {
    const rest = base.slice(1).replace(/O/g, "0");
    add("N" + rest);
    if (/^0{2,}/.test(rest)) {
      const digits = rest.replace(/\D/g, "");
      if (digits.length >= 10) {
        add("N9" + digits.slice(-11));
        add("N91" + digits.slice(-10));
        add("N" + digits);
      }
    }
  }

  // A-series Mercedes
  if (/^A/.test(base) || /^\d{10,12}$/.test(base)) {
    const d = base.replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 12) add("A" + d);
  }

  return [...set];
}

/** Best OEM from OCR raw text, or null if nothing plausible. */
export function pickBestOcrOem(rawText: string): string | null {
  const hyps = ocrOemHypotheses(rawText);
  let best: string | null = null;
  let bestScore = 0;
  for (const h of hyps) {
    const sc = scoreOemCandidate(h);
    if (sc > bestScore) {
      bestScore = sc;
      best = h;
    }
  }
  return bestScore >= 40 ? best : null;
}

/**
 * Forms to try against MD shops (primary first).
 * Keeps list short to avoid 5× supplier load.
 */
export function oemSearchVariants(raw: string): string[] {
  const n = normalizeArticle(raw);
  if (!n) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const x = normalizeArticle(s);
    if (x.length >= 3 && !out.includes(x) && !isJunkOem(x) && isPlausibleOem(x)) {
      out.push(x);
    }
  };
  push(n);

  if (/^N/.test(n)) {
    // N910105010012 sometimes listed without leading N
    if (/^N\d{10,}$/.test(n)) push(n.slice(1));
  }

  // Short codes like OC90 — only the primary form
  return out.slice(0, 3);
}
