import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import {
  comparePartsForVehicle,
  vinCatalog,
  vinCategoryChildren,
  vinDecodeAndModels,
} from "@/lib/parts/vehicle/vin-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * GET /api/parts/vin?vin=XXX
 *   → decode + list modifications
 *
 * GET /api/parts/vin?action=catalog&path=/products_by_car/dacia/logan-ls-19773/
 *   → service groups + root nodes
 *
 * GET /api/parts/vin?action=children&path=...&categoryId=477
 *   → subcategories
 *
 * GET /api/parts/vin?action=compare&path=...&partType=filter-oil
 *   → multi-supplier compare for this car + part
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const sp = request.nextUrl.searchParams;
  const action = sp.get("action") || "decode";

  try {
    if (action === "decode" || action === "models") {
      const vin = sp.get("vin") || "";
      if (vin.trim().length < 11) {
        return NextResponse.json({ error: "Введите VIN (17 символов)" }, { status: 400 });
      }
      const data = await vinDecodeAndModels(vin);
      return NextResponse.json(data);
    }

    // Manual brand catalog: /api/parts/vin?action=brand&make=KIA&model=ceed
    if (action === "brand") {
      const make = sp.get("make") || "";
      if (!make) {
        return NextResponse.json({ error: "Укажите make" }, { status: 400 });
      }
      const { listModifications } = await import("@/lib/parts/vehicle/enorm-car");
      const modifications = await listModifications(make, sp.get("model") || "", sp.get("year") || undefined);
      return NextResponse.json({
        vehicle: {
          vin: "",
          valid: true,
          make: make.toUpperCase(),
          model: sp.get("model") || undefined,
          modelYear: sp.get("year") || undefined,
          brandSlug: (await import("@/lib/parts/vehicle/tecdoc-groups")).makeToEnormSlug(make),
        },
        modifications,
        tookMs: 0,
      });
    }

    if (action === "catalog") {
      const path = sp.get("path") || "";
      const oemCatalog = sp.get("oemCatalog") || sp.get("oem") || "";
      // Allow OEM-only catalog (no ENORM path) when we have catcar URL
      if (!path.includes("products_by_car") && !oemCatalog) {
        return NextResponse.json(
          { error: "Укажите path модификации или oemCatalog" },
          { status: 400 }
        );
      }
      const data = await vinCatalog(path, sp.get("name") || undefined, {
        oemCatalogUrl: oemCatalog || undefined,
      });
      return NextResponse.json(data);
    }

    if (action === "children") {
      const path = sp.get("path") || "";
      const categoryId = Number(sp.get("categoryId"));
      if (!path || !categoryId) {
        return NextResponse.json({ error: "path и categoryId обязательны" }, { status: 400 });
      }
      const children = await vinCategoryChildren(path, categoryId);
      return NextResponse.json({ children });
    }

    if (action === "compare") {
      const path = sp.get("path") || "";
      const partType = sp.get("partType") || "";
      const oemCatalog = sp.get("oemCatalog") || sp.get("oem") || "";
      if (!partType) {
        return NextResponse.json({ error: "partType обязателен" }, { status: 400 });
      }
      // Unified path: OEM catcar (+ optional ENORM path) → articles → MD prices
      const data = await comparePartsForVehicle(path, partType, {
        vehicleName: sp.get("name") || undefined,
        oemCatalogUrl: oemCatalog || undefined,
      });
      return NextResponse.json(data);
    }

    // Direct OEM article lookup: /api/parts/vin?action=oem-parts&oemCatalog=...&partType=brake-pads
    if (action === "oem-parts") {
      const oemCatalog = sp.get("oemCatalog") || sp.get("oem") || "";
      const partType = sp.get("partType") || "";
      if (!oemCatalog || !partType) {
        return NextResponse.json(
          { error: "oemCatalog и partType обязательны" },
          { status: 400 }
        );
      }
      if (oemCatalog.includes("elcats.ru")) {
        const { findElcatsOemPartsForPartType } = await import(
          "@/lib/parts/vehicle/elcats-oem"
        );
        const data = await findElcatsOemPartsForPartType(oemCatalog, partType);
        return NextResponse.json(data);
      }
      const { findOemPartsForPartType } = await import("@/lib/parts/vehicle/catcar-oem-parts");
      const data = await findOemPartsForPartType(oemCatalog, partType);
      return NextResponse.json(data);
    }

    // EPC unit parts: /api/parts/vin?action=epc-unit&oemCatalog=...&groupId=50-517&title=...
    if (action === "epc-unit") {
      const oemCatalog = sp.get("oemCatalog") || sp.get("oem") || "";
      const groupId = sp.get("groupId") || "";
      const title = sp.get("title") || "";
      if (!oemCatalog || !groupId || !title) {
        return NextResponse.json(
          { error: "oemCatalog, groupId и title обязательны" },
          { status: 400 }
        );
      }
      if (!oemCatalog.includes("elcats.ru")) {
        return NextResponse.json(
          { error: "Интерактивный EPC сейчас доступен для elcats-каталогов" },
          { status: 400 }
        );
      }
      const { loadElcatsUnitParts } = await import("@/lib/parts/vehicle/elcats-oem");
      let navNode: { id: string; title: string; action: string; fields: Record<string, string> } | undefined;
      const navRaw = sp.get("navNode");
      if (navRaw) {
        try {
          navNode = JSON.parse(navRaw) as typeof navNode;
        } catch {
          /* ignore */
        }
      }
      // Child scheme may pass its own navNode (full elcats path)
      let schemeNav = navNode;
      const childNavRaw = sp.get("childNavNode") || sp.get("schemeNav");
      if (childNavRaw) {
        try {
          schemeNav = JSON.parse(childNavRaw) as typeof navNode;
        } catch {
          /* keep parent nav */
        }
      }
      const data = await loadElcatsUnitParts({
        groupUrl: oemCatalog,
        groupId,
        title: sp.get("schemeTitle") || title,
        unitGuid: sp.get("unitGuid") || undefined,
        navNode: schemeNav || navNode,
        filter: sp.get("filter") || undefined,
        maxExpand: Number(sp.get("maxExpand") || 80) || 80,
        expand: sp.get("expand") !== "0",
        // Default: do NOT merge all schemes — mirror elcats (pick scheme first)
        allVariants: sp.get("allVariants") === "1",
      });
      return NextResponse.json(data);
    }

    // EPC search: /api/parts/vin?action=epc-search&oemCatalog=...&q=колод
    if (action === "epc-search") {
      const oemCatalog = sp.get("oemCatalog") || sp.get("oem") || "";
      const q = sp.get("q") || sp.get("query") || "";
      if (!oemCatalog || q.trim().length < 2) {
        return NextResponse.json(
          { error: "oemCatalog и q (мин. 2 символа) обязательны" },
          { status: 400 }
        );
      }
      if (!oemCatalog.includes("elcats.ru")) {
        return NextResponse.json(
          { error: "Поиск EPC доступен для elcats-каталогов" },
          { status: 400 }
        );
      }
      const { searchElcatsParts } = await import("@/lib/parts/vehicle/elcats-oem");
      const data = await searchElcatsParts({
        groupUrl: oemCatalog,
        query: q,
        rootId: sp.get("rootId") || undefined,
        maxUnits: Number(sp.get("maxUnits") || 6) || 6,
        maxExpandPerUnit: Number(sp.get("maxExpand") || 40) || 40,
      });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[parts/vin]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка VIN" },
      { status: 500 }
    );
  }
}
