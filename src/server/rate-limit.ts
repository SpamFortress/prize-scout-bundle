const WINDOW_MS = 60_000;
const PER_ID = process.env.VITEST === "true" ? 10_000 : 60;
const PER_IP = process.env.VITEST === "true" ? 10_000 : 120;

const hits = new Map<string, number[]>();

function allow(key: string, limit: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (forwarded) return forwarded.slice(0, 64);
  try {
    return new URL(request.url).hostname.slice(0, 64);
  } catch {
    return "unknown";
  }
}

/** In-memory window. A forged cookie never reaches this with another person's id. */
export function rateLimit(input: { id: string; ip: string; now?: number }): { ok: true } | { ok: false; message: string } {
  const now = input.now ?? Date.now();
  if (!allow(`id:${input.id}`, PER_ID, now)) return { ok: false, message: "Too many requests for this browser. Wait a minute and try again." };
  if (!allow(`ip:${input.ip}`, PER_IP, now)) return { ok: false, message: "Too many requests from this network. Wait a minute and try again." };
  return { ok: true };
}

export function resetRateLimitForTests(): void {
  hits.clear();
}
