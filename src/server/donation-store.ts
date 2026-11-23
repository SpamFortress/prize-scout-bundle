import { timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";
import { capDay } from "@/domain/usage";
import {
  bonusExpiryDays,
  ceilingBlocksPool,
  codesInMessage,
  costPerSearchUsd,
  donorShare,
  hashDonorEmail,
  monthlyCeilingUsd,
  newClaimCode,
  poolDailyCap,
  splitDonation,
  type SearchFunding,
} from "@/domain/donations";
import { dataDirectory, openDocumentStore, readFsDocument, writeFsDocument } from "./document-store";
import { userDocKey } from "./user-scope";

const LEDGER_KEY = "donations";
const CLAIM_KEY = "claim-codes";

export interface DonationRecord {
  messageId: string;
  at: string;
  amount: string;
  currency: string;
  searches: number;
  donorSearches: number;
  poolSearches: number;
  matched: boolean;
  browserId: string | null;
  emailHash: string | null;
  codes: string[];
}

interface BonusGrant {
  remaining: number;
  expiresAt: string | null;
}

interface BrowserBonus {
  code: string;
  grants: BonusGrant[];
  poolDay: string;
  poolUsed: number;
}

interface Ledger {
  salt: string;
  seen: string[];
  records: DonationRecord[];
  poolSearches: number;
  month: string;
  monthSpendUsd: number;
  monthCoveredUsd: number;
}

interface ClaimIndex {
  codes: Record<string, string>;
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

function emptyLedger(): Ledger {
  return {
    salt: randomBytes(16).toString("hex"),
    seen: [],
    records: [],
    poolSearches: 0,
    month: "",
    monthSpendUsd: 0,
    monthCoveredUsd: 0,
  };
}

function parseLedger(raw: string | null): Ledger {
  if (!raw) return emptyLedger();
  try {
    const parsed = JSON.parse(raw) as Ledger;
    if (!parsed || typeof parsed !== "object" || typeof parsed.salt !== "string") return emptyLedger();
    return {
      ...emptyLedger(),
      ...parsed,
      seen: parsed.seen ?? [],
      records: parsed.records ?? [],
      poolSearches: parsed.poolSearches ?? 0,
      monthSpendUsd: parsed.monthSpendUsd ?? 0,
      monthCoveredUsd: parsed.monthCoveredUsd ?? 0,
    };
  } catch {
    return emptyLedger();
  }
}

function emptyBonus(): BrowserBonus {
  return { code: "", grants: [], poolDay: "", poolUsed: 0 };
}

function parseBonus(raw: string | null): BrowserBonus {
  if (!raw) return emptyBonus();
  try {
    const parsed = JSON.parse(raw) as BrowserBonus;
    if (!parsed || typeof parsed !== "object") return emptyBonus();
    return { ...emptyBonus(), ...parsed, grants: parsed.grants ?? [] };
  } catch {
    return emptyBonus();
  }
}

function tokensMatch(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function monthKey(now: Date): string {
  return capDay(now).slice(0, 7);
}

function rollMonth(ledger: Ledger, month: string): void {
  if (ledger.month === month) return;
  ledger.month = month;
  ledger.monthSpendUsd = 0;
  ledger.monthCoveredUsd = 0;
}

function liveGrants(grants: BonusGrant[], now: Date): BonusGrant[] {
  const iso = now.toISOString();
  return grants.filter((grant) => grant.remaining > 0 && (!grant.expiresAt || grant.expiresAt > iso));
}

function bonusRemaining(bonus: BrowserBonus, now: Date): number {
  return liveGrants(bonus.grants, now).reduce((total, grant) => total + grant.remaining, 0);
}

async function readBonus(userId: string): Promise<BrowserBonus> {
  return parseBonus(await readRaw(userDocKey(userId, "bonus")));
}

async function writeBonus(userId: string, bonus: BrowserBonus): Promise<void> {
  await writeRaw(userDocKey(userId, "bonus"), JSON.stringify(bonus));
}

async function readClaims(): Promise<ClaimIndex> {
  const raw = await readRaw(CLAIM_KEY);
  if (!raw) return { codes: {} };
  try {
    const parsed = JSON.parse(raw) as ClaimIndex;
    return { codes: parsed.codes ?? {} };
  } catch {
    return { codes: {} };
  }
}

async function writeClaims(index: ClaimIndex): Promise<void> {
  await writeRaw(CLAIM_KEY, JSON.stringify(index));
}

export function kofiTokenMatches(provided: string): boolean {
  return tokensMatch(provided, process.env.PRIZE_SCOUT_KOFI_VERIFICATION_TOKEN?.trim() ?? "");
}

export async function browserClaimCode(userId: string): Promise<string> {
  return withLock(async () => {
    const bonus = await readBonus(userId);
    if (bonus.code) return bonus.code;
    const code = newClaimCode();
    bonus.code = code;
    await writeBonus(userId, bonus);
    const claims = await readClaims();
    claims.codes[code] = userId;
    await writeClaims(claims);
    return code;
  });
}

function addGrant(bonus: BrowserBonus, searches: number, now: Date): void {
  if (searches < 1) return;
  const days = bonusExpiryDays();
  const expiresAt = days ? new Date(now.getTime() + days * 86_400_000).toISOString() : null;
  bonus.grants = [...liveGrants(bonus.grants, now), { remaining: searches, expiresAt }];
}

function creditMatched(ledger: Ledger, bonus: BrowserBonus, donor: number, pool: number, now: Date): void {
  addGrant(bonus, donor, now);
  ledger.poolSearches += pool;
}

export interface WebhookResult {
  ok: boolean;
  status: number;
  duplicate?: boolean;
  matched?: boolean;
  ignored?: boolean;
}

export async function acceptKofiWebhook(payload: {
  verificationToken: string;
  messageId: string;
  amount: string;
  currency: string;
  email: string;
  message: string;
  type: string;
  now?: Date;
}): Promise<WebhookResult> {
  if (!kofiTokenMatches(payload.verificationToken)) return { ok: false, status: 401 };
  const messageId = payload.messageId.trim();
  if (!messageId) return { ok: false, status: 400 };
  return withLock(async () => {
    const now = payload.now ?? new Date();
    const ledger = parseLedger(await readRaw(LEDGER_KEY));
    if (ledger.seen.includes(messageId)) return { ok: true, status: 200, duplicate: true };
    ledger.seen.push(messageId);
    const type = payload.type.trim().toLowerCase();
    if (type && type !== "donation") {
      await writeRaw(LEDGER_KEY, JSON.stringify(ledger));
      return { ok: true, status: 200, ignored: true };
    }
    const amount = Number(payload.amount);
    const currency = (payload.currency || "USD").toUpperCase();
    const usd = currency === "USD" && Number.isFinite(amount) ? amount : 0;
    const split = splitDonation(usd, costPerSearchUsd(), donorShare());
    const codes = codesInMessage(payload.message || "");
    const claims = await readClaims();
    const matchedCode = codes.find((code) => claims.codes[code]);
    const browserId = matchedCode ? claims.codes[matchedCode] : null;
    const record: DonationRecord = {
      messageId,
      at: now.toISOString(),
      amount: payload.amount,
      currency,
      searches: split.total,
      donorSearches: browserId ? split.donor : 0,
      poolSearches: browserId ? split.pool : split.total,
      matched: Boolean(browserId),
      browserId,
      emailHash: hashDonorEmail(payload.email || "", ledger.salt),
      codes,
    };
    if (browserId) {
      const bonus = await readBonus(browserId);
      creditMatched(ledger, bonus, split.donor, split.pool, now);
      await writeBonus(browserId, bonus);
    } else {
      ledger.poolSearches += split.total;
    }
    ledger.records.push(record);
    await writeRaw(LEDGER_KEY, JSON.stringify(ledger));
    return { ok: true, status: 200, matched: record.matched };
  });
}

/** Attaches unmatched donations that named this code. The code is stored; the message is not. */
export async function claimDonations(userId: string, code: string, now = new Date()): Promise<{ claimed: number; bonus: number }> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) return { claimed: 0, bonus: 0 };
  return withLock(async () => {
    const claims = await readClaims();
    const owner = claims.codes[normalized];
    if (owner && owner !== userId) return { claimed: 0, bonus: 0 };
    if (!owner) {
      claims.codes[normalized] = userId;
      await writeClaims(claims);
    }
    const ledger = parseLedger(await readRaw(LEDGER_KEY));
    const bonus = await readBonus(userId);
    if (!bonus.code) bonus.code = normalized;
    let claimed = 0;
    for (const record of ledger.records) {
      if (record.matched || !record.codes.includes(normalized)) continue;
      const donor = Math.floor(record.searches * donorShare() + 1e-9);
      const movable = Math.min(donor, ledger.poolSearches);
      record.matched = true;
      record.browserId = userId;
      record.donorSearches = movable;
      record.poolSearches = record.searches - movable;
      ledger.poolSearches -= movable;
      addGrant(bonus, movable, now);
      claimed += 1;
    }
    await writeBonus(userId, bonus);
    await writeRaw(LEDGER_KEY, JSON.stringify(ledger));
    return { claimed, bonus: bonusRemaining(bonus, now) };
  });
}

export async function drawExtraSearch(userId: string, day: string, now = new Date()): Promise<SearchFunding | null> {
  return withLock(async () => {
    const ledger = parseLedger(await readRaw(LEDGER_KEY));
    rollMonth(ledger, monthKey(now));
    if (ceilingBlocksPool(ledger.monthSpendUsd, monthlyCeilingUsd())) {
      const bonus = await readBonus(userId);
      const grants = liveGrants(bonus.grants, now);
      const grant = grants.find((item) => item.remaining > 0);
      if (!grant) return null;
      grant.remaining -= 1;
      bonus.grants = grants;
      await writeBonus(userId, bonus);
      return "bonus";
    }
    const bonus = await readBonus(userId);
    const grants = liveGrants(bonus.grants, now);
    const grant = grants.find((item) => item.remaining > 0);
    if (grant) {
      grant.remaining -= 1;
      bonus.grants = grants;
      await writeBonus(userId, bonus);
      return "bonus";
    }
    const poolUsed = bonus.poolDay === day ? bonus.poolUsed : 0;
    if (ledger.poolSearches < 1 || poolUsed >= poolDailyCap()) return null;
    ledger.poolSearches -= 1;
    bonus.poolDay = day;
    bonus.poolUsed = poolUsed + 1;
    bonus.grants = grants;
    await writeRaw(LEDGER_KEY, JSON.stringify(ledger));
    await writeBonus(userId, bonus);
    return "pool";
  });
}

export async function noteSearchSpend(now: Date, source: SearchFunding): Promise<void> {
  const cost = costPerSearchUsd();
  await withLock(async () => {
    const ledger = parseLedger(await readRaw(LEDGER_KEY));
    rollMonth(ledger, monthKey(now));
    ledger.monthSpendUsd = Math.round((ledger.monthSpendUsd + cost) * 10000) / 10000;
    if (source === "bonus" || source === "pool") {
      ledger.monthCoveredUsd = Math.round((ledger.monthCoveredUsd + cost) * 10000) / 10000;
    }
    await writeRaw(LEDGER_KEY, JSON.stringify(ledger));
  });
}

export interface PublicMeter {
  coveredUsd: number;
  budgetUsd: number;
  bonus: number;
  claimCode: string;
  donationUrl: string;
  poolSearches: number;
}

export async function publicMeter(userId: string, now = new Date()): Promise<PublicMeter> {
  const ledger = parseLedger(await readRaw(LEDGER_KEY));
  rollMonth(ledger, monthKey(now));
  const bonus = await readBonus(userId);
  const code = bonus.code || (await browserClaimCode(userId));
  const ceiling = monthlyCeilingUsd();
  return {
    coveredUsd: ledger.monthCoveredUsd,
    budgetUsd: ceiling ?? ledger.monthSpendUsd,
    bonus: bonusRemaining(bonus, now),
    claimCode: code,
    donationUrl: process.env.PRIZE_SCOUT_DONATION_URL?.trim() ?? "",
    poolSearches: ledger.poolSearches,
  };
}

export interface OwnerDonation {
  at: string;
  amount: string;
  currency: string;
  matched: boolean;
  browserId: string | null;
}

export async function ownerDonationView(): Promise<{ donations: OwnerDonation[]; poolSearches: number; monthSpendUsd: number; monthCoveredUsd: number }> {
  const ledger = parseLedger(await readRaw(LEDGER_KEY));
  return {
    donations: ledger.records.map((record) => ({
      at: record.at,
      amount: record.amount,
      currency: record.currency,
      matched: record.matched,
      browserId: record.browserId,
    })),
    poolSearches: ledger.poolSearches,
    monthSpendUsd: ledger.monthSpendUsd,
    monthCoveredUsd: ledger.monthCoveredUsd,
  };
}

export function resetDonationsForTests(): void {
  chain = Promise.resolve();
}
