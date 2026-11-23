import type { Source } from "./types";

export interface FilterableRow {
  eligibility: string;
  end: string;
  freeMethodLabel?: string | null;
  methods?: Array<"free" | "paid">;
  kind?: string;
  liveVerified?: boolean;
  source?: Source;
  instantWin?: boolean;
  mailIn?: boolean;
  daily?: boolean;
}

export const LIVE_SOURCES: readonly Source[] = ["web", "x", "facebook", "instagram"];

export interface LiveFilterState {
  freeOnly: boolean;
  eligibility: boolean;
  endsSoon: boolean;
  instantWin: boolean;
  mailIn: boolean;
  daily: boolean;
  sources: Source[];
}

export const OPEN_LIVE_FILTERS: LiveFilterState = {
  freeOnly: false,
  eligibility: false,
  endsSoon: false,
  instantWin: false,
  mailIn: false,
  daily: false,
  sources: [...LIVE_SOURCES],
};

const SOON_DAYS = 30;

/** A stated eligibility that is not the United States and not worldwide. Unstated eligibility stays visible. */
export function eligibilityExcludesUnitedStates(eligibility: string): boolean {
  const text = eligibility.toLowerCase();
  if (!text || text.startsWith("not stated")) return false;
  if (/excludes united states/.test(text)) return true;
  if (/\bonly\b/.test(text) && !/united states|worldwide/.test(text) && /\b(canada|united kingdom|australia|europe|mexico)\b/.test(text)) return true;
  return false;
}

export function endsSoon(end: string, now: Date): boolean {
  if (!end) return false;
  const time = Date.parse(end);
  if (!Number.isFinite(time)) return false;
  const days = (time - now.getTime()) / 86_400_000;
  return days >= 0 && days <= SOON_DAYS;
}

export function rowHasFreeMethod(row: FilterableRow): boolean {
  if (row.freeMethodLabel) return true;
  if (row.methods) return row.methods.includes("free");
  return row.kind !== "mixed";
}

/** Filters apply after fetch. Hidden rows are counted so the list is never emptied in silence. */
export function applyLiveFilters<T extends FilterableRow>(rows: readonly T[], filters: LiveFilterState, now: Date): { shown: T[]; hidden: number } {
  const shown = rows.filter((row) => {
    if (filters.freeOnly && !rowHasFreeMethod(row)) return false;
    if (filters.eligibility && eligibilityExcludesUnitedStates(row.eligibility)) return false;
    if (filters.endsSoon && !endsSoon(row.end, now)) return false;
    if (filters.instantWin && row.instantWin !== true) return false;
    if (filters.mailIn && row.mailIn !== true) return false;
    if (filters.daily && row.daily !== true) return false;
    if (row.liveVerified && row.source && !filters.sources.includes(row.source)) return false;
    return true;
  });
  return { shown, hidden: rows.length - shown.length };
}
