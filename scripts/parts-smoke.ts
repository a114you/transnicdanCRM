/**
 * Smoke test for CORE article search (no auth — calls lib directly).
 * Usage: npx tsx scripts/parts-smoke.ts
 * Exit 0 if at least one trusted exact/cross price from proparts|enorm|procar.
 */
import { searchPartsByCode } from "../lib/parts/search";

const CODES = process.env.SMOKE_CODES?.split(",") || ["OC90", "GDB199"];
const CORE_OK = new Set(["proparts", "enorm", "procar", "aps", "autodoctor"]);

async function smokeOne(code: string) {
  const t0 = Date.now();
  const res = await searchPartsByCode(code, { phase: "core", skipCache: true });
  const ms = Date.now() - t0;
  const trusted = res.offers.filter(
    (o) =>
      o.price != null &&
      o.price >= 3 &&
      o.priceConfidence !== "low" &&
      (!o.currency || /^(MDL|L|LEI)$/i.test(o.currency))
  );
  const fromCore = trusted.filter((o) => CORE_OK.has(o.supplier));
  const exact = fromCore.filter((o) => o.matchType === "exact" || o.matchType === "cross");

  console.log(`\n=== ${code} ===`);
  console.log(`took ${ms}ms · phase=${res.phase} · offers=${res.offers.length} · trusted=${trusted.length}`);
  console.log(`suppliersOk ${res.suppliersOk}/${res.suppliersTotal}`);
  for (const r of res.results) {
    const n = r.offers.filter((o) => o.price != null).length;
    const mark = r.blocked ? "WAF" : !r.ok ? "ERR" : n ? "OK" : "EMPTY";
    console.log(`  [${mark}] ${r.supplierName}: ${n} prices · ${r.durationMs}ms ${r.error || ""}`);
  }
  if (fromCore[0]) {
    console.log(
      `best sample: ${fromCore[0].supplierName} ${fromCore[0].brand} ${fromCore[0].article} ${fromCore[0].price} ${fromCore[0].currency}`
    );
  }

  if (exact.length < 1) {
    throw new Error(`${code}: no trusted priced offer from core suppliers`);
  }
  if (ms > 45000) {
    throw new Error(`${code}: too slow (${ms}ms)`);
  }
}

async function main() {
  let failed = 0;
  for (const code of CODES) {
    try {
      await smokeOne(code.trim());
      console.log(`PASS ${code}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${code}:`, e instanceof Error ? e.message : e);
    }
  }
  if (failed) {
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
