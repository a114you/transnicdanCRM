import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

type SharryAuthResult = {
  success: boolean;
  message?: string;
  token?: string;
};

type SharryIdResult = {
  success: boolean;
  message?: string;
  id?: string;
};

type SharryShareDetail = {
  publishInfo?: {
    id?: string;
    enabled?: boolean;
  };
  files?: Array<{
    id?: string;
  }>;
};

export type SharryUploadInput = {
  filename: string;
  pdf: ArrayBuffer;
  title: string;
  description?: string;
  publicBaseUrl?: string;
};

type SharryLinkStore = Record<string, string>;

const linkStorePath = join(process.cwd(), ".local", "sharry-links.json");

function getSharryConfig() {
  const baseUrl = process.env.SHARRY_BASE_URL?.replace(/\/+$/, "");
  const account = process.env.SHARRY_ACCOUNT;
  const password = process.env.SHARRY_PASSWORD;

  if (!baseUrl || !account || !password) return null;

  return {
    baseUrl,
    account,
    password,
    validityMs: Number(process.env.SHARRY_SHARE_VALIDITY_DAYS || 30) * 24 * 60 * 60 * 1000,
    maxViews: Number(process.env.SHARRY_SHARE_MAX_VIEWS || 20),
    sharePassword: process.env.SHARRY_SHARE_PASSWORD || "",
  };
}

async function sharryJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(`Sharry request failed: ${response.status}`);
  }
  return payload as T;
}

async function login(baseUrl: string, account: string, password: string) {
  const result = await sharryJson<SharryAuthResult>(`${baseUrl}/api/v2/open/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  });

  if (!result.success || !result.token) {
    throw new Error(result.message || "Sharry login failed");
  }

  return result.token;
}

function buildPublicFileUrl(baseUrl: string, publishId: string, fileId: string) {
  return `${baseUrl}/api/v2/open/share/${encodeURIComponent(publishId)}/file/${encodeURIComponent(fileId)}`;
}

function readLinkStore(): SharryLinkStore {
  if (!existsSync(linkStorePath)) return {};
  try {
    return JSON.parse(readFileSync(linkStorePath, "utf8")) as SharryLinkStore;
  } catch {
    return {};
  }
}

function writeLinkStore(store: SharryLinkStore) {
  mkdirSync(dirname(linkStorePath), { recursive: true });
  writeFileSync(linkStorePath, JSON.stringify(store, null, 2));
}

function createShortPublicUrl(publicBaseUrl: string, targetUrl: string) {
  const store = readLinkStore();
  let token = randomBytes(6).toString("base64url");
  while (store[token]) token = randomBytes(6).toString("base64url");
  store[token] = targetUrl;
  writeLinkStore(store);
  return `${publicBaseUrl.replace(/\/+$/, "")}/s/${token}`;
}

export function getSharryShortLinkTarget(token: string): string | null {
  return readLinkStore()[token] || null;
}

export async function uploadActToSharry(input: SharryUploadInput): Promise<string | null> {
  const config = getSharryConfig();
  if (!config) return null;

  try {
    const token = await login(config.baseUrl, config.account, config.password);
    const form = new FormData();
    form.append(
      "meta",
      new Blob(
        [
          JSON.stringify({
            name: input.title,
            description: input.description || "",
            validity: config.validityMs,
            maxViews: config.maxViews,
            ...(config.sharePassword ? { password: config.sharePassword } : {}),
          }),
        ],
        { type: "application/json" }
      )
    );
    form.append("file", new Blob([input.pdf], { type: "application/pdf" }), input.filename);

    const upload = await sharryJson<SharryIdResult>(`${config.baseUrl}/api/v2/sec/upload`, {
      method: "POST",
      headers: { "Sharry-Auth": token },
      body: form,
    });

    if (!upload.success || !upload.id) {
      throw new Error(upload.message || "Sharry upload failed");
    }

    const publish = await sharryJson<SharryIdResult>(
      `${config.baseUrl}/api/v2/sec/share/${encodeURIComponent(upload.id)}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Sharry-Auth": token,
        },
        body: JSON.stringify({ reuseId: false }),
      }
    );

    if (!publish.success) {
      throw new Error(publish.message || "Sharry publish failed");
    }

    const detail = await sharryJson<SharryShareDetail>(
      `${config.baseUrl}/api/v2/sec/share/${encodeURIComponent(upload.id)}`,
      {
        method: "GET",
        headers: { "Sharry-Auth": token },
      }
    );
    const publishId = detail.publishInfo?.enabled ? detail.publishInfo.id : null;
    const fileId = detail.files?.[0]?.id;
    if (!publishId || !fileId) return null;

    const publicFileUrl = buildPublicFileUrl(config.baseUrl, publishId, fileId);
    return input.publicBaseUrl ? createShortPublicUrl(input.publicBaseUrl, publicFileUrl) : publicFileUrl;
  } catch (error) {
    console.error("[sharry] failed to upload act:", error);
    return null;
  }
}
