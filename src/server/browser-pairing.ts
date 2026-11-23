import { createHash } from "node:crypto";
import { PAIRING_EXPIRED_MESSAGE } from "./addon-pairing";
import type { AddonCheckRecord } from "./addon-pairing";
import { openDocumentStore, readFsDocument, writeFsDocument, dataDirectory } from "./document-store";
import { OWNER_BROWSER_ID, userDocKey } from "./user-scope";

const PAIRING_REJECTED = "Pairing token was missing or wrong.";

interface BrowserBucket {
  token: string;
  previous: string | null;
  checks: AddonCheckRecord[];
}

const buckets = new Map<string, BrowserBucket>();

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameSecret(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

async function readRaw(key: string): Promise<string | null> {
  if (process.env.PRIZE_SCOUT_STORE === "d1") return (await openDocumentStore()).read(key);
  return readFsDocument(dataDirectory(), key);
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (process.env.PRIZE_SCOUT_STORE === "d1") {
    await (await openDocumentStore()).write(key, value);
    return;
  }
  writeFsDocument(dataDirectory(), key, value);
}

async function rememberIndex(token: string, userId: string): Promise<void> {
  const key = "pairing-index";
  const raw = await readRaw(key);
  const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  parsed[tokenHash(token)] = userId;
  await writeRaw(key, JSON.stringify(parsed));
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

export async function browserPairing(userId: string): Promise<BrowserBucket> {
  const id = userId || OWNER_BROWSER_ID;
  const cached = buckets.get(id);
  if (cached) return cached;
  const stored = parsePairing(await readRaw(userDocKey(id, "pairing")));
  const bucket: BrowserBucket = stored
    ? { token: stored.token, previous: stored.previous, checks: [] }
    : { token: randomToken(), previous: null, checks: [] };
  if (!stored) {
    await writeRaw(userDocKey(id, "pairing"), `${JSON.stringify({ token: bucket.token, previous: null })}\n`);
    await rememberIndex(bucket.token, id);
  }
  const checksRaw = await readRaw(userDocKey(id, "checks"));
  if (checksRaw) {
    try {
      const parsed = JSON.parse(checksRaw) as unknown;
      if (Array.isArray(parsed)) bucket.checks = parsed.filter((row) => row && typeof row.url === "string");
    } catch {
      bucket.checks = [];
    }
  }
  buckets.set(id, bucket);
  return bucket;
}

export async function rotateBrowserPairing(userId: string): Promise<string> {
  const bucket = await browserPairing(userId);
  const next = randomToken();
  const previous = bucket.token;
  bucket.previous = previous;
  bucket.token = next;
  await writeRaw(userDocKey(userId, "pairing"), `${JSON.stringify({ token: next, previous })}\n`);
  await rememberIndex(next, userId);
  await rememberIndex(previous, userId);
  return next;
}

export async function saveBrowserCheck(userId: string, record: AddonCheckRecord): Promise<void> {
  const bucket = await browserPairing(userId);
  const index = bucket.checks.findIndex((row) => row.url === record.url);
  if (index >= 0) bucket.checks[index] = record;
  else bucket.checks.push(record);
  await writeRaw(userDocKey(userId, "checks"), JSON.stringify(bucket.checks));
}

export async function listBrowserChecks(userId: string): Promise<AddonCheckRecord[]> {
  const bucket = await browserPairing(userId);
  return bucket.checks.filter((row) => !row.hidden && !row.notContest);
}

export async function authorizeBrowserToken(token: string): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  for (const [userId, bucket] of buckets) {
    if (sameSecret(token, bucket.token)) return { ok: true, userId };
    if (bucket.previous && sameSecret(token, bucket.previous)) return { ok: false, status: 401, message: PAIRING_EXPIRED_MESSAGE };
  }
  const raw = await readRaw("pairing-index");
  if (!raw) return { ok: false, status: 401, message: PAIRING_REJECTED };
  let userId = "";
  try {
    userId = (JSON.parse(raw) as Record<string, string>)[tokenHash(token)] ?? "";
  } catch {
    return { ok: false, status: 401, message: PAIRING_REJECTED };
  }
  if (!userId) return { ok: false, status: 401, message: PAIRING_REJECTED };
  const bucket = await browserPairing(userId);
  if (sameSecret(token, bucket.token)) return { ok: true, userId };
  if (bucket.previous && sameSecret(token, bucket.previous)) return { ok: false, status: 401, message: PAIRING_EXPIRED_MESSAGE };
  return { ok: false, status: 401, message: PAIRING_REJECTED };
}

export function resetBrowserPairingForTests(): void {
  buckets.clear();
}
