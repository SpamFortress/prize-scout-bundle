import { isCountryCode } from "./geo";
import { uniqueId } from "./ids";
import { normalizeSources } from "./chat";
import type { Source } from "./types";

export interface SavedSearch {
  id: string;
  query: string;
  sources: Source[];
  region: string;
  createdAt: string;
}

const PROFILE_KEYS = ["country", "state", "age", "email", "dedicatedEmail", "name", "address", "profile", "personalEmail"];

export function createSavedSearch(
  input: { query: string; sources: readonly string[]; region: string },
  now: Date,
  id?: string,
): { ok: true; saved: SavedSearch } | { ok: false; error: string } {
  const query = input.query.trim();
  if (!query) return { ok: false, error: "Enter what you want to win before saving the search." };
  if (query.length > 300) return { ok: false, error: "That search is too long." };
  if (!isCountryCode(input.region)) return { ok: false, error: "Choose a country for the region bias." };
  const saved: SavedSearch = {
    id: id ?? uniqueId("search"),
    query,
    sources: normalizeSources(input.sources),
    region: input.region.toUpperCase(),
    createdAt: now.toISOString(),
  };
  assertProfileFree(saved);
  return { ok: true, saved };
}

export function assertProfileFree(saved: SavedSearch): void {
  for (const key of Object.keys(saved)) {
    if (PROFILE_KEYS.includes(key)) throw new Error(`Saved search must not include ${key}.`);
  }
}

export function rerunPayload(saved: SavedSearch): { query: string; sources: Source[]; region: string } {
  assertProfileFree(saved);
  return { query: saved.query, sources: [...saved.sources], region: saved.region };
}
