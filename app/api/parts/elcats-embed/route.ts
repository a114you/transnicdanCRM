/**
 * Same-origin reverse proxy for elcats.ru EPC pages.
 * Used as iframe src so the full working catalog runs inside Montatorul.
 * OEM clicks are bridged via postMessage → client runs MD parts search.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ELCATS_ORIGIN,
  resolveElcatsTarget,
  rewriteElcatsHtml,
} from "@/lib/parts/vehicle/elcats-embed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** In-memory cookie jar (process-local) — enough for EPC session in dev/single-node */
const cookieJar = new Map<string, string>();

function jarKey(req: NextRequest): string {
  // Isolate by IP-ish header if present, else shared
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "default"
  );
}

function mergeSetCookie(key: string, res: Response) {
  const raw = res.headers.getSetCookie?.() || [];
  if (!raw.length) {
    const single = res.headers.get("set-cookie");
    if (single) raw.push(single);
  }
  if (!raw.length) return;
  const jar = new Map<string, string>();
  const prev = cookieJar.get(key) || "";
  for (const part of prev.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const sc of raw) {
    const pair = sc.split(";")[0];
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  cookieJar.set(
    key,
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  );
}

async function fetchElcats(
  target: URL,
  init: RequestInit & { jarKey: string }
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set("User-Agent", UA);
  headers.set(
    "Accept",
    headers.get("Accept") ||
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  );
  headers.set("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
  if (!headers.has("Referer")) headers.set("Referer", ELCATS_ORIGIN + "/");
  const cookie = cookieJar.get(init.jarKey);
  if (cookie) headers.set("Cookie", cookie);

  const res = await fetch(target.toString(), {
    method: init.method || "GET",
    headers,
    body: init.body,
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  mergeSetCookie(init.jarKey, res);

  // Follow redirects manually so we can rewrite Location into proxy
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = resolveElcatsTarget(new URL(loc, target).toString());
      if (next) {
        return fetchElcats(next, {
          ...init,
          method: res.status === 303 ? "GET" : init.method,
          body: res.status === 303 ? undefined : init.body,
        });
      }
    }
  }
  return res;
}

function isHtml(ct: string | null): boolean {
  return !ct || /text\/html|application\/xhtml/i.test(ct);
}

function appOriginFrom(req: NextRequest): string {
  // Prefer forwarded host in prod; fall back to nextUrl
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (xfHost) {
    const proto = xfProto || req.nextUrl.protocol.replace(":", "") || "http";
    return `${proto}://${xfHost}`.replace(/\/$/, "");
  }
  return req.nextUrl.origin;
}

/**
 * Resolve elcats target from ?url=, or recover when a GET form wiped url=
 * and left Model/Group/Title on our proxy (classic HTML form GET behavior).
 */
function resolveTargetFromRequest(req: NextRequest): URL | null {
  const raw = req.nextUrl.searchParams.get("url");
  const direct = resolveElcatsTarget(raw);
  if (direct) return direct;

  // Recovery path: no url=, but Model (and often Group) present
  const model = req.nextUrl.searchParams.get("Model");
  if (!model) return null;

  let basePath = "/mercedes/Group.aspx";
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const ref = new URL(referer);
      const refUrl = ref.searchParams.get("url");
      if (refUrl) {
        const refTarget = resolveElcatsTarget(refUrl);
        if (refTarget) {
          basePath = refTarget.pathname;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Group list → SubGroup when Group= is present (Mercedes/Kia elcats convention)
  const group = req.nextUrl.searchParams.get("Group");
  if (group && /Group\.aspx$/i.test(basePath) && !/SubGroup\.aspx$/i.test(basePath)) {
    basePath = basePath.replace(/Group\.aspx$/i, "SubGroup.aspx");
  }

  const rebuilt = new URL(basePath, ELCATS_ORIGIN);
  req.nextUrl.searchParams.forEach((value, key) => {
    if (key === "url") return;
    rebuilt.searchParams.set(key, value);
  });
  return resolveElcatsTarget(rebuilt.toString());
}

export async function GET(req: NextRequest) {
  const target = resolveTargetFromRequest(req);
  if (!target) {
    return NextResponse.json({ error: "Invalid elcats url" }, { status: 400 });
  }

  const appOrigin = appOriginFrom(req);

  try {
    const key = jarKey(req);
    const res = await fetchElcats(target, { method: "GET", jarKey: key });
    const ct = res.headers.get("content-type") || "text/html; charset=utf-8";
    const buf = Buffer.from(await res.arrayBuffer());

    if (!isHtml(ct)) {
      // binary / css already absolute in rewrite for most cases
      return new NextResponse(buf, {
        status: res.status,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    let html = buf.toString("utf8");
    // charset fix
    if (/charset=windows-1251/i.test(ct) || /charset=windows-1251/i.test(html.slice(0, 500))) {
      // most elcats pages are utf-8 despite meta; keep utf8
    }
    html = rewriteElcatsHtml(html, target, appOrigin);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        // allow iframe only from same site
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    console.error("[elcats-embed GET]", e);
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">
        <h2>Elcats proxy error</h2>
        <p>${e instanceof Error ? e.message : "fetch failed"}</p>
        <p><a href="${target.toString()}" target="_blank" rel="noopener" style="color:#5eb1ff">Open on elcats.ru</a></p>
      </body></html>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

export async function POST(req: NextRequest) {
  const target = resolveTargetFromRequest(req);
  if (!target) {
    return NextResponse.json({ error: "Invalid elcats url" }, { status: 400 });
  }

  const appOrigin = appOriginFrom(req);

  try {
    const key = jarKey(req);
    const ct = req.headers.get("content-type") || "application/x-www-form-urlencoded";
    const body = await req.arrayBuffer();

    const res = await fetchElcats(target, {
      method: "POST",
      jarKey: key,
      headers: {
        "Content-Type": ct,
        Origin: ELCATS_ORIGIN,
        Referer: target.toString(),
      },
      body: body.byteLength ? Buffer.from(body) : undefined,
    });

    const resCt = res.headers.get("content-type") || "text/html; charset=utf-8";
    const buf = Buffer.from(await res.arrayBuffer());

    if (!isHtml(resCt)) {
      return new NextResponse(buf, {
        status: res.status,
        headers: { "Content-Type": resCt },
      });
    }

    const finalUrl = resolveElcatsTarget(res.url) || target;
    const html = rewriteElcatsHtml(buf.toString("utf8"), finalUrl, appOrigin);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    console.error("[elcats-embed POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "POST failed" },
      { status: 502 }
    );
  }
}
