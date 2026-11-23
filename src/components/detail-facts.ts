/** Visible fact line. Blank sample data stays "Not stated" instead of an empty label. */
export function statedValue(value: string | null | undefined): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text || "Not stated";
}

export function statedLine(label: string, value: string | null | undefined): string {
  return `${label}: ${statedValue(value)}`;
}

export interface DetailBrief {
  entryLimit: string | null;
  eligibility: string | null;
  prizeHeading: string;
  prizeBody: string;
  howToEnter: string | null;
  rulesHref: string | null;
}
