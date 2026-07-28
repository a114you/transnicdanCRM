/**
 * Decode Mercedes (etc.) elcats Codes.ashx Key → OEM article via OCR.
 *
 * Turbopack rewrites module paths to /ROOT/... — always pass absolute
 * workerPath/corePath from process.cwd().
 */

import path from "path";
import { createRequire } from "module";
import { pickBestOcrOem } from "@/lib/parts/oem-quality";

const ELCATS = "https://www.elcats.ru";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const require = createRequire(path.join(process.cwd(), "package.json"));

/** Success cache only — failures must be retryable */
const successCache = new Map<string, string>();

type TessWorker = {
  recognize: (img: Buffer | string) => Promise<{ data: { text: string } }>;
  setParameters: (p: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

let workerPromise: Promise<TessWorker> | null = null;
let workerBusy: Promise<void> = Promise.resolve();

function resolveTessPaths() {
  const root = process.cwd();
  const workerPath = path.join(
    root,
    "node_modules/tesseract.js/src/worker-script/node/index.js"
  );
  let corePath: string;
  try {
    corePath = require.resolve(
      "tesseract.js-core/tesseract-core-simd-lstm.wasm.js"
    );
  } catch {
    try {
      corePath = require.resolve("tesseract.js-core/tesseract-core.wasm.js");
    } catch {
      corePath = path.join(
        root,
        "node_modules/tesseract.js-core/tesseract-core.wasm.js"
      );
    }
  }
  return { workerPath, corePath };
}

async function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const { workerPath, corePath } = resolveTessPaths();
      const worker = (await createWorker("eng", 1, {
        workerPath,
        corePath,
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        cachePath: path.join(process.cwd(), ".cache/tesseract"),
        gzip: true,
      })) as unknown as TessWorker;
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

async function fetchCodePng(key: string): Promise<Buffer> {
  const url = `${ELCATS}/Codes.ashx?Key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: `${ELCATS}/mercedes/`,
      Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Codes.ashx HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 40) throw new Error("Codes.ashx empty image");
  return buf;
}

async function recognizePng(buf: Buffer): Promise<string | null> {
  let result: string | null = null;
  let err: unknown = null;
  workerBusy = workerBusy.then(async () => {
    try {
      const worker = await getWorker();
      // Pass 1: tight line mode + whitelist
      try {
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
          tessedit_pageseg_mode: "7",
        });
      } catch {
        /* optional */
      }
      const r1 = await worker.recognize(buf);
      result = pickBestOcrOem(r1.data.text || "");

      // Pass 2: freer if pass 1 weak/null
      if (!result) {
        try {
          await worker.setParameters({
            tessedit_char_whitelist: "",
            tessedit_pageseg_mode: "6",
          });
        } catch {
          /* optional */
        }
        const r2 = await worker.recognize(buf);
        result = pickBestOcrOem(r2.data.text || "");
      }
    } catch (e) {
      err = e;
      try {
        const w = await workerPromise;
        if (w) await w.terminate();
      } catch {
        /* ignore */
      }
      workerPromise = null;
    }
  });
  await workerBusy;
  if (err) throw err;
  return result;
}

export async function ocrElcatsCodeKey(keyRaw: string): Promise<string | null> {
  const key = (keyRaw || "").trim();
  if (!key || key.length < 4) return null;
  if (successCache.has(key)) return successCache.get(key)!;

  try {
    const buf = await fetchCodePng(key);
    const art = await recognizePng(buf);
    if (art) successCache.set(key, art);
    return art;
  } catch (e) {
    console.error("[elcats-code-ocr]", key.slice(0, 24), e);
    return null;
  }
}

export async function ocrElcatsCodeKeys(
  keys: string[],
  concurrency = 2
): Promise<Record<string, string | null>> {
  const uniq = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  const out: Record<string, string | null> = {};
  let i = 0;
  async function worker() {
    while (i < uniq.length) {
      const idx = i++;
      const k = uniq[idx]!;
      out[k] = await ocrElcatsCodeKey(k);
    }
  }
  const n = Math.min(concurrency, Math.max(1, uniq.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}
