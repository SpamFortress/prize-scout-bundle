import { OWNER_BROWSER_ID } from "./user-scope";

export const BROWSER_COOKIE = "ps_id";
const ID_RE = /^[a-f0-9]{32}$/;

/** Later Google sign-in can attach a subject to the same browser id. It is not built. */
export interface GoogleAccountHook {
  provider: "google";
  subject: string;
  browserId: string;
}

export function googleSignInHook(): GoogleAccountHook | null {
  return null;
}

export function cookieSecret(): string {
  const fromEnv = process.env.PRIZE_SCOUT_COOKIE_SECRET?.trim() ?? "";
  if (fromEnv) return fromEnv;
  if (process.env.PRIZE_SCOUT_STORE === "d1") return "";
  return "mac-local-cookie-key";
}

export function newBrowserId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(id: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sealBrowserId(id: string, secret = cookieSecret()): Promise<string> {
  if (!secret || !ID_RE.test(id)) throw new Error("Browser id cannot be signed.");
  return `${id}.${await sign(id, secret)}`;
}

export async function openBrowserId(token: string | null | undefined, secret = cookieSecret()): Promise<string | null> {
  if (!token || !secret) return null;
  const [id, mac] = token.split(".");
  if (!id || !mac || !ID_RE.test(id) || !/^[a-f0-9]{64}$/.test(mac)) return null;
  const expected = await sign(id, secret);
  if (expected.length !== mac.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0 ? id : null;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function browserCookieHeader(sealed: string, secure: boolean): string {
  const parts = [`${BROWSER_COOKIE}=${encodeURIComponent(sealed)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${60 * 60 * 24 * 400}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestIsLoopback(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/** Mac files stay on one id. Workers use the signed cookie id. */
export function documentUserId(browserId: string | null): string {
  if (process.env.PRIZE_SCOUT_STORE !== "d1") return OWNER_BROWSER_ID;
  return browserId && ID_RE.test(browserId) ? browserId : OWNER_BROWSER_ID;
}

export async function browserIdFromRequest(request: Request): Promise<{ id: string; fresh: boolean; sealed: string | null }> {
  const secret = cookieSecret();
  const existing = await openBrowserId(readCookie(request.headers.get("cookie"), BROWSER_COOKIE), secret);
  if (existing) return { id: documentUserId(existing), fresh: false, sealed: null };
  if (!secret) return { id: OWNER_BROWSER_ID, fresh: false, sealed: null };
  const created = newBrowserId();
  const sealed = await sealBrowserId(created, secret);
  return { id: documentUserId(created), fresh: true, sealed };
}

export function applyBrowserCookie(response: Response, sealed: string | null, request: Request): Response {
  if (!sealed) return response;
  response.headers.append("set-cookie", browserCookieHeader(sealed, !requestIsLoopback(request)));
  return response;
}
