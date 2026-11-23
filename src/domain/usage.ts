import { sha256Hex } from "./sha256";

export const PAUSE_LINE = "Search is paused right now";

export const DEFAULT_COST_USD = 0.005;
export const DEFAULT_LOW_CREDIT_USD = 2;
export const DEFAULT_DAILY_CAP = 25;

/** Dollars of search cost that one dollar of tips covers. */
export function searchesPerDollar(costPerRequestUsd: number): number {
  if (!(costPerRequestUsd > 0)) return 0;
  return Math.floor(1 / costPerRequestUsd + 1e-9);
}

export function remainingCreditUsd(startingUsd: number, braveRequests: number, costPerRequestUsd: number): number {
  const raw = startingUsd - braveRequests * costPerRequestUsd;
  return Math.round(raw * 10000) / 10000;
}

export function searchesLeft(remainingUsd: number, costPerRequestUsd: number): number {
  if (!(costPerRequestUsd > 0) || remainingUsd <= 0) return 0;
  return Math.floor(remainingUsd / costPerRequestUsd + 1e-9);
}

/** Low once remaining credit is under the threshold. */
export function creditIsLow(remainingUsd: number, thresholdUsd: number): boolean {
  return remainingUsd < thresholdUsd;
}

export function creditExhausted(remainingUsd: number): boolean {
  return remainingUsd <= 0;
}

export function dailyCapReached(searchesToday: number, cap: number): boolean {
  return searchesToday >= cap;
}

/** Hash of an anonymous id, the UTC day, and a server salt. The hash does not include an IP or email. */
export function dailyVisitorHash(anonId: string, day: string, salt: string): string {
  return sha256Hex(`${salt}\n${day}\n${anonId}`);
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function daysInRange(endDay: string, count: number): string[] {
  const [year, month, day] = endDay.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

export interface DayUsage {
  searches: number;
  braveRequests: number;
  visitors: string[];
  byVisitor: Record<string, number>;
}

export interface UsageSnapshot {
  salt: string;
  startingCreditUsd: number | null;
  costPerRequestUsd: number | null;
  lowCreditUsd: number | null;
  lowAlertSent: boolean;
  allTimeSearches: number;
  allTimeBraveRequests: number;
  days: Record<string, DayUsage>;
}

export function emptyUsage(salt: string): UsageSnapshot {
  return {
    salt,
    startingCreditUsd: null,
    costPerRequestUsd: null,
    lowCreditUsd: null,
    lowAlertSent: false,
    allTimeSearches: 0,
    allTimeBraveRequests: 0,
    days: {},
  };
}

function dayOf(snapshot: UsageSnapshot, day: string): DayUsage {
  return snapshot.days[day] ?? { searches: 0, braveRequests: 0, visitors: [], byVisitor: {} };
}

export function visitorSearchesOn(snapshot: UsageSnapshot, day: string, visitorHash: string): number {
  return dayOf(snapshot, day).byVisitor[visitorHash] ?? 0;
}

export interface SearchGate {
  paused: boolean;
  reason: "ok" | "no_key" | "credit" | "cap";
}

export function searchGate(input: {
  hasKey: boolean;
  startingCreditUsd: number | null;
  braveRequests: number;
  costPerRequestUsd: number;
  searchesByVisitor: number;
  cap: number;
}): SearchGate {
  if (!input.hasKey) return { paused: true, reason: "no_key" };
  if (input.startingCreditUsd !== null && creditExhausted(remainingCreditUsd(input.startingCreditUsd, input.braveRequests, input.costPerRequestUsd))) {
    return { paused: true, reason: "credit" };
  }
  if (dailyCapReached(input.searchesByVisitor, input.cap)) return { paused: true, reason: "cap" };
  return { paused: false, reason: "ok" };
}

/** Records one allowed search. Caller must not call this when the gate is paused. */
export function recordAllowedSearch(snapshot: UsageSnapshot, day: string, visitorHash: string, braveCalled: boolean): UsageSnapshot {
  const current = dayOf(snapshot, day);
  const visitors = current.visitors.includes(visitorHash) ? current.visitors : [...current.visitors, visitorHash];
  const nextDay: DayUsage = {
    searches: current.searches + 1,
    braveRequests: current.braveRequests + (braveCalled ? 1 : 0),
    visitors,
    byVisitor: { ...current.byVisitor, [visitorHash]: (current.byVisitor[visitorHash] ?? 0) + 1 },
  };
  return {
    ...snapshot,
    allTimeSearches: snapshot.allTimeSearches + 1,
    allTimeBraveRequests: snapshot.allTimeBraveRequests + (braveCalled ? 1 : 0),
    days: { ...snapshot.days, [day]: nextDay },
  };
}

export function sumSearches(snapshot: UsageSnapshot, days: readonly string[]): number {
  return days.reduce((total, day) => total + (snapshot.days[day]?.searches ?? 0), 0);
}

export function resolvedCost(snapshot: UsageSnapshot): number {
  return snapshot.costPerRequestUsd !== null && snapshot.costPerRequestUsd > 0 ? snapshot.costPerRequestUsd : DEFAULT_COST_USD;
}

export function resolvedLow(snapshot: UsageSnapshot): number {
  return snapshot.lowCreditUsd !== null && snapshot.lowCreditUsd >= 0 ? snapshot.lowCreditUsd : DEFAULT_LOW_CREDIT_USD;
}
