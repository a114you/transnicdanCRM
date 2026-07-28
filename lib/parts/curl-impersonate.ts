/**
 * Free request-level browser TLS impersonation via curl-impersonate binary.
 * https://github.com/lexiforest/curl-impersonate
 *
 * Fast HTTP (no Playwright). Place binaries in:
 *   bin/curl-impersonate/curl_chrome131
 * or set CURL_IMPERSONATE_BIN=/path/to/curl_chrome131
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();

const CANDIDATES = [
  process.env.CURL_IMPERSONATE_BIN?.trim(),
  path.join(ROOT, "bin/curl-impersonate/curl_chrome131"),
  path.join(ROOT, "bin/curl-impersonate/curl_chrome146"),
  path.join(ROOT, "bin/curl-impersonate/curl_chrome136"),
  "/usr/local/bin/curl_chrome131",
  "/opt/homebrew/bin/curl_chrome131",
].filter(Boolean) as string[];

let resolvedBin: string | null | undefined;

export function findCurlImpersonate(): string | null {
  if (resolvedBin !== undefined) return resolvedBin;
  for (const p of CANDIDATES) {
    if (p && existsSync(p)) {
      resolvedBin = p;
      return p;
    }
  }
  resolvedBin = null;
  return null;
}

export function hasCurlImpersonate(): boolean {
  return Boolean(findCurlImpersonate());
}

export interface ImpersonateFetchOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  cookies?: string;
  timeoutMs?: number;
  proxy?: string;
  /** When false, do not follow redirects (needed for login 302 + Set-Cookie). Default true. */
  followRedirects?: boolean;
}

export interface ImpersonateFetchResult {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  strategy: string;
  /** Raw Set-Cookie header values from response (all hops when -D dumps chain). */
  setCookie?: string[];
}

function parseSetCookieFromHeaderDump(hdrDump: string): string[] {
  const out: string[] = [];
  // -D dumps every hop separated by blank lines; collect all Set-Cookie
  for (const line of hdrDump.split(/\r?\n/)) {
    const m = line.match(/^set-cookie:\s*(.+)$/i);
    if (m?.[1]) out.push(m[1].trim());
  }
  return out;
}

/**
 * Fast GET/POST with Chrome TLS/HTTP2 fingerprint (request-only).
 * Captures Set-Cookie via -D so Laravel/session auth works across requests.
 */
export function curlImpersonateFetch(
  opts: ImpersonateFetchOptions
): Promise<ImpersonateFetchResult> {
  const bin = findCurlImpersonate();
  if (!bin) {
    return Promise.resolve({
      ok: false,
      status: 0,
      text: "curl-impersonate binary not found",
      finalUrl: opts.url,
      strategy: "curl-impersonate-missing",
    });
  }

  const timeoutMs = opts.timeoutMs ?? 18000;
  const follow = opts.followRedirects !== false;
  let tmpDir: string | null = null;

  try {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ci-parts-"));
  } catch {
    tmpDir = null;
  }
  const hdrFile = tmpDir ? path.join(tmpDir, "headers.txt") : "";
  if (hdrFile) {
    try {
      writeFileSync(hdrFile, "");
    } catch {
      /* ignore */
    }
  }

  const args: string[] = [
    "-sS",
    ...(follow ? ["-L"] : []),
    "--max-time",
    String(Math.ceil(timeoutMs / 1000)),
    "-w",
    "\n__CI_STATUS__:%{http_code}\n__CI_URL__:%{url_effective}\n",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",
    "Accept-Language: ru-RU,ru;q=0.9,ro;q=0.8,en;q=0.7",
  ];

  if (hdrFile) {
    args.push("-D", hdrFile);
  }

  if (opts.method === "POST") {
    args.push("-X", "POST");
    if (opts.body) args.push("--data-binary", opts.body);
  }

  if (opts.cookies) args.push("-H", `Cookie: ${opts.cookies}`);
  if (opts.proxy) args.push("-x", opts.proxy);

  for (const [k, v] of Object.entries(opts.headers || {})) {
    if (/^(cookie|accept-encoding)$/i.test(k)) continue;
    args.push("-H", `${k}: ${v}`);
  }

  args.push(opts.url);

  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs + 2000);

    child.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (tmpDir) {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      resolve({
        ok: false,
        status: 0,
        text: err.message,
        finalUrl: opts.url,
        strategy: "curl-impersonate-error",
      });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const statusM = raw.match(/__CI_STATUS__:(\d+)/);
      const urlM = raw.match(/__CI_URL__:(.+)/);
      const status = statusM ? Number(statusM[1]) : 0;
      const finalUrl = urlM?.[1]?.trim() || opts.url;
      const text = raw
        .replace(/\n__CI_STATUS__:\d+\n?/g, "\n")
        .replace(/\n__CI_URL__:.+\n?/g, "\n")
        .replace(/__CI_STATUS__:\d+/g, "")
        .replace(/__CI_URL__:.+/g, "");

      let setCookie: string[] = [];
      if (hdrFile) {
        try {
          const hdrDump = readFileSync(hdrFile, "utf8");
          setCookie = parseSetCookieFromHeaderDump(hdrDump);
        } catch {
          setCookie = [];
        }
      }
      if (tmpDir) {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }

      // Reject Incapsula/CF interstitial even if HTTP 200
      const blockedBody =
        text.length < 2000 &&
        /incapsula|_Incapsula_Resource|Request unsuccessful|Just a moment|cf-browser-verification/i.test(
          text
        );
      // 3xx without follow still "ok" for callers that handle redirects (login)
      const okStatus =
        (status >= 200 && status < 300) ||
        (!follow && status >= 300 && status < 400);
      const ok =
        okStatus &&
        !blockedBody &&
        (status >= 300 && status < 400 ? true : text.length > 200);
      resolve({
        ok,
        status: blockedBody && status === 200 ? 403 : status,
        text: text || stderr,
        finalUrl,
        strategy: `curl-impersonate:${path.basename(bin)}`,
        setCookie: setCookie.length ? setCookie : undefined,
      });
    });
  });
}
