import { sha256Hex } from "./sha256";

export const DEFAULT_COST_PER_SEARCH_USD = 0.025;
export const DEFAULT_DONOR_SHARE = 0.5;
export const DEFAULT_POOL_DAILY_CAP = 10;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function costPerSearchUsd(): number {
  const raw = Number(process.env.PRIZE_SCOUT_COST_PER_SEARCH_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COST_PER_SEARCH_USD;
}

export function donorShare(): number {
  const raw = process.env.PRIZE_SCOUT_DONOR_SHARE?.trim();
  if (!raw) return DEFAULT_DONOR_SHARE;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_DONOR_SHARE;
  return Math.min(1, Math.max(0, value));
}

export function poolDailyCap(): number {
  const raw = process.env.PRIZE_SCOUT_POOL_DAILY_CAP?.trim();
  if (!raw) return DEFAULT_POOL_DAILY_CAP;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_POOL_DAILY_CAP;
  return Math.floor(value);
}

export function monthlyCeilingUsd(): number | null {
  const raw = process.env.PRIZE_SCOUT_MONTHLY_CEILING_USD?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function bonusExpiryDays(): number | null {
  const raw = process.env.PRIZE_SCOUT_BONUS_EXPIRY_DAYS?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

/** Whole searches a donation can fund. A shortfall does not round up. */
export function searchesFromAmount(amountUsd: number, cost = costPerSearchUsd()): number {
  if (!(amountUsd > 0) || !(cost > 0)) return 0;
  return Math.floor(amountUsd / cost + 1e-9);
}

export function splitDonation(amountUsd: number, cost = costPerSearchUsd(), share = donorShare()): { total: number; donor: number; pool: number } {
  const total = searchesFromAmount(amountUsd, cost);
  const donor = Math.floor(total * share + 1e-9);
  return { total, donor, pool: total - donor };
}

export function newClaimCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function codesInMessage(message: string): string[] {
  const found = message.toUpperCase().match(/\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/g) ?? [];
  return [...new Set(found)];
}

export function hashDonorEmail(email: string, salt: string): string | null {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@")) return null;
  return sha256Hex(`${salt}\n${cleaned}`);
}

export function meterLine(coveredUsd: number, budgetUsd: number): string {
  const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `This month: ${money(coveredUsd)} of ${money(budgetUsd)} search costs covered by donations`;
}

export type SearchFunding = "free" | "bonus" | "pool";

export function ceilingBlocksPool(monthSpendUsd: number, ceiling: number | null): boolean {
  return ceiling !== null && monthSpendUsd >= ceiling;
}
