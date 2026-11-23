export const CASH_OPTION = "Cash option available";
export const SPONSOR_CASH = "Sponsor may substitute cash";
export const CASH_MENTIONED = "Cash alternative mentioned in rules";

export type CashChoice = "winner" | "sponsor" | "both" | "unspecified";

export interface CashNote {
  label: typeof CASH_OPTION | typeof SPONSOR_CASH | typeof CASH_MENTIONED;
  tone: "positive" | "neutral";
}

const WINNER =
  /winner(?:'s|s)?\s+(?:choice|option|election)|winner\s+may\s+(?:take|choose|elect|select)|at\s+the\s+winner'?s\s+(?:option|discretion|election)|not\s+taking\s+the\s+cash\s+alternative/i;
const SPONSOR =
  /sponsor\s+(?:may|can|reserves?)|at\s+(?:the\s+|its\s+)?sponsor'?s\s+discretion|contingent\s+cash\s+alternative|if\s+(?:the\s+)?(?:sponsor|we)\s+(?:cannot|can't|can not|(?:is|are)\s+unable)/i;
const MENTION = /\bcash\s+alternative\b|\bor\s+\$[\d,]+(?:\.\d+)?\s+cash\b/i;
const NEGATIVE = /\bno\s+cash\s+alternative\b|\bno\s+cash\s+component\b/i;

/** Reads a rules or prize sentence. “Plus cash” is not an alternative. */
export function cashNotesFromText(text: string): CashNote[] {
  const winner = WINNER.test(text);
  const sponsor = SPONSOR.test(text);
  const mentioned = MENTION.test(text);
  if (!winner && !sponsor && NEGATIVE.test(text)) return [];
  return notesFromFlags(winner, sponsor, mentioned && !winner && !sponsor);
}

export function cashNotesFromChoice(choice: CashChoice | null): CashNote[] {
  if (choice === "winner") return notesFromFlags(true, false, false);
  if (choice === "sponsor") return notesFromFlags(false, true, false);
  if (choice === "both") return notesFromFlags(true, true, false);
  if (choice === "unspecified") return notesFromFlags(false, false, true);
  return [];
}

export function mergeCashNotes(left: readonly CashNote[], right: readonly CashNote[]): CashNote[] {
  return notesFromFlags(
    left.concat(right).some((note) => note.label === CASH_OPTION),
    left.concat(right).some((note) => note.label === SPONSOR_CASH),
    left.concat(right).some((note) => note.label === CASH_MENTIONED),
  );
}

function notesFromFlags(winner: boolean, sponsor: boolean, mentioned: boolean): CashNote[] {
  const notes: CashNote[] = [];
  if (winner) notes.push({ label: CASH_OPTION, tone: "positive" });
  if (sponsor) notes.push({ label: SPONSOR_CASH, tone: "neutral" });
  if (!winner && !sponsor && mentioned) notes.push({ label: CASH_MENTIONED, tone: "neutral" });
  return notes;
}
