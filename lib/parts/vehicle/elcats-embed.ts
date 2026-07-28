/**
 * Elcats embed rewrite: serve elcats HTML through our origin so navigation
 * works inside the app, inject Montatorul modern UI + OEM click bridge.
 *
 * NEVER inject <base href="https://www.elcats.ru/..."> — it rewrites absolute
 * paths like /api/parts/elcats-embed to www.elcats.ru/api/parts/... (404).
 *
 * Relative elcats paths (Parts.aspx) are rewritten server-side and forced in JS
 * using the elcats PAGE URL as base (not window.location).
 */

import {
  buildElcatsUiCss,
  buildElcatsUiScript,
} from "@/lib/parts/vehicle/elcats-embed-ui";

export const ELCATS_ORIGIN = "https://www.elcats.ru";

const ALLOWED_HOSTS = new Set(["www.elcats.ru", "elcats.ru"]);

/** Decode HTML entities that leak into URLs (&amp; → & breaks Parts.aspx query). */
export function decodeHtmlEntities(s: string): string {
  let out = s;
  // multi-pass for double-encoded &amp;amp;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      );
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Only allow proxying elcats.ru paths */
export function resolveElcatsTarget(raw: string | null | undefined): URL | null {
  if (!raw?.trim()) return null;
  try {
    let s = decodeHtmlEntities(raw.trim()).replace(/&amp;/gi, "&");
    // fix accidental double host
    s = s.replace(
      /^https:\/\/www\.elcats\.ruhttps:\/\/www\.elcats\.ru/i,
      "https://www.elcats.ru"
    );
    // decodeURIComponent once if still percent-encoded &amp;
    if (/%26amp%3B|%26/i.test(s) && s.includes("elcats.ru")) {
      try {
        const once = decodeURIComponent(s);
        if (once.includes("elcats.ru") || once.startsWith("/")) s = once;
      } catch {
        /* keep */
      }
      s = decodeHtmlEntities(s).replace(/&amp;/gi, "&");
    }
    let u: URL;
    if (s.startsWith("/")) {
      u = new URL(s, ELCATS_ORIGIN);
    } else if (/^https?:\/\//i.test(s)) {
      u = new URL(s);
    } else {
      u = new URL(s.replace(/^\.\//, ""), ELCATS_ORIGIN + "/");
    }
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
    u.hostname = "www.elcats.ru";
    u.protocol = "https:";
    // Final amp cleanup in href
    if (u.href.includes("&amp;")) {
      u = new URL(u.href.replace(/&amp;/gi, "&"));
    }
    return u;
  } catch {
    return null;
  }
}

/**
 * Build proxy href. Prefer absolute app origin so a leftover <base href=elcats>
 * cannot resolve /api/... onto www.elcats.ru.
 */
export function proxyPathFor(elcatsUrl: string, appOrigin?: string): string {
  const clean = decodeHtmlEntities(elcatsUrl).replace(/&amp;/gi, "&");
  const path = "/api/parts/elcats-embed?url=" + encodeURIComponent(clean);
  if (appOrigin) {
    return appOrigin.replace(/\/$/, "") + path;
  }
  return path;
}

function isElcatsStaticAsset(pathname: string): boolean {
  return (
    /\.(css|js|png|jpe?g|gif|ico|woff2?|ttf|svg|map)(\?|$)/i.test(pathname) ||
    /WebResource\.axd|ScriptResource\.axd|CImage\.ashx|Codes\.ashx|ImageHandler\.ashx/i.test(
      pathname
    ) ||
    /^\/(js|style|img|CImages|Images|CImage)\//i.test(pathname) ||
    /ImageHandler\.ashx/i.test(pathname)
  );
}

function rewriteUrlAttr(
  value: string,
  pageUrl: URL,
  appOrigin?: string
): string {
  let v = decodeHtmlEntities(value.trim());
  if (
    !v ||
    v.startsWith("data:") ||
    v.startsWith("javascript:") ||
    v.startsWith("#") ||
    v.startsWith("mailto:")
  ) {
    return value.startsWith("javascript:") ? value : v || value;
  }
  if (/googlesyndication|google-analytics|yandex|liveinternet|doubleclick|pagead/i.test(v)) {
    return value;
  }
  // Already our proxy (path or full)
  if (v.includes("/api/parts/elcats-embed")) {
    // Broken absolute on elcats host — rebuild on our origin
    if (/^https?:\/\/(www\.)?elcats\.ru\/api\/parts\/elcats-embed/i.test(v)) {
      try {
        const broken = new URL(v);
        const inn = broken.searchParams.get("url");
        if (inn) return proxyPathFor(decodeHtmlEntities(inn), appOrigin);
        const next = new URL(pageUrl.toString());
        broken.searchParams.forEach((val, key) => {
          if (key !== "url") next.searchParams.set(key, val);
        });
        return proxyPathFor(next.toString(), appOrigin);
      } catch {
        return proxyPathFor(pageUrl.toString(), appOrigin);
      }
    }
    // Re-encode url= param if it contains literal &amp;
    try {
      const pu = new URL(v, appOrigin || "http://localhost");
      const inn = pu.searchParams.get("url");
      if (inn && /&amp;|&amp%3B|%26amp/i.test(inn + v)) {
        return proxyPathFor(decodeHtmlEntities(inn), appOrigin);
      }
    } catch {
      /* keep */
    }
    if (appOrigin && v.startsWith("/")) {
      return appOrigin.replace(/\/$/, "") + v;
    }
    return v;
  }

  try {
    const abs = new URL(v, pageUrl);
    if (ALLOWED_HOSTS.has(abs.hostname.toLowerCase())) {
      abs.hostname = "www.elcats.ru";
      abs.protocol = "https:";
      // Static assets — always absolute on elcats (never our /api/...)
      if (isElcatsStaticAsset(abs.pathname)) {
        return abs.toString();
      }
      return proxyPathFor(abs.toString(), appOrigin);
    }
    return v;
  } catch {
    return value;
  }
}

/** Rewrite opening-tag attrs on script/link/style; leave script bodies alone. */
function rewriteTagOpenAttrs(
  openTag: string,
  pageUrl: URL,
  appOrigin?: string
): string {
  let tag = openTag.replace(
    /\b(href|src)=(["'])([^"']*)\2/gi,
    (_m, attr: string, q: string, val: string) => {
      const next = rewriteUrlAttr(val, pageUrl, appOrigin);
      return attr + "=" + q + next + q;
    }
  );
  // unquoted src=/js/jquery.js
  tag = tag.replace(
    /\b(href|src)=(?!["'])([^\s>]+)/gi,
    (_m, attr: string, val: string) => {
      const next = rewriteUrlAttr(val, pageUrl, appOrigin);
      return attr + '="' + next.replace(/"/g, "&quot;") + '"';
    }
  );
  return tag;
}

/** Rewrite URLs outside script/style bodies (bodies break if rewritten). */
function mapHtmlOutsideScripts(
  html: string,
  mapChunk: (chunk: string) => string,
  pageUrl: URL,
  appOrigin?: string
): string {
  const parts: string[] = [];
  const re =
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)|(<link\b[^>]*>)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) parts.push(mapChunk(html.slice(last, m.index)));
    if (m[1] != null) {
      // <script ...>body</script>
      parts.push(rewriteTagOpenAttrs(m[1], pageUrl, appOrigin) + m[2] + m[3]);
    } else if (m[4] != null) {
      parts.push(rewriteTagOpenAttrs(m[4], pageUrl, appOrigin) + m[5] + m[6]);
    } else if (m[7] != null) {
      parts.push(rewriteTagOpenAttrs(m[7], pageUrl, appOrigin));
    }
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push(mapChunk(html.slice(last)));
  return parts.join("");
}

function rewriteHtmlChunk(
  chunk: string,
  pageUrl: URL,
  appOrigin?: string
): string {
  let out = chunk;

  out = out.replace(
    /\b(href|src|action)=(["'])([^"']+)\2/gi,
    (_m, attr: string, q: string, val: string) => {
      const next = rewriteUrlAttr(val, pageUrl, appOrigin);
      return attr + "=" + q + next + q;
    }
  );

  // Unquoted (elcats: src=../Codes.ashx?Key=xxx)
  out = out.replace(
    /\b(href|src|action)=(?!["'])([^\s>]+)/gi,
    (_m, attr: string, val: string) => {
      const next = rewriteUrlAttr(val, pageUrl, appOrigin);
      return attr + '="' + next.replace(/"/g, "&quot;") + '"';
    }
  );

  out = out.replace(/url\((['"]?)([^)'"]+)\1\)/gi, (_m, q: string, val: string) => {
    if (val.startsWith("data:")) return "url(" + q + val + q + ")";
    const next = rewriteUrlAttr(val, pageUrl, appOrigin);
    return "url(" + q + next + q + ")";
  });

  out = out.replace(
    /(?:\.\.\/|\.\/)(?:[A-Za-z0-9_-]+\/)*Codes\.ashx\?Key=([^"'&\s>]+)/gi,
    (_m, key: string) => "https://www.elcats.ru/Codes.ashx?Key=" + key
  );
  out = out.replace(
    /(?:\.\.\/|\.\/)CImage\.ashx\?Path=([^"'&\s>]+)/gi,
    (_m, p: string) => "https://www.elcats.ru/CImage.ashx?Path=" + p
  );

  return out;
}

/** Rewrite .aspx actions + static asset strings inside elcats scripts (load.gif etc.). */
function rewriteScriptAspxActions(
  html: string,
  pageUrl: URL,
  appOrigin?: string
): string {
  return html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_m, open: string, body: string, close: string) => {
      // Skip third-party / analytics (often truncated / minified junk)
      if (
        /mc\.yandex|google-analytics|gtag|googletag|metrika|adsbygoogle|facebook/i.test(
          body
        ) ||
        /mc\.yandex|google-analytics|googletag|pagead/i.test(open)
      ) {
        return open + "/* stripped third-party */" + close;
      }
      let next = body.replace(
        /\.action\s*=\s*(["'])([^"']+\.aspx[^"']*)\1/gi,
        (_mm, q: string, val: string) => {
          const rewritten = rewriteUrlAttr(val, pageUrl, appOrigin);
          return ".action = " + q + rewritten + q;
        }
      );
      // open() injects ../CImages/load.gif — force absolute elcats
      next = next
        .replace(
          /(['"])\.\.\/CImages\//gi,
          "$1https://www.elcats.ru/CImages/"
        )
        .replace(
          /(['"])\.\/CImages\//gi,
          "$1https://www.elcats.ru/CImages/"
        )
        .replace(
          /(['"])\/CImages\//gi,
          "$1https://www.elcats.ru/CImages/"
        )
        .replace(
          /(['"])\.\.\/Images\//gi,
          "$1https://www.elcats.ru/Images/"
        )
        .replace(
          /(['"])\/Images\//gi,
          "$1https://www.elcats.ru/Images/"
        )
        .replace(/(['"])\/js\//gi, "$1https://www.elcats.ru/js/")
        .replace(/(['"])\/style\//gi, "$1https://www.elcats.ru/style/")
        .replace(
          /(['"])\/WebResource\.axd/gi,
          "$1https://www.elcats.ru/WebResource.axd"
        )
        // HTML entities in form action strings inside JS
        .replace(/&amp;/gi, "&");
      return open + next + close;
    }
  );
}

/** Rewrite href/src/action in HTML to stay inside our proxy for navigation pages */
export function rewriteElcatsHtml(
  html: string,
  pageUrl: URL,
  appOrigin?: string
): string {
  let out = html;

  // Remove any base tags (ours or theirs) — they break /api proxy paths
  out = out.replace(/<base\b[^>]*>/gi, "");
  // Drop auto-refresh meta that kicks users out of the embed
  out = out.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, "");
  // Drop external ad/analytics script tags (src) that spam console / break layout
  out = out.replace(
    /<script\b[^>]*\bsrc=["'][^"']*(?:googlesyndication|google-analytics|yandex|mc\.yandex|pagead|doubleclick)[^"']*["'][^>]*>\s*<\/script>/gi,
    ""
  );

  out = mapHtmlOutsideScripts(
    out,
    (chunk) => rewriteHtmlChunk(chunk, pageUrl, appOrigin),
    pageUrl,
    appOrigin
  );
  out = rewriteScriptAspxActions(out, pageUrl, appOrigin);

  const inject = buildInjectSnippet(pageUrl);
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, inject + "</head>");
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (h) => h + inject);
  } else {
    out = inject + out;
  }

  return out;
}

function buildInjectSnippet(pageUrl: URL): string {
  const page = JSON.stringify(pageUrl.toString());
  const origin = JSON.stringify(ELCATS_ORIGIN);
  const dir = JSON.stringify(
    pageUrl.origin + pageUrl.pathname.replace(/\/[^/]*$/, "/")
  );
  return buildElcatsUiCss() + "\n" + buildElcatsUiScript(page, origin, dir);
}
