import { readFsDocument, writeFsDocument } from "./document-store";
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
