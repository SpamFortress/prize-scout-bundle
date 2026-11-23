import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { dataDirectory, openDocumentStore, readFsDocument, writeFsDocument } from "./document-store";

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
let pairingWrite: Promise<void> | null = null;
let checksWrite: Promise<void> | null = null;

const PAIRING_KEY = "addon-pairing";
const CHECKS_KEY = "addon-checks";

function storeIsD1(): boolean {
  return process.env.PRIZE_SCOUT_STORE === "d1";
}

function pairingFileOverride(): string | undefined {
  return process.env.PRIZE_SCOUT_PAIRING_FILE;
}

function checksFileOverride(): string | undefined {
  return process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE;
}

function pairingUsesD1(): boolean {
  return storeIsD1() && !pairingFileOverride();
}

function checksUseD1(): boolean {
  return storeIsD1() && !checksFileOverride();
}

function pairingDirectory(): string {
  const file = pairingFileOverride();
  return file ? path.dirname(file) : dataDirectory();
}

function checksDirectory(): string {
  const file = checksFileOverride();
  return file ? path.dirname(file) : dataDirectory();
}

function pairingDisk(): boolean {
  if (pairingFileOverride() || pairingUsesD1()) return true;
  return process.env.VITEST !== "true";
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parsePairing(raw: string | null): { token: string; previous: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; previous?: unknown };
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return { token: parsed.token, previous: typeof parsed.previous === "string" ? parsed.previous : null };
  } catch {
    return null;
  }
}

function pairingBody(token: string, previous: string | null): string {
  return `${JSON.stringify({ token, previous })}\n`;
}

function readPairingSync(): { token: string; previous: string | null } | null {
  return parsePairing(readFsDocument(pairingDirectory(), PAIRING_KEY));
}

async function readPairingDocument(): Promise<{ token: string; previous: string | null } | null> {
  if (pairingUsesD1()) return parsePairing(await (await openDocumentStore()).read(PAIRING_KEY));
  return readPairingSync();
}

function writePairingFile(token: string, previous: string | null): void {
  const body = pairingBody(token, previous);
  if (pairingUsesD1()) {
    pairingWrite = openDocumentStore().then((store) => store.write(PAIRING_KEY, body));
    return;
  }
  writeFsDocument(pairingDirectory(), PAIRING_KEY, body, { mode: 0o600 });
}

function diskEnabled(): boolean {
  if (checksFileOverride() || checksUseD1()) return true;
  return process.env.VITEST !== "true";
}

function isStoredCheck(value: unknown): value is AddonCheckRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AddonCheckRecord>;
  return typeof row.url === "string" && row.url.startsWith("https://");
}

/** Missing and unreadable documents are an empty list. The page is not fetched. */
function parseStoredChecks(raw: string | null): AddonCheckRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredCheck);
  } catch {
    return [];
  }
}

function checksBody(): string {
  return JSON.stringify([...memory.checks.values()]);
}

function writeChecksDocument(): void {
  const body = checksBody();
  if (checksUseD1()) {
    checksWrite = openDocumentStore().then((store) => store.write(CHECKS_KEY, body));
    return;
  }
  writeFsDocument(checksDirectory(), CHECKS_KEY, body);
}

async function readChecksDocument(): Promise<AddonCheckRecord[]> {
  if (!diskEnabled()) return [];
  const { reclassifyStoredChecks } = await import("./addon-check");
  const raw = checksUseD1() ? await (await openDocumentStore()).read(CHECKS_KEY) : readFsDocument(checksDirectory(), CHECKS_KEY);
  return reclassifyStoredChecks(parseStoredChecks(raw));
}

async function ensureLoaded(): Promise<void> {
  if (memory.loaded) return;
  if (checksUseD1()) {
    for (const record of await readChecksDocument()) memory.checks.set(record.url, record);
    memory.loaded = true;
    return;
  }
  if (!loading) {
    loading = (async () => {
      try {
        for (const record of await readChecksDocument()) memory.checks.set(record.url, record);
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
  pairingWrite = null;
  checksWrite = null;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Loads the pairing document before a request uses it. File reads stay synchronous for the practice app. */
export async function preparePairing(): Promise<void> {
  if (memory.token || !pairingDisk()) return;
  const stored = await readPairingDocument();
  if (!stored) return;
  memory.token = stored.token;
  memory.previous = stored.previous;
}

export function getPairingToken(): string {
  if (memory.token) return memory.token;
  const stored = pairingUsesD1() || !pairingDisk() ? null : readPairingSync();
  if (stored) {
    memory.token = stored.token;
    memory.previous = stored.previous;
    return stored.token;
  }
  memory.token = randomToken();
  memory.previous = null;
  if (pairingDisk()) writePairingFile(memory.token, null);
  return memory.token;
}

/** Replaces the pairing token. The previous token no longer authorizes a check. */
export function rotatePairingToken(): string {
  if (!memory.token && pairingDisk() && !pairingUsesD1()) {
    const stored = readPairingSync();
    if (stored) {
      memory.token = stored.token;
      memory.previous = stored.previous;
    }
  }
  const next = randomToken();
  const previous = memory.token;
  if (pairingDisk()) writePairingFile(next, previous);
  memory.previous = previous;
  memory.token = next;
  return next;
}

/** Waits until the pairing and checks documents have been written. */
export async function addonPersistence(): Promise<void> {
  const pairing = pairingWrite;
  const checks = checksWrite;
  pairingWrite = null;
  checksWrite = null;
  if (pairing) await pairing;
  if (checks) await checks;
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
  writeChecksDocument();
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

if (process.env.VITEST !== "true" && process.env.PRIZE_SCOUT_STORE !== "d1") {
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
