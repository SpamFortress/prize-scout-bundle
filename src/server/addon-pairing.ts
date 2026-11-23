import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PAIRING_EXPIRED_MESSAGE = "Pairing expired, paste the new token";
const PAIRING_REJECTED_MESSAGE = "Pairing token was missing or wrong.";

export interface AddonCheckRecord {
  url: string;
  title: string;
  checkedByYou: boolean;
  listingGroup: "verified" | "check" | "store";
  rulesNote: string;
  endIso: string | null;
  openRulesUrl: string | null;
  limits: string[];
  checkedAt: string;
  /** Calendar date of the check. Present on rows classified by the current app. */
  lastChecked?: string;
  /** Page snapshot from the add-on. Kept so a restart can re-apply rules without fetching. */
  html?: string;
  /** Terms, privacy, search, or an index. Kept in the file and omitted from lists. */
  notContest?: boolean;
  /** A rules snapshot folded into an entry row. Kept in the file. */
  hidden?: boolean;
  /** Add-on build that sent this check. Missing means an older popup. */
  addonVersion?: string;
  /** Saved status. VERIFIED is a manual or previously accepted verification and is not recomputed. */
  status?: string;
  /** Who set the status. "user" means the owner marked the row. */
  verifiedBy?: string;
}

const memory = {
  token: null as string | null,
  previous: null as string | null,
  checks: new Map<string, AddonCheckRecord>(),
  loaded: false,
};

let loading: Promise<void> | null = null;

function tokenFile(): string {
  return process.env.PRIZE_SCOUT_PAIRING_FILE ?? path.join(process.cwd(), "data", "addon-pairing.json");
}

function pairingDisk(): boolean {
  if (process.env.PRIZE_SCOUT_PAIRING_FILE) return true;
  return process.env.VITEST !== "true";
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readPairingFile(): { token: string; previous: string | null } | null {
  const file = tokenFile();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { token?: unknown; previous?: unknown };
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return { token: parsed.token, previous: typeof parsed.previous === "string" ? parsed.previous : null };
  } catch {
    return null;
  }
}

function writePairingFile(token: string, previous: string | null): void {
  const file = tokenFile();
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.addon-pairing.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, `${JSON.stringify({ token, previous })}\n`, { mode: 0o600 });
  try {
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* The temp file is removed when the rename can be undone. */
    }
    throw error;
  }
}

function checksFile(): string {
  return process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE ?? path.join(process.cwd(), "data", "addon-checks.json");
}

function diskEnabled(): boolean {
  if (process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE) return true;
  return process.env.VITEST !== "true";
}

function isStoredCheck(value: unknown): value is AddonCheckRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AddonCheckRecord>;
  return typeof row.url === "string" && row.url.startsWith("https://");
}

/** Missing and unreadable files are an empty list. The page is not fetched. */
function readStoredChecks(): AddonCheckRecord[] {
  const file = checksFile();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredCheck);
  } catch {
    return [];
  }
}

async function ensureLoaded(): Promise<void> {
  if (memory.loaded) return;
  if (!loading) {
    loading = (async () => {
      try {
        if (!diskEnabled()) return;
        const { reclassifyStoredChecks } = await import("./addon-check");
        for (const record of reclassifyStoredChecks(readStoredChecks())) {
          memory.checks.set(record.url, record);
        }
      } finally {
        memory.loaded = true;
        loading = null;
      }
    })();
  }
  await loading;
}

/** Drops the in-memory list so the next read loads the checks file again. */
export function resetAddonChecksForTests(): void {
  memory.token = null;
  memory.previous = null;
  memory.checks.clear();
  memory.loaded = false;
  loading = null;
}

export function getPairingToken(): string {
  if (memory.token) return memory.token;
  const stored = pairingDisk() ? readPairingFile() : null;
  if (stored) {
    memory.token = stored.token;
    memory.previous = stored.previous;
    return stored.token;
  }
  memory.token = randomBytes(32).toString("hex");
  memory.previous = null;
  if (pairingDisk()) writePairingFile(memory.token, null);
  return memory.token;
}

/** Replaces the pairing token. The previous token no longer authorizes a check. */
export function rotatePairingToken(): string {
  if (!memory.token && pairingDisk()) {
    const stored = readPairingFile();
    if (stored) {
      memory.token = stored.token;
      memory.previous = stored.previous;
    }
  }
  const next = randomBytes(32).toString("hex");
  const previous = memory.token;
  if (pairingDisk()) writePairingFile(next, previous);
  memory.previous = previous;
  memory.token = next;
  return next;
}

export function setPairingTokenForTests(token: string): void {
  memory.token = token;
  memory.previous = null;
  memory.checks.clear();
  memory.loaded = true;
  loading = null;
}

export function saveAddonCheck(record: AddonCheckRecord): void {
  memory.checks.set(record.url, record);
  if (!diskEnabled()) return;
  const file = checksFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify([...memory.checks.values()]));
}

export async function allAddonChecks(): Promise<AddonCheckRecord[]> {
  await ensureLoaded();
  return [...memory.checks.values()];
}

export async function listAddonChecks(): Promise<AddonCheckRecord[]> {
  const rows = (await allAddonChecks()).filter((row) => !row.hidden && !row.notContest);
  return rows.sort((left, right) => rulesListRank(right) - rulesListRank(left) || left.title.localeCompare(right.title));
}

function rulesListRank(row: AddonCheckRecord): number {
  return /official rules not found/i.test(row.rulesNote) ? 0 : 1;
}

if (process.env.VITEST !== "true") {
  void ensureLoaded();
}

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const APP_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function extensionOriginAllowed(origin: string | null): boolean {
  return Boolean(origin && EXTENSION_ORIGIN.test(origin));
}

export function appOriginAllowed(origin: string | null): boolean {
  return origin === null || APP_ORIGIN.test(origin);
}

export function authorizeAddonPost(request: Request): { ok: true } | { ok: false; status: number; message: string } {
  const origin = request.headers.get("origin");
  if (!extensionOriginAllowed(origin)) {
    return { ok: false, status: 403, message: "Origin is not the Prize Scout extension." };
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || !sameSecret(token, getPairingToken())) {
    const expired = Boolean(token && memory.previous && sameSecret(token, memory.previous));
    return { ok: false, status: 401, message: expired ? PAIRING_EXPIRED_MESSAGE : PAIRING_REJECTED_MESSAGE };
  }
  return { ok: true };
}

export function addonCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (extensionOriginAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin as string);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}
