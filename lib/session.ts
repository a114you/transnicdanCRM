import { supabase } from "./supabase";

export const SESSION_COOKIE = "crm-session";

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  exp: number;
  version: number;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "development-only-auth-secret-change-before-production";
  }
  throw new Error("AUTH_SECRET must be set to a private random value with at least 32 characters");
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(payload: SessionPayload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await getSigningKey(), new TextEncoder().encode(body));
  return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getSigningKey(),
      Uint8Array.from(base64UrlDecode(signature), (char) => char.charCodeAt(0)),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (
      !payload.userId ||
      !payload.username ||
      !payload.exp ||
      payload.version === undefined ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    // Verify token version and active status in database
    const { data: user, error } = await supabase
      .from("crm_users")
      .select("token_version, active")
      .eq("id", payload.userId)
      .single();

    if (error || !user || !user.active || user.token_version !== payload.version) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

