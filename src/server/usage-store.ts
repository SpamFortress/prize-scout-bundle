import path from "node:path";
import { randomBytes } from "node:crypto";
import { dataDirectory, openDocumentStore, readFsDocument, writeFsDocument } from "./document-store";
import { readSearchCache } from "./search-cache";
import {
  emptyUsage,
  recordAllowedSearch,
  DEFAULT_COST_USD,
  DEFAULT_LOW_CREDIT_USD,
  remainingCreditUsd,
  creditIsLow,
  searchesLeft,
  searchGate,
  sumSearches,
  utcDay,
  capDay,
  donationUrl,
  DEFAULT_FREE_DAILY_CAP,
  CAP_LINE,
  daysInRange,
  visitorSearchesOn,
  dailyVisitorHash,
  type UsageSnapshot,
} from "@/domain/usage";
import { notifierFromEnv, type CreditNotifier, type LowCreditNotice } from "@/domain/credit-alert";

const USAGE_KEY = "usage";

function usageDirectory(): string {
  const file = process.env.PRIZE_SCOUT_USAGE_FILE?.trim();
  return file ? path.dirname(file) : dataDirectory();
}

function usageUsesD1(): boolean {
  return process.env.PRIZE_SCOUT_STORE === "d1" && !process.env.PRIZE_SCOUT_USAGE_FILE?.trim();
}

let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function numberFromEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function readUsageText(): Promise<string | null> {
  if (usageUsesD1()) return (await openDocumentStore()).read(USAGE_KEY);
  return readFsDocument(usageDirectory(), USAGE_KEY);
}

export async function readUsage(): Promise<UsageSnapshot> {
  try {
    const text = await readUsageText();
    if (!text) return emptyUsage(randomBytes(16).toString("hex"));
    const parsed = JSON.parse(text) as UsageSnapshot;
    if (!parsed || typeof parsed !== "object" || typeof parsed.salt !== "string") return emptyUsage(randomBytes(16).toString("hex"));
    return {
      ...emptyUsage(parsed.salt),
      ...parsed,
      days: parsed.days ?? {},
    };
  } catch {
    return emptyUsage(randomBytes(16).toString("hex"));
  }
}

async function writeUsage(snapshot: UsageSnapshot): Promise<void> {
  const body = JSON.stringify(snapshot);
  if (usageUsesD1()) {
    await (await openDocumentStore()).write(USAGE_KEY, body);
    return;
  }
  writeFsDocument(usageDirectory(), USAGE_KEY, body);
}

export function dailyCap(): number {
  const free = numberFromEnv("PRIZE_SCOUT_FREE_DAILY_CAP");
  if (free !== null && free >= 1) return Math.floor(free);
  const legacy = numberFromEnv("PRIZE_SCOUT_SEARCH_DAILY_CAP");
  if (legacy !== null && legacy >= 1) return Math.floor(legacy);
  return DEFAULT_FREE_DAILY_CAP;
}

export function globalDailyCap(): number | null {
  const raw = numberFromEnv("PRIZE_SCOUT_GLOBAL_DAILY_CAP");
  if (raw === null || raw < 1) return null;
  return Math.floor(raw);
}

export { donationUrl, CAP_LINE };

export function effectiveStartingCredit(snapshot: UsageSnapshot): number | null {
  if (snapshot.startingCreditUsd !== null) return snapshot.startingCreditUsd;
  return numberFromEnv("PRIZE_SCOUT_BRAVE_CREDIT_USD");
}

function effectiveCost(snapshot: UsageSnapshot): number {
  if (snapshot.costPerRequestUsd !== null && snapshot.costPerRequestUsd > 0) return snapshot.costPerRequestUsd;
  const env = numberFromEnv("PRIZE_SCOUT_BRAVE_COST_USD");
  if (env !== null && env > 0) return env;
  return DEFAULT_COST_USD;
}

function effectiveLow(snapshot: UsageSnapshot): number {
  if (snapshot.lowCreditUsd !== null && snapshot.lowCreditUsd >= 0) return snapshot.lowCreditUsd;
  const env = numberFromEnv("PRIZE_SCOUT_LOW_CREDIT_USD");
  if (env !== null && env >= 0) return env;
  return DEFAULT_LOW_CREDIT_USD;
}

export interface UsageSummary {
  searchesToday: number;
  searches7Days: number;
  searchesAllTime: number;
  braveRequestsToday: number;
  braveRequestsAllTime: number;
  visitorsToday: number;
  startingCreditUsd: number | null;
  costPerRequestUsd: number;
  lowCreditUsd: number;
  remainingUsd: number | null;
  searchesLeft: number | null;
  low: boolean;
}

export function summarize(snapshot: UsageSnapshot, now: Date): UsageSummary {
  const day = capDay(now);
  const week = daysInRange(day, 7);
  const today = snapshot.days[day];
  const starting = effectiveStartingCredit(snapshot);
  const cost = effectiveCost(snapshot);
  const lowAt = effectiveLow(snapshot);
  const remaining = starting === null ? null : remainingCreditUsd(starting, snapshot.allTimeBraveRequests, cost);
  return {
    searchesToday: today?.searches ?? 0,
    searches7Days: sumSearches(snapshot, week),
    searchesAllTime: snapshot.allTimeSearches,
    braveRequestsToday: today?.braveRequests ?? 0,
    braveRequestsAllTime: snapshot.allTimeBraveRequests,
    visitorsToday: today?.visitors.length ?? 0,
    startingCreditUsd: starting,
    costPerRequestUsd: cost,
    lowCreditUsd: lowAt,
    remainingUsd: remaining,
    searchesLeft: remaining === null ? null : searchesLeft(remaining, cost),
    low: remaining !== null && creditIsLow(remaining, lowAt),
  };
}

export async function getUsageSummary(now = new Date()): Promise<UsageSummary> {
  return summarize(await readUsage(), now);
}

export async function saveOwnerSettings(patch: { startingCreditUsd?: number; costPerRequestUsd?: number; lowCreditUsd?: number }): Promise<UsageSummary> {
  return withLock(async () => {
    const current = await readUsage();
    const next: UsageSnapshot = {
      ...current,
      startingCreditUsd: patch.startingCreditUsd ?? current.startingCreditUsd,
      costPerRequestUsd: patch.costPerRequestUsd ?? current.costPerRequestUsd,
      lowCreditUsd: patch.lowCreditUsd ?? current.lowCreditUsd,
      lowAlertSent: false,
    };
    await writeUsage(next);
    return summarize(next, new Date());
  });
}

export interface RecordResult {
  paused: boolean;
  summary: UsageSummary;
  visitorHash: string;
  /** Brave calls already counted for this visitor today, including this search when it was allowed. */
  visitorSearches: number;
}

/** Decides whether this visitor may spend a Brave credit, and records the search when they may. */
export async function beginSearch(input: { anonId: string; hasKey: boolean; now?: Date; query?: string; offset?: number }): Promise<RecordResult & { cached?: boolean; reason?: string; listings?: unknown[]; nextOffset?: number | null }> {
  const now = input.now ?? new Date();
  return withLock(async () => {
    const current = await readUsage();
    const day = capDay(now);
    const visitorHash = dailyVisitorHash(input.anonId, day, current.salt);
    const query = input.query?.trim() ?? "";
    const offset = input.offset ?? 0;
    const saved = query ? await readSearchCache(input.anonId, day, query, offset) : null;
    const todayTotal = current.days[day]?.searches ?? 0;
    const gate = searchGate({
      hasKey: input.hasKey,
      startingCreditUsd: effectiveStartingCredit(current),
      braveRequests: current.allTimeBraveRequests,
      costPerRequestUsd: effectiveCost(current),
      searchesByVisitor: visitorSearchesOn(current, day, visitorHash),
      cap: dailyCap(),
      globalToday: todayTotal,
      globalCap: globalDailyCap(),
      cached: Boolean(saved),
    });
    if (gate.reason === "cached" && saved) {
      return {
        paused: false,
        cached: true,
        reason: "cached",
        listings: saved.listings,
        nextOffset: saved.nextOffset,
        summary: summarize(current, now),
        visitorHash,
        visitorSearches: visitorSearchesOn(current, day, visitorHash),
      };
    }
    if (gate.paused) return { paused: true, reason: gate.reason, summary: summarize(current, now), visitorHash, visitorSearches: visitorSearchesOn(current, day, visitorHash) };
    const next = recordAllowedSearch(current, day, visitorHash, true);
    await writeUsage(next);
    return { paused: false, reason: "ok", summary: summarize(next, now), visitorHash, visitorSearches: visitorSearchesOn(next, day, visitorHash) };
  });
}

/** Counts extra Brave calls from query variants. Does not add another visitor search. */
export async function addBraveRequests(count: number, now = new Date()): Promise<void> {
  if (count < 1) return;
  await withLock(async () => {
    const current = await readUsage();
    const day = utcDay(now);
    const today = current.days[day] ?? { searches: 0, braveRequests: 0, visitors: [], byVisitor: {} };
    const next = {
      ...current,
      allTimeBraveRequests: current.allTimeBraveRequests + count,
      days: { ...current.days, [day]: { ...today, braveRequests: today.braveRequests + count } },
    };
    await writeUsage(next);
  });
}

export async function maybeAlertLowCredit(summary: UsageSummary, notify: CreditNotifier = notifierFromEnv(process.env.PRIZE_SCOUT_ALERT_WEBHOOK_URL)): Promise<void> {
  if (!process.env.PRIZE_SCOUT_ALERT_WEBHOOK_URL?.trim()) return;
  if (!summary.low || summary.remainingUsd === null || summary.searchesLeft === null) return;
  const current = await readUsage();
  if (current.lowAlertSent) return;
  const notice: LowCreditNotice = {
    remainingUsd: summary.remainingUsd,
    thresholdUsd: summary.lowCreditUsd,
    searchesLeft: summary.searchesLeft,
  };
  try {
    await notify.notifyLowCredit(notice);
  } catch {
    return;
  }
  await withLock(async () => {
    const latest = await readUsage();
    if (latest.lowAlertSent) return;
    await writeUsage({ ...latest, lowAlertSent: true });
  });
}

export function anonIdFromCookie(header: string | null): { id: string; fresh: boolean } {
  const match = header?.match(/(?:^|;\s*)ps_anon=([^;]+)/);
  if (match?.[1]) return { id: decodeURIComponent(match[1]), fresh: false };
  return { id: randomBytes(16).toString("hex"), fresh: true };
}
