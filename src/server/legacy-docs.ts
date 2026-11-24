import { dataDirectory, readFsDocument, writeFsDocument } from "./document-store";
import { OWNER_BROWSER_ID, legacyDocKey, userDocKey, type UserDocKind } from "./user-scope";

/** Copies a legacy single-user file onto the owner id. The original file stays. */
export function migrateLegacyOwner(directory: string, kind: UserDocKind): boolean {
  const legacy = legacyDocKey(kind);
  if (!legacy) return false;
  const scopedKey = userDocKey(OWNER_BROWSER_ID, kind);
  if (readFsDocument(directory, scopedKey) !== null) return false;
  const body = readFsDocument(directory, legacy);
  if (body === null) return false;
  writeFsDocument(directory, scopedKey, body, kind === "pairing" ? { mode: 0o600 } : undefined);
  return true;
}

/** Mac startup copies legacy files onto the owner id. Tests and Workers skip this. Originals stay. */
export function ensureMacLegacyMigrated(): boolean {
  if (process.env.VITEST === "true" || process.env.PRIZE_SCOUT_STORE === "d1") return false;
  const dir = dataDirectory();
  const checks = migrateLegacyOwner(dir, "checks");
  const pairing = migrateLegacyOwner(dir, "pairing");
  const usage = migrateLegacyOwner(dir, "usage");
  return checks || pairing || usage;
}

export function macDocumentKey(kind: UserDocKind, legacy: string, overridden: boolean): string {
  if (overridden || process.env.VITEST === "true" || process.env.PRIZE_SCOUT_STORE === "d1") return legacy;
  ensureMacLegacyMigrated();
  return userDocKey(OWNER_BROWSER_ID, kind);
}

export function ownerCheckCount(directory: string): number {
  const raw = readFsDocument(directory, userDocKey(OWNER_BROWSER_ID, "checks")) ?? readFsDocument(directory, "addon-checks");
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
