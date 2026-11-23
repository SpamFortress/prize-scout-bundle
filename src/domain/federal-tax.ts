/**
 * Ordinary income tax for taxable years beginning in 2026.
 * Figures are copied from IRS Rev. Proc. 2025-32, section 3.01, Tables 1–4,
 * and the standard deduction amounts in section 3.14.
 * https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 * A rate that is not in that revenue procedure is not in this file.
 */

export const FEDERAL_TAX_YEAR = 2026;

export const FEDERAL_TAX_CITATION =
  "IRS Rev. Proc. 2025-32 (taxable years beginning in 2026), https://www.irs.gov/pub/irs-drop/rp-25-32.pdf";

export type FederalFilingStatus = "joint" | "head" | "single" | "separate";

interface TaxRow {
  /** Null on the top bracket. */
  notOver: number | null;
  /** Dollars, including the half-dollar amounts the revenue procedure prints. */
  base: number;
  rate: number;
  over: number;
}

interface StatusTable {
  label: string;
  section: string;
  standardDeduction: number;
  rows: TaxRow[];
}

export const FEDERAL_2026: Record<FederalFilingStatus, StatusTable> = {
  joint: {
    label: "Married individuals filing joint returns and surviving spouses",
    section: "Table 1, §1(j)(2)(A)",
    standardDeduction: 32_200,
    rows: [
      { notOver: 24_800, base: 0, rate: 0.1, over: 0 },
      { notOver: 100_800, base: 2_480, rate: 0.12, over: 24_800 },
      { notOver: 211_400, base: 11_600, rate: 0.22, over: 100_800 },
      { notOver: 403_550, base: 35_932, rate: 0.24, over: 211_400 },
      { notOver: 512_450, base: 82_048, rate: 0.32, over: 403_550 },
      { notOver: 768_700, base: 116_896, rate: 0.35, over: 512_450 },
      { notOver: null, base: 206_583.5, rate: 0.37, over: 768_700 },
    ],
  },
  head: {
    label: "Heads of households",
    section: "Table 2, §1(j)(2)(B)",
    standardDeduction: 24_150,
    rows: [
      { notOver: 17_700, base: 0, rate: 0.1, over: 0 },
      { notOver: 67_450, base: 1_770, rate: 0.12, over: 17_700 },
      { notOver: 105_700, base: 7_740, rate: 0.22, over: 67_450 },
      { notOver: 201_750, base: 16_155, rate: 0.24, over: 105_700 },
      { notOver: 256_200, base: 39_207, rate: 0.32, over: 201_750 },
      { notOver: 640_600, base: 56_631, rate: 0.35, over: 256_200 },
      { notOver: null, base: 191_171, rate: 0.37, over: 640_600 },
    ],
  },
  single: {
    label: "Unmarried individuals (other than surviving spouses and heads of households)",
    section: "Table 3, §1(j)(2)(C)",
    standardDeduction: 16_100,
    rows: [
      { notOver: 12_400, base: 0, rate: 0.1, over: 0 },
      { notOver: 50_400, base: 1_240, rate: 0.12, over: 12_400 },
      { notOver: 105_700, base: 5_800, rate: 0.22, over: 50_400 },
      { notOver: 201_775, base: 17_966, rate: 0.24, over: 105_700 },
      { notOver: 256_225, base: 41_024, rate: 0.32, over: 201_775 },
      { notOver: 640_600, base: 58_448, rate: 0.35, over: 256_225 },
      { notOver: null, base: 192_979.25, rate: 0.37, over: 640_600 },
    ],
  },
  separate: {
    label: "Married individuals filing separate returns",
    section: "Table 4, §1(j)(2)(D)",
    standardDeduction: 16_100,
    rows: [
      { notOver: 12_400, base: 0, rate: 0.1, over: 0 },
      { notOver: 50_400, base: 1_240, rate: 0.12, over: 12_400 },
      { notOver: 105_700, base: 5_800, rate: 0.22, over: 50_400 },
      { notOver: 201_775, base: 17_966, rate: 0.24, over: 105_700 },
      { notOver: 256_225, base: 41_024, rate: 0.32, over: 201_775 },
      { notOver: 384_350, base: 58_448, rate: 0.35, over: 256_225 },
      { notOver: null, base: 103_291.75, rate: 0.37, over: 384_350 },
    ],
  },
};

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

/** Tax in cents on a taxable-income amount. Does not subtract the standard deduction. */
export function federalIncomeTaxCents(taxableIncomeDollars: number, status: FederalFilingStatus = "single"): number | null {
  if (!Number.isFinite(taxableIncomeDollars) || taxableIncomeDollars < 0) return null;
  if (taxableIncomeDollars === 0) return 0;
  const table = FEDERAL_2026[status];
  const row = table.rows.find((item) => item.notOver === null || taxableIncomeDollars <= item.notOver);
  if (!row) return null;
  const excessCents = dollarsToCents(taxableIncomeDollars) - dollarsToCents(row.over);
  return dollarsToCents(row.base) + Math.round(excessCents * row.rate);
}

export function formatUsdFromCents(cents: number): string {
  const hasCents = cents % 100 !== 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
}
