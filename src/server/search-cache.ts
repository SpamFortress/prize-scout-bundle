import { dataDirectory, openDocumentStore, readFsDocument, writeFsDocument } from "./document-store";
import { userDocKey } from "./user-scope";

export interface CachedSearch {
  listings: unknown[];
  nextOffset: number | null;
}

interface CacheDocument {
  day: string;
  queries: Record<string, CachedSearch>;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(query: string, offset: number): string {
  return `${normalizeSearchQuery(query)}\n${offset}`;
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

function parseCache(raw: string | null, day: string): CacheDocument {
  if (!raw) return { day, queries: {} };
  try {
    const parsed = JSON.parse(raw) as CacheDocument;
    if (parsed.day !== day || !parsed.queries || typeof parsed.queries !== "object") return { day, queries: {} };
    return parsed;
  } catch {
    return { day, queries: {} };
  }
}

/** Listings saved for this browser and cap-day. A previous day is treated as expired. */
export async function readSearchCache(userId: string, day: string, query: string, offset = 0): Promise<CachedSearch | null> {
  const parsed = parseCache(await readRaw(userDocKey(userId, "cache")), day);
  return parsed.queries[cacheKey(query, offset)] ?? null;
}

/** Replaces a prior day's cache so the document expires at the cap reset. */
export async function writeSearchCache(userId: string, day: string, query: string, value: CachedSearch, offset = 0): Promise<void> {
  const key = userDocKey(userId, "cache");
  const parsed = parseCache(await readRaw(key), day);
  parsed.queries[cacheKey(query, offset)] = { listings: value.listings, nextOffset: value.nextOffset };
  await writeRaw(key, JSON.stringify(parsed));
}
