import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { CATEGORY_GROUPS, UNIFIED_CATEGORIES, VEHICLE_MARKS } from "@/lib/parts/categories";
import { enabledSuppliers, SUPPLIER_CATALOG } from "@/lib/parts/suppliers";
import {
  authRequiredSuppliers,
  categoryLinksFor,
  CORE_ARTICLE_SUPPLIERS,
  SECONDARY_ARTICLE_SUPPLIERS,
} from "@/lib/parts/suppliers/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const scrapable = enabledSuppliers();

  const categories = UNIFIED_CATEGORIES.map((c) => ({
    id: c.id,
    nameRu: c.nameRu,
    nameRo: c.nameRo,
    group: c.group,
    searchHints: c.searchHints,
    supplierLinks: categoryLinksFor(c.id),
  }));

  const allSuppliers = SUPPLIER_CATALOG.map((s) => {
    const hasWebsite = Boolean(s.website?.trim());
    const online = s.scrape !== "none";
    // online = auto price search; website = has public site but no scrape; offline = no public catalog
    const status: "online" | "website" | "offline" = online
      ? "online"
      : hasWebsite
        ? "website"
        : "offline";
    return {
      id: s.id,
      name: s.name,
      website: s.website || null,
      city: s.city || null,
      scrape: s.scrape,
      online,
      hasWebsite,
      status,
      notes: s.notes || null,
      phone: s.phone || null,
      priority: s.priority ?? 99,
      authRequired: Boolean(s.authRequired),
      loginUrl: s.loginUrl || null,
      authNotes: s.authNotes || null,
    };
  });

  const needsLogin = authRequiredSuppliers();

  return NextResponse.json({
    suppliers: scrapable,
    allSuppliers,
    /** Register here and send login/password for adapter unlock */
    needsLogin,
    searchTiers: {
      core: CORE_ARTICLE_SUPPLIERS,
      secondary: SECONDARY_ARTICLE_SUPPLIERS,
    },
    analogExpand: process.env.PARTS_ANALOG_EXPAND !== "0",
    categories,
    categoryGroups: CATEGORY_GROUPS,
    vehicleMarks: VEHICLE_MARKS,
    automallBase: process.env.AUTOMALL_BASE_URL || "https://automall.md",
    hasAutomallCookie: Boolean(process.env.AUTOMALL_COOKIE?.trim()),
    hasUnlock: Boolean(
      process.env.PARTS_UNLOCK_URL?.trim() ||
        process.env.SCRAPINGBEE_API_KEY?.trim() ||
        process.env.FLARESOLVERR_URL?.trim()
    ),
    hasProxy: (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { hasConfiguredProxy } = require("@/lib/parts/http") as {
          hasConfiguredProxy: () => boolean;
        };
        return hasConfiguredProxy();
      } catch {
        return false;
      }
    })(),
    freeProxy: (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { freeProxyStatus, warmFreeProxyPool } = require("@/lib/parts/http") as {
          freeProxyStatus: () => {
            enabled: boolean;
            count: number;
            dead: number;
            ageMs: number;
          };
          warmFreeProxyPool: () => void;
        };
        warmFreeProxyPool();
        return freeProxyStatus();
      } catch {
        return { enabled: false, count: 0, dead: 0, ageMs: -1 };
      }
    })(),
    ipRotate: (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ipRotateStatus, warmIpRotate } = require("@/lib/parts/http") as {
          ipRotateStatus: () => {
            rotate: boolean;
            pool: number;
            dead: number;
            last: string | null;
            ageMs: number;
          };
          warmIpRotate: () => void;
        };
        warmIpRotate();
        return ipRotateStatus();
      } catch {
        return { rotate: false, pool: 0, dead: 0, last: null, ageMs: -1 };
      }
    })(),
    totals: {
      catalog: SUPPLIER_CATALOG.length,
      scrapable: scrapable.length,
      websiteOnly: allSuppliers.filter((s) => s.status === "website").length,
      offline: allSuppliers.filter((s) => s.status === "offline").length,
      needsLogin: needsLogin.length,
    },
  });
}
