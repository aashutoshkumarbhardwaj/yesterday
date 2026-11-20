import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtPayload {
  sub: string;
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  avatarUrl?: string | undefined;
  provider: "phone" | "google";
  iat?: number | undefined;
  exp?: number | undefined;
  [key: string]: unknown;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function signJwt(payload: JwtPayload, secret: string, expiresInSeconds = 30 * 24 * 3600): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", secret).update(dataToSign).digest();
  const encodedSignature = signature
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${dataToSign}.${encodedSignature}`;
}

export function verifyJwt<T extends JwtPayload = JwtPayload>(token: string, secret: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

    // Verify signature
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = createHmac("sha256", secret).update(dataToSign).digest();
    let sigBase64 = encodedSignature.replace(/-/g, "+").replace(/_/g, "/");
    while (sigBase64.length % 4) sigBase64 += "=";
    const providedSig = Buffer.from(sigBase64, "base64");

    if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as T;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
