import { timingSafeEqual } from "node:crypto";

/** True only when the provided token matches the expected owner token. An empty expected token never matches. */
export function ownerTokenMatches(provided: string | null | undefined, expected = process.env.PRIZE_SCOUT_OWNER_TOKEN ?? ""): boolean {
  const got = provided ?? "";
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Mac practice keeps the loopback check. Workers (D1) allow the owner token or a listed browser id on a public host. */
export function ownerLoopbackRequired(): boolean {
  if (process.env.PRIZE_SCOUT_OWNER_PUBLIC === "1") return false;
  return process.env.PRIZE_SCOUT_STORE !== "d1";
}

export function ownerBrowserIds(): string[] {
  return (process.env.PRIZE_SCOUT_OWNER_BROWSER_IDS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

export function ownerRequestAllowed(input: { loopback: boolean; token: string; browserId: string | null; expectedToken: string }): boolean {
  if (ownerLoopbackRequired() && !input.loopback) return false;
  if (ownerTokenMatches(input.token, input.expectedToken)) return true;
  const id = input.browserId?.toLowerCase() ?? "";
  return id.length > 0 && ownerBrowserIds().includes(id);
}

/** Owner secret from the process environment, or from the Workers binding when the preview uses D1. */
export async function ownerTokenExpected(): Promise<string> {
  const fromEnv = process.env.PRIZE_SCOUT_OWNER_TOKEN?.trim() ?? "";
  if (fromEnv || process.env.PRIZE_SCOUT_STORE !== "d1") return fromEnv;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const value = (env as { PRIZE_SCOUT_OWNER_TOKEN?: unknown }).PRIZE_SCOUT_OWNER_TOKEN;
  return typeof value === "string" ? value.trim() : "";
}
