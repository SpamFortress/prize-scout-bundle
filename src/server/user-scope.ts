/** Stable id for the Mac practice copy and for legacy files that had no browser id. */
export const OWNER_BROWSER_ID = "owner";

export type UserDocKind = "checks" | "pairing" | "usage" | "saved" | "entries" | "profile" | "cache";

const LEGACY: Partial<Record<UserDocKind, string>> = {
  checks: "addon-checks",
  pairing: "addon-pairing",
  usage: "usage",
};

export function userDocKey(userId: string, kind: UserDocKind): string {
  const id = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32) || OWNER_BROWSER_ID;
  return `${id}-${kind}`;
}

export function legacyDocKey(kind: UserDocKind): string | null {
  return LEGACY[kind] ?? null;
}
