/** Stored prize text stops here. Longer pages keep this much and say the rest is on the official page. */
export const PRIZE_DESCRIPTION_LIMIT = 12_000;

export const PRIZE_DESCRIPTION_NOT_CAPTURED = "Prize description not captured on this page.";

export const PRIZE_DESCRIPTION_REMAINDER =
  "Long description from the official page; the remainder is on the official page.";

export interface ObservedImage {
  url: string;
  alt: string | null;
  caption: string | null;
  evidenceUrl: string;
}
