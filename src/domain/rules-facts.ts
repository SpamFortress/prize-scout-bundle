import { statedEndIso } from "./dates";
import { statedDealerPickup, statedMinAge } from "./eligibility-tags";
import { US_STATES } from "./geo";
import { US_STATE_NAMES } from "./us-states";
import type { MailAmoe, MailInFacts, RuleFrequency, RulesFacts } from "./types";

const NAMES = [...US_STATE_NAMES].sort((a, b) => b[1].length - a[1].length);

const EXCLUSION = /\b(void in|excluding|excluded|except(?:ing)?|not open to|not available to|ineligible)\b/i;
const WORD_CODES = new Set(["OR", "IN", "ME", "HI", "OK"]);
/** Lower 48 plus the District of Columbia. Alaska, Hawaii, and territories are not in this set. */
const LOWER_48_AND_DC = US_STATE_NAMES.map(([code]) => code).filter((code) => code !== "AK" && code !== "HI");
const CONTIGUOUS_US = /\b(?:(?:forty[-\s]?eight|48)\s*(?:\(\s*48\s*\)\s*)?contiguous(?:\s+(?:united\s+states|states|u\.s\.))?|contiguous\s+(?:united\s+states|u\.s\.)|continental\s+(?:united\s+states|u\.?s\.?))\b/i;
/** All 50 states. The District of Columbia is added only when the sentence names it. */
const FIFTY_STATES = /\b(?:the\s+)?(?:50|fifty)\s+united\s+states\b|\ball\s+50\s+(?:u\.?s\.?\s+)?states\b/i;
const FIFTY_STATE_CODES = US_STATE_NAMES.map(([code]) => code).filter((code) => code !== "DC");

/** Layout text for the card preview. Not a sponsor and not a listing. */
export const MAIL_CARD_LAYOUT_TEXT =
  "No purchase necessary. For a mail-in entry, handwrite your name, address, city, state, and ZIP code on a 3x5 card and mail it to: Prize Scout Fixture, 1 Rules Fixture Road, Boise, ID 00000.";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function quote(line: string | undefined): string | null {
  if (!line) return null;
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

function statesNamed(sentence: string): string[] {
  const found: string[] = [];
  for (const [code, name] of NAMES) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(sentence) && !found.includes(code)) found.push(code);
  }
  return found;
}

/** "Washington, D.C." is the District, not the state of Washington. */
function withoutDcAsWashington(sentence: string): string {
  return sentence.replace(/\bwashington,?\s+d\.?\s*c\.?\b/gi, "the District of Columbia");
}

function statesCoded(sentence: string): string[] {
  if (!EXCLUSION.test(sentence) && !/\bonly\b/i.test(sentence)) return [];
  const found: string[] = [];
  for (const match of sentence.matchAll(/\b([A-Z]{2})\b(?!\s*\d{5})/g)) {
    const code = match[1];
    if (!Object.prototype.hasOwnProperty.call(US_STATES, code)) continue;
    if (WORD_CODES.has(code)) {
      const around = sentence.slice(Math.max(0, (match.index ?? 0) - 24), (match.index ?? 0) + code.length + 8);
      const listed = /(?:,|&|and)\s*[A-Z]{2}\b/.test(around) || statesNamed(sentence).length > 0;
      if (!listed) continue;
    }
    if (!found.includes(code)) found.push(code);
  }
  return found;
}

function exclusionClause(line: string, match: RegExpExecArray): string {
  const after = line.slice(match.index + match[0].length);
  const stop = after.search(/\b(?:open only to|only open to|limited to|contiguous|continental|(?:50|fifty)\s+united\s+states)\b/i);
  return stop >= 0 ? after.slice(0, stop) : after;
}

/** A sponsor or administrator mailing address is not an eligibility list. */
function withoutSponsorAddresses(sentence: string): string {
  return sentence.replace(/\b(?:sponsor(?:ed by)?|administrator|administered by)\b[^.]{0,180}/gi, (clause) =>
    clause.replace(/,\s*[A-Z]{2}\b/g, "").replace(/\b(?:El Segundo|New York|California)\b/gi, ""),
  );
}

function frequencyOf(text: string): { frequency: RuleFrequency; quote: string | null } {
  const lines = sentences(text);
  const daily = lines.find((line) => /per day|once (?:per |a )?day|daily/i.test(line));
  if (daily) return { frequency: "daily", quote: quote(daily) };
  const weekly = lines.find((line) => /per week|once (?:per |a )?week|weekly/i.test(line));
  if (weekly) return { frequency: "weekly", quote: quote(weekly) };
  const once = lines.find((line) => /one entry per|only one entry|limit of one entry|single entry/i.test(line));
  if (once) return { frequency: "once", quote: quote(once) };
  return { frequency: "unstated", quote: null };
}

function ageOf(text: string): { minAge: number | null; quote: string | null } {
  const stated = statedMinAge(text);
  return { minAge: stated.age, quote: stated.quote };
}

function endOf(text: string): string | null {
  const match = /(?:ends|ended|ending|deadline|closes|closing date|received by|through|until)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(text);
  return match?.[1] ?? statedEndIso(text);
}

function countriesOf(text: string): string[] {
  if (/legal residents of the (?:50 )?(?:united states|u\.s\.a\.|u\.s\.)|u\.s\. residents only|united states only/i.test(text)) return ["US"];
  if (/\bopen worldwide\b|\bworldwide\b/i.test(text)) return ["*"];
  return [];
}

function eligibilityOf(text: string): { included: string[]; excluded: string[]; quote: string | null } {
  const included = new Set<string>();
  const excluded = new Set<string>();
  let kept: string | null = null;
  const flat = text.replace(/\s*\n\s*/g, " ");
  for (const rawLine of sentences(flat)) {
    const line = withoutSponsorAddresses(withoutDcAsWashington(rawLine));
    const cueLine = line.replace(/\b(?:void|except) where prohibited\b/gi, "");
    const inclusionMatch = /\b(open only to|only open to|limited to (?:legal )?residents of)\b/i.exec(line);
    const exclusionMatch = EXCLUSION.exec(cueLine);
    const contiguous = CONTIGUOUS_US.test(line);
    const fifty = FIFTY_STATES.test(line);
    if (!inclusionMatch && !exclusionMatch && !contiguous && !fifty) continue;
    if (contiguous || fifty) {
      kept = kept ?? quote(rawLine);
      const open = fifty ? FIFTY_STATE_CODES : LOWER_48_AND_DC;
      for (const code of open) included.add(code);
      if (/\bdistrict of columbia\b|\bd\.?\s*c\.?\b/i.test(line)) included.add("DC");
      if (exclusionMatch) {
        const clause = `${exclusionMatch[0]} ${exclusionClause(cueLine, exclusionMatch)}`;
        const territoryOnly = /\b(?:puerto rico|territor(?:y|ies)|guam|virgin islands)\b/i.test(clause) && statesNamed(clause).length === 0;
        if (!territoryOnly) {
          for (const code of [...statesNamed(clause), ...statesCoded(clause)]) excluded.add(code);
        }
      }
      continue;
    }
    const exclusionOnly = Boolean(exclusionMatch) && !inclusionMatch;
    const clause = exclusionOnly && exclusionMatch ? `${exclusionMatch[0]} ${exclusionClause(cueLine, exclusionMatch)}` : line;
    if (exclusionOnly && /\b(?:puerto rico|territor(?:y|ies)|guam|virgin islands)\b/i.test(clause) && statesNamed(clause).length === 0) continue;
    const named = statesNamed(clause);
    const coded = statesCoded(clause);
    let states = [...named, ...coded.filter((code) => !named.includes(code))];
    if (states.length > 20) {
      const cue = exclusionMatch ?? inclusionMatch;
      const window = line.slice(cue?.index ?? 0, (cue?.index ?? 0) + 160);
      const nearNamed = statesNamed(window);
      const nearCoded = statesCoded(window);
      states = [...nearNamed, ...nearCoded.filter((code) => !nearNamed.includes(code))];
    }
    if (states.length === 0) continue;
    kept = kept ?? quote(rawLine);
    const namedAreOpen = Boolean(inclusionMatch) && /\ball others\b|\bare ineligible\b/i.test(line);
    for (const code of states) {
      if (exclusionMatch && !namedAreOpen) excluded.add(code);
      else included.add(code);
    }
  }
  for (const code of excluded) included.delete(code);
  return { included: [...included], excluded: [...excluded], quote: kept };
}

function automationOf(text: string): { prohibited: boolean; quote: string | null } {
  const lines = sentences(text);
  const line = lines.find((item) =>
    /automated entries?(?: \w+){0,6} (?:not allowed|prohibited|void|disqualified)|no automated entries|scripted entries are (?:void|prohibited)|use of (?:bots|scripts|macros) is (?:prohibited|not allowed)/i.test(
      item,
    ),
  );
  return { prohibited: Boolean(line), quote: quote(line) };
}

const FIELD_RULES: Array<[string, RegExp]> = [
  ["Name", /\bname\b/i],
  ["Address", /\baddress\b/i],
  ["City", /\bcity\b/i],
  ["State", /\bstate\b/i],
  ["ZIP code", /\bzip\b/i],
  ["Phone", /\bphone\b/i],
  ["Email", /\bemail\b/i],
];

function mailOf(text: string): { offered: boolean; card: MailInFacts | null } {
  const offered = /mail-?in|alternate method of entry|\bAMOE\b|3\s*[x×]\s*5|postcard/i.test(text);
  if (!offered) return { offered: false, card: null };
  const match = /(?:mail(?:ing)? address|mail (?:it|the card|the postcard|your entry) to)\s*:?\s*([^\n]{8,180})/i.exec(text);
  if (!match) return { offered: true, card: null };
  let chunk = match[1].replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const stop = chunk.search(/\b(include|handwrite|print your|postage|limit|one entry)\b/i);
  if (stop > 12) chunk = chunk.slice(0, stop).trim().replace(/[,:\s]+$/, "");
  if (chunk.length < 8) return { offered: true, card: null };
  const parts = chunk.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  const addressLines = (parts.length >= 2 ? parts : [chunk]).slice(0, 6);
  const mailLines = sentences(text).filter((line) => /mail-?in|3\s*[x×]\s*5|postcard|handwrite|handwritten/i.test(line));
  const blob = mailLines.join(" ");
  const requiredFields = FIELD_RULES.filter(([, pattern]) => pattern.test(blob)).map(([label]) => label);
  return { offered: true, card: { addressLines, requiredFields } };
}

function mailAmoeOf(text: string, mail: { offered: boolean; card: MailInFacts | null }): MailAmoe | null {
  if (!mail.offered) return null;
  const cardSize = /3\s*[x×]\s*5(?:\s*(?:inch|in)?\s*card)?/i.exec(text)?.[0]?.replace(/\s+/g, " ").trim()
    ?? (/4\s*[x×]\s*6/i.exec(text)?.[0]?.replace(/\s+/g, " ").trim() ?? null)
    ?? (/\bpostcard\b/i.test(text) ? "postcard" : null)
    ?? (/\bindex card\b/i.test(text) ? "index card" : null);
  const dated = (label: string) => new RegExp(`${label}(?:\\s+by)?\\s+([A-Z][a-z]+\\s+\\d{1,2},\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`, "i").exec(text)?.[1] ?? null;
  const limitMatch = /(?:limit of \d+\s+mail-?in entries|one mail-?in entry per [^.]{0,40}|one entry per person)/i.exec(text)?.[0] ?? null;
  const addressLines = mail.card?.addressLines ?? [];
  if (addressLines.length === 0 && !cardSize && !dated("postmarked") && !dated("received") && !limitMatch) return null;
  return {
    addressLines,
    cardSize,
    postmarkBy: dated("postmarked"),
    receivedBy: dated("received"),
    entryLimit: limitMatch ? limitMatch.replace(/\s+/g, " ").trim() : null,
  };
}

export function extractRulesFacts(text: string): RulesFacts {
  const frequency = frequencyOf(text);
  const age = ageOf(text);
  const dealer = statedDealerPickup(text);
  const eligibility = eligibilityOf(text);
  const automation = automationOf(text);
  const mail = mailOf(text);
  const countries = countriesOf(text);
  return {
    frequency: frequency.frequency,
    frequencyQuote: frequency.quote,
    minAge: age.minAge,
    ageQuote: age.quote,
    endDateText: endOf(text),
    countries,
    includedStates: eligibility.included,
    excludedStates: eligibility.excluded,
    eligibilityQuote: eligibility.quote,
    automationProhibited: automation.prohibited,
    automationQuote: automation.quote,
    purchaseRequired: /purchase (?:is )?required|purchase necessary/i.test(text) && !/no purchase necessary/i.test(text),
    freeEntryStated: /no purchase\b[\s\S]{0,80}\b(?:necessary|needed)\b/i.test(text),
    mailOffered: mail.offered,
    mailIn: mail.card,
    mailAmoe: mailAmoeOf(text, mail),
    verificationBlock: /captcha|verify you are human/i.test(text) ? "captcha" : /\b(?:log ?in|sign in)\b/i.test(text) ? "login" : null,
    dealerPickup: dealer.required,
    dealerPickupQuote: dealer.quote,
  };
}

function hasEligibility(facts: RulesFacts): boolean {
  return facts.minAge !== null || facts.countries.length > 0 || facts.includedStates.length > 0 || facts.excludedStates.length > 0 || Boolean(facts.eligibilityQuote);
}

function hasSponsor(text: string): boolean {
  return /\b(?:sponsored by|the sponsor is|sponsor:)\s+\S/i.test(text);
}

/** Eligibility plus a free-entry or sponsor line, even when the end date is missing. */
export function rulesBodyIsPresent(facts: RulesFacts | undefined, text = ""): boolean {
  if (!facts || !hasEligibility(facts)) return false;
  return facts.freeEntryStated || hasSponsor(text);
}

/** Verified needs a real end date plus a free-entry line, or a sponsor with eligibility. One stray date is not enough. */
export function rulesContentIsReal(facts: RulesFacts | undefined, text = ""): boolean {
  if (!facts?.endDateText) return false;
  if (facts.freeEntryStated) return true;
  return hasEligibility(facts) && hasSponsor(text);
}

/** Enough of the rules was read to decide the Enter label. Silence on one line does not count as a prohibition. */
export function rulesFactsAreSufficient(facts: RulesFacts | undefined): boolean {
  if (!facts) return false;
  return (
    facts.frequency !== "unstated" ||
    facts.minAge !== null ||
    Boolean(facts.endDateText) ||
    facts.excludedStates.length > 0 ||
    facts.includedStates.length > 0 ||
    facts.countries.length > 0 ||
    facts.automationQuote !== null
  );
}

export function mailCardLayoutFixture(): MailInFacts | null {
  return extractRulesFacts(MAIL_CARD_LAYOUT_TEXT).mailIn;
}

const GENERIC_RULE_WORDS = new Set([
  "the", "these", "our", "its", "such", "said", "applicable", "following", "above", "below",
  "see", "read", "view", "click", "here", "please", "review", "full", "complete", "entire",
  "whole", "current", "online", "official", "rules", "rule", "sweepstakes", "contest",
  "promotion", "giveaway", "entry", "entries", "details", "and", "for", "this", "that",
  "your", "their", "with", "from", "into", "acceptance", "agreement", "unconditional",
  "participant", "participants", "reference", "currency", "expressed",
  "accept", "cookie", "cookies", "privacy", "banner", "how",
]);

function ruleTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_RULE_WORDS.has(token));
}

function rulesSubstance(text: string): boolean {
  return /no purchase necessary|void in|open to|sponsor|eligib/i.test(text);
}

/**
 * Two competing Official Rules documents on one giveaway page.
 * A nav link, a footer, a repeated heading, the same text twice, a cookie banner,
 * or a stack of archived rules does not count. Returns the block whose title matches
 * the page, or ambiguous when the two titles cannot be told apart.
 */
export function chooseOnPageRules(text: string, pageTitle: string, now: Date = new Date()): { ambiguous: boolean; text: string | null; title: string | null } {
  const marks = [...text.matchAll(/([A-Za-z0-9$][^.\n]{2,60}?)\s+official rules\b\s*["']?\s*(?=[.!:\n]|$)/gi)];
  const blocks = marks.flatMap((match, index) => {
    const heading = (match[1] ?? "").replace(/\s+/g, " ").trim();
    const tokens = ruleTokens(heading);
    const words = heading.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || words.length > 8) return [];
    const start = match.index ?? 0;
    const end = index + 1 < marks.length ? (marks[index + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end);
    const endIso = statedEndIso(body, now);
    if (!endIso || body.length < 80 || !rulesSubstance(body)) return [];
    return [{ key: tokens.slice().sort().join(" "), tokens, heading, text: body, endIso }];
  });
  const distinct: typeof blocks = [];
  for (const block of blocks) {
    const prior = distinct.find((item) => item.key === block.key);
    if (!prior) distinct.push(block);
    else if (prior.endIso === block.endIso) continue;
    else prior.text = `${prior.text}\n${block.text}`;
  }
  const conflicting = distinct.filter((block, index, all) => all.some((other) => other.endIso !== block.endIso));
  if (conflicting.length !== 2) return { ambiguous: false, text: null, title: null };
  const pageTokens = ruleTokens(pageTitle);
  const scored = conflicting.map((block) => ({
    block,
    score: pageTokens.reduce((sum, token) => sum + (block.tokens.includes(token) ? 1 : 0), 0),
  }));
  const best = Math.max(...scored.map((item) => item.score));
  const winners = scored.filter((item) => item.score === best);
  if (best === 0 || winners.length !== 1) return { ambiguous: true, text: null, title: null };
  return { ambiguous: false, text: winners[0].block.text, title: winners[0].block.heading };
}
