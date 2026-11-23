export interface StatedAge {
  age: number | null;
  quote: string | null;
}

export interface StatedDealerPickup {
  required: boolean;
  quote: string | null;
}

function linesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function shortQuote(line: string): string {
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

/** Ages that are real entry minimums. 15+, 36+, 50+, and 80+ are not. */
const ENTRY_AGES = new Set([13, 14, 16, 18, 19, 21]);

/** A minimum age only when an eligibility phrase states one. A bare “15+” is not enough. */
export function statedMinAge(text: string): StatedAge {
  for (const line of linesOf(text)) {
    const match =
      /(?:must be(?:\s+at\s+least)?|at\s+least|older\s+than|minimum\s+age(?:\s+of|\s+is)?|aged)\s+(\d{2})\b/i.exec(line) ??
      /\bage(?:\s+of)?\s+(\d{2})\b(?:\s+or\s+older)?/i.exec(line) ??
      /\b(\d{2})\s+years(?:\s+of\s+age)?\s+or\s+older\b/i.exec(line) ??
      /\(\s*(\d{2})\s*\)\s+years\b/i.exec(line) ??
      /\b(\d{2})\s+or\s+older\b/i.exec(line) ??
      /(?<!\$|\d)(\d{2})\s*\+\s*to\s+enter\b/i.exec(line) ??
      /legal\s+residents\b[^.]{0,120}?(?<!\$|\d)(\d{2})(?:\s*\+(?!\w)|\s+years\b)/i.exec(line);
    if (!match) continue;
    const age = Number(match[1]);
    if (!ENTRY_AGES.has(age)) continue;
    return { age, quote: shortQuote(line) };
  }
  return { age: null, quote: null };
}

/**
 * True only when the rules say the prize is transferred or picked up through a licensed dealer or FFL.
 * A firearm mentioned without that sentence is not enough.
 */
export function statedDealerPickup(text: string): StatedDealerPickup {
  for (const line of linesOf(text)) {
    const ffl = /\bFFL\b|federal firearms licen[sc]ee/i.test(line);
    const licensedTransfer =
      /(?:transfer(?:red)?|pick(?:ed)?\s*up|pickup).{0,80}licensed\s+dealer/i.test(line) ||
      /licensed\s+dealer.{0,80}(?:transfer|pick(?:ed)?\s*up|pickup|\bFFL\b)/i.test(line);
    if (!ffl && !licensedTransfer) continue;
    return { required: true, quote: shortQuote(line) };
  }
  return { required: false, quote: null };
}

export function ageTag(age: number | null): string | null {
  return age === null ? null : `${age}+`;
}

/** Popup sentence. Empty when neither fact was stated. */
export function restrictionsLine(age: StatedAge, dealer: StatedDealerPickup): string | null {
  const parts: string[] = [];
  if (age.age !== null) parts.push(age.quote ?? `Must be ${age.age} or older.`);
  if (dealer.required && dealer.quote) parts.push(dealer.quote);
  return parts.length > 0 ? parts.join(" ") : null;
}
