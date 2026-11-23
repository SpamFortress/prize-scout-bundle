import { statedEndIso } from "./dates";

/** Keyword scan of rules text the app already fetched. Nothing here is inferred. */

export const RULES_CHECK_TOTAL = 7;

const DATE = String.raw`(?:[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})`;

export interface RulesChecklist {
  found: number;
  missing: string[];
  registrationNote: string | null;
}

function hasSponsorName(text: string): boolean {
  return /\b(?:sponsored by|sponsor is|the sponsor is)\s+[A-Z0-9]/i.test(text) || /\bSponsor:\s*\S{2,}/i.test(text);
}

function hasMailingAddress(text: string): boolean {
  const street = /\b(?:\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl)|P\.?\s*O\.?\s*Box\s+\d+)/i.test(text);
  const zip = /\b\d{5}(?:-\d{4})?\b/.test(text);
  return street && zip;
}

function hasStartDate(text: string): boolean {
  return new RegExp(String.raw`\b(?:begins|starts|starting|start date|commences)\s+(?:on\s+)?${DATE}`, "i").test(text) || new RegExp(String.raw`\bfrom\s+${DATE}\s+(?:through|to|until)\b`, "i").test(text);
}

function hasEndDate(text: string): boolean {
  return statedEndIso(text) !== null;
}

function sentenceOf(text: string, pattern: RegExp): string | null {
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  const line = parts.find((item) => pattern.test(item));
  if (!line) return null;
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

/** Seven official-rules items. A missing item is named. The count is how many items were present. */
export function scanRulesChecklist(text: string): RulesChecklist {
  const checks: Array<{ ok: boolean; missing: string[] }> = [];
  const sponsor = hasSponsorName(text);
  const address = hasMailingAddress(text);
  checks.push({
    ok: sponsor && address,
    missing: sponsor && address ? [] : [address ? "No sponsor name found" : "No sponsor address found"],
  });
  const free = /no purchase necessary|alternate method of entry|\bAMOE\b|free method of entry|mail-?in entry/i.test(text);
  checks.push({ ok: free, missing: free ? [] : ["No free method of entry found"] });
  const start = hasStartDate(text);
  const end = hasEndDate(text);
  checks.push({
    ok: start && end,
    missing: [...(start ? [] : ["No start date found"]), ...(end ? [] : ["No end date found"])],
  });
  const eligibility = /legal residents|years of age|years or older|\bmust be\s+\d{2}\b|open to residents|eligible residents|void where prohibited/i.test(text);
  checks.push({ ok: eligibility, missing: eligibility ? [] : ["No eligibility found"] });
  const prize = /(?:approximate retail value|\bARV\b|retail value)/i.test(text) && /\b(?:prize|awarded|grand prize)\b/i.test(text);
  checks.push({ ok: prize, missing: prize ? [] : ["No prize value found"] });
  const odds = /odds of (?:winning|being selected|receiving)/i.test(text);
  checks.push({ ok: odds, missing: odds ? [] : ["No odds statement found"] });
  const selection = /random drawing|winners? will be selected|potential winner/i.test(text);
  const notice = /notif(?:y|ied|ication)/i.test(text);
  const list = /winners list|list of winners|request a list of winners/i.test(text);
  const winners = selection && notice && list;
  checks.push({ ok: winners, missing: winners ? [] : ["No winner selection or winners list found"] });
  const registration = /bond(?:ed)?/i.test(text) && /regist/i.test(text) && /new york|florida|rhode island|\bNY\b|\bFL\b|\bRI\b/i.test(text) ? sentenceOf(text, /bond(?:ed)?/i) : null;
  return { found: checks.filter((item) => item.ok).length, missing: checks.flatMap((item) => item.missing), registrationNote: registration };
}

const PAY_TO_COLLECT = [
  /pay (?:the )?(?:shipping|handling)[^.]{0,80}(?:to|before)\s+(?:you\s+)?(?:claim|receive|collect|get|the prize)/i,
  /(?:processing|shipping|handling) fee[^.]{0,80}(?:to|before)\s+(?:you\s+)?(?:claim|receive|collect|release)/i,
  /(?:must|required to) pay[^.]{0,80}(?:fee|shipping|handling|taxes)[^.]{0,40}(?:claim|receive|collect)/i,
  /pay (?:the )?(?:taxes|fees)[^.]{0,40}(?:to )?(?:claim|receive|collect)/i,
  /refundable deposit/i,
  /gift cards? to claim/i,
  /send (?:us )?(?:a )?gift card/i,
  /(?:send|pay|wire).{0,40}(?:bitcoin|crypto(?:currency)?|wire transfer)/i,
  /(?:bitcoin|crypto wallet|wire transfer).{0,40}(?:to claim|required|before)/i,
  /bank login/i,
  /DM (?:us |me )?to claim/i,
  /message us to claim/i,
  /(?:whatsapp|telegram)[^.]{0,50}(?:claim|winner|prize)|(?:claim|message)[^.]{0,30}(?:whatsapp|telegram)/i,
];

/** Winner-responsibility, release, and waiver sentences are ordinary rules, not a demand to pay the sponsor. */
function ordinaryRulesClause(sentence: string): boolean {
  if (/responsible for[^.]{0,160}(?:tax|title|registration|shipping)/i.test(sentence)) return true;
  if (/\b(?:ssn|social security|driver'?s license|w-?9|affidavit)\b/i.test(sentence) && /\b(?:winner|won|delivered|delivery|affidavit|w-?9|tax|irs|reporting)\b/i.test(sentence) && !/pay (?:the )?taxes[^.]{0,40}(?:claim|receive|collect)/i.test(sentence)) return true;
  if (/\b(?:release|waiver|hold harmless)\b/i.test(sentence) && !/pay (?:the )?(?:shipping|a fee|taxes)[^.]{0,40}(?:claim|receive)/i.test(sentence)) return true;
  return false;
}

/** Phrases that make the entrant pay, send a secret, or use a private message to collect a prize. A store purchase entry is not one of these. */
export function scanScamWarning(text: string): string[] {
  const found: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 0);
  for (const sentence of sentences) {
    if (ordinaryRulesClause(sentence)) continue;
    if (!PAY_TO_COLLECT.some((pattern) => pattern.test(sentence))) continue;
    const clipped = sentence.length > 120 ? `${sentence.slice(0, 117)}…` : sentence;
    const lower = clipped.toLowerCase();
    const covering = found.findIndex((item) => item.toLowerCase().includes(lower) || lower.includes(item.toLowerCase()));
    if (covering === -1) found.push(clipped);
    else if (clipped.length > found[covering].length) found[covering] = clipped;
  }
  return found;
}
