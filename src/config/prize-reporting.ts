/** IRS information-return threshold for prizes. One place, so the tax screen and the row use the same figure. */

/** Prizes awarded in 2026 or later. IRS 1099-MISC instructions after the OBBBA change. */
export const PRIZE_1099_THRESHOLD_USD = 2_000;

/** Prizes awarded in 2025 or earlier. */
export const PRIZE_1099_LEGACY_THRESHOLD_USD = 600;

export const PRIZE_1099_STILL_TAXABLE = "Prizes under $2,000 are still taxable income; a 1099 just isn't required.";

/** $600 only when the prize year is explicitly 2025 or earlier. A missing year uses the 2026 threshold. */
export function prize1099Threshold(prizeYear: number | null): number {
  if (prizeYear !== null && prizeYear <= 2025) return PRIZE_1099_LEGACY_THRESHOLD_USD;
  return PRIZE_1099_THRESHOLD_USD;
}

export function prize1099Line(prizeYear: number | null): string {
  const amount = prize1099Threshold(prizeYear).toLocaleString("en-US");
  if (prizeYear !== null && prizeYear <= 2025) {
    return `Sponsors issue a 1099 at $${amount} for prizes awarded in ${prizeYear}.`;
  }
  return `Sponsors issue a 1099 at $${amount} for prizes awarded in 2026 or later. ${PRIZE_1099_STILL_TAXABLE}`;
}
