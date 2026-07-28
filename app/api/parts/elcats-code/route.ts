/**
 * OCR elcats Codes.ashx Key → OEM article.
 * Used by the embed iframe when Mercedes (etc.) hide part numbers as images.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ocrElcatsCodeKey,
  ocrElcatsCodeKeys,
} from "@/lib/parts/vehicle/elcats-code-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  let key = req.nextUrl.searchParams.get("key");
  if (!key?.trim()) {
    return NextResponse.json({ error: "key required", article: null }, { status: 400 });
  }
  // Browser may pass still-encoded fragments
  try {
    if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key);
  } catch {
    /* keep raw */
  }
  key = key.trim();
  try {
    const article = await ocrElcatsCodeKey(key);
    return NextResponse.json(
      { article, key, ok: !!article },
      {
        headers: {
          // only cache hits — misses must retry
          "Cache-Control": article
            ? "private, max-age=86400"
            : "private, no-store",
        },
      }
    );
  } catch (e) {
    console.error("[elcats-code GET]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "ocr failed",
        article: null,
        ok: false,
      },
      { status: 200 } // keep 200 so iframe always parses JSON
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keys?: string[] };
    const keys = Array.isArray(body.keys)
      ? body.keys
          .map((k) => {
            try {
              return decodeURIComponent(String(k || "").trim());
            } catch {
              return String(k || "").trim();
            }
          })
          .filter(Boolean)
          .slice(0, 30)
      : [];
    if (!keys.length) {
      return NextResponse.json({ error: "keys[] required", articles: {} }, { status: 400 });
    }
    const map = await ocrElcatsCodeKeys(keys, 2);
    return NextResponse.json({ articles: map });
  } catch (e) {
    console.error("[elcats-code POST]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "ocr failed",
        articles: {},
      },
      { status: 200 }
    );
  }
}
