import { createHmac } from "crypto";

/**
 * Generates a stateless, secure 16-character share token for a given order ID.
 * Uses AUTH_SECRET as the HMAC signing key.
 */
export function generateOrderShareToken(orderId: string): string {
  const secret = process.env.AUTH_SECRET || "default-secret-change-me";
  return createHmac("sha256", secret).update(orderId).digest("hex").slice(0, 16);
}

/**
 * Verifies if a given share token is valid for a specific order ID.
 */
export function verifyOrderShareToken(orderId: string, token: string): boolean {
  if (!orderId || !token) return false;
  return generateOrderShareToken(orderId) === token;
}
