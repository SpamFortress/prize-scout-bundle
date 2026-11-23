export type DueProof =
  | {
      proven: true;
      raw: string;
      isoDate: string;
      precision: "day" | "minute";
      timezone: "UTC";
      explicit: true;
      parsedFrom: "iso-date" | "iso-datetime" | "month-name";
    }
  | {
      proven: false;
      reason: "end_date_not_explicit" | "end_date_ambiguous" | "end_date_unparseable";
      raw: string | null;
    };

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function unproven(
  reason: "end_date_not_explicit" | "end_date_ambiguous" | "end_date_unparseable",
  raw: string | null,
): DueProof {
  return { proven: false, reason, raw };
}

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDueDate(input: unknown): DueProof {
  if (input === null || input === undefined) return unproven("end_date_not_explicit", null);
  if (typeof input !== "string") return unproven("end_date_unparseable", null);
  const raw = input.trim();
  if (!raw) return unproven("end_date_not_explicit", "");
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(raw)) return unproven("end_date_ambiguous", raw);

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoDate) {
    const iso = validDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
    if (!iso) return unproven("end_date_unparseable", raw);
    return {
      proven: true,
      raw,
      isoDate: iso,
      precision: "day",
      timezone: "UTC",
      explicit: true,
      parsedFrom: "iso-date",
    };
  }

  const isoDt = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(raw);
  if (isoDt) {
    const iso = validDate(Number(isoDt[1]), Number(isoDt[2]), Number(isoDt[3]));
    const hh = Number(isoDt[4]);
    const mm = Number(isoDt[5]);
    const ss = Number(isoDt[6] ?? "0");
    if (!iso || hh > 23 || mm > 59 || ss > 59) return unproven("end_date_unparseable", raw);
    return {
      proven: true,
      raw,
      isoDate: iso,
      precision: "minute",
      timezone: "UTC",
      explicit: true,
      parsedFrom: "iso-datetime",
    };
  }

  const monthFirst = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(raw);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const iso = month ? validDate(Number(monthFirst[3]), month, Number(monthFirst[2])) : null;
    if (!iso) return unproven("end_date_unparseable", raw);
    return {
      proven: true,
      raw,
      isoDate: iso,
      precision: "day",
      timezone: "UTC",
      explicit: true,
      parsedFrom: "month-name",
    };
  }

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const iso = month ? validDate(Number(dayFirst[3]), month, Number(dayFirst[1])) : null;
    if (!iso) return unproven("end_date_unparseable", raw);
    return {
      proven: true,
      raw,
      isoDate: iso,
      precision: "day",
      timezone: "UTC",
      explicit: true,
      parsedFrom: "month-name",
    };
  }

  return unproven("end_date_unparseable", raw);
}

function fullYear(raw: string): number {
  const year = Number(raw);
  if (raw.length >= 4) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function isoNumeric(month: number, day: number, yearRaw: string): string | null {
  return validDate(fullYear(yearRaw), month, day);
}

function isoMonthPhrase(phrase: string): string | null {
  const proof = parseDueDate(phrase.replace(/\./g, "").replace(/(\d)(?:st|nd|rd|th)\b/i, "$1"));
  return proof.proven ? proof.isoDate : null;
}

/** "Dec 3rd 2026" and "Dec 3rd, 2026" are the calendar day written next to the zone. */
function isoLooseMonth(phrase: string): string | null {
  const strict = isoMonthPhrase(phrase);
  if (strict) return strict;
  const match = /([A-Za-z]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})/i.exec(phrase);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  return month ? validDate(Number(match[3]), month, Number(match[2])) : null;
}

interface EndHit {
  iso: string;
  index: number;
  weight: number;
  /** Interim drawing deadlines are not the sweepstakes end. */
  kind?: "interim" | "overall" | "plain";
}

function rulesTitleYear(text: string): number | null {
  const match = /\b((?:19|20)\d{2})\b[^.]{0,80}\bofficial rules\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

function tagEndHit(text: string, hit: EndHit): EndHit {
  if (hit.kind === "overall") return hit;
  const around = text.slice(Math.max(0, hit.index - 240), hit.index);
  const endsAt = /^ends at\b/i.test(text.slice(hit.index, hit.index + 8));
  const interim = /\b(?:fast\s*entry|early[-\s]?bird|bonus\s+(?:entry|period|prize)|interim|prize\s+period\s*\d|drawing\s+deadline)\b/i.test(around);
  const overall = !interim && (endsAt || /\b(?:sweepstakes\s+entry\s+period|promotion\s+period|official\s+entry\s+period)\b/i.test(around));
  return { ...hit, kind: interim ? "interim" : overall ? "overall" : "plain", weight: interim ? 9 : overall ? -1 : hit.weight };
}

function monthDayParts(phrase: string): { month: number; day: number } | null {
  const match = /([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(phrase);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  if (!month || !validDate(2024, month, day)) return null;
  return { month, day };
}

function yearForMonthDay(month: number, day: number, now: Date, stated: number | null): number | null {
  if (stated && stated >= 1970 && stated <= 2100) return stated;
  const year = now.getUTCFullYear();
  const today = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  const candidate = Date.UTC(year, month - 1, day);
  // A passed month-day with no year is not next year's end date.
  return candidate >= today ? year : null;
}

/** "through December 20" when that phrase ends a promotion. A bare "ends July 1" is not this. */
function promotionThroughHits(text: string, now: Date): EndHit[] {
  const hits: EndHit[] = [];
  const pattern = /\bthrough\s+([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?)(?:,?\s+((?:19|20)\d{2}))?/gi;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const sentenceStart = Math.max(0, text.lastIndexOf(".", index - 1) + 1, text.lastIndexOf("!", index - 1) + 1, text.lastIndexOf("?", index - 1) + 1);
    const sentenceEnd = (() => {
      const dot = text.slice(index).search(/[.!?]/);
      return dot === -1 ? Math.min(text.length, index + 180) : index + dot;
    })();
    const sentence = text.slice(sentenceStart, sentenceEnd);
    if (!/\b(?:giveaways?|sweepstakes|contests?|prizes?|weekly|promotion|giving away)\b/i.test(sentence)) continue;
    const parts = monthDayParts(match[1]);
    if (!parts) continue;
    const sentenceYear = /\b((?:19|20)\d{2})\b/.exec(sentence)?.[1];
    const year = yearForMonthDay(parts.month, parts.day, now, match[2] ? Number(match[2]) : sentenceYear ? Number(sentenceYear) : null);
    const iso = year === null ? null : validDate(year, parts.month, parts.day);
    if (iso) hits.push({ iso, index, weight: 1 });
  }
  return hits;
}

/** End dates the text states. A start date, a drawing date, and the later half of one range are not extra contests. */
export function contestEndDates(text: string, now: Date = new Date()): EndHit[] {
  const hits: EndHit[] = [];
  for (const match of text.matchAll(/\bend date\b\s*[:\-]?\s*([A-Za-z]{3,12}\.?\s+\d{1,2},\s+\d{4})/gi)) {
    const iso = isoMonthPhrase(match[1]);
    if (iso && match.index !== undefined) hits.push({ iso, index: match.index, weight: -1, kind: "overall" });
  }
  for (const match of text.matchAll(/([A-Za-z]{3,12}\.?\s+\d{1,2},\s+\d{4})\s+end date\b/gi)) {
    const iso = isoMonthPhrase(match[1]);
    if (iso && match.index !== undefined) hits.push({ iso, index: match.index, weight: -1, kind: "overall" });
  }
  const receivedBy = /\bentries must be received by\b(?:\s+\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?(?:\s+[A-Z]{2,4})?)?\s*(?:on\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]{3,12}\.?\s+\d{1,2},\s+\d{4})/gi;
  for (const match of text.matchAll(receivedBy)) {
    const index = match.index ?? 0;
    const clause = text.slice(Math.max(0, index - 160), Math.min(text.length, index + 140));
    if (/\b(?:mail(?:-?in)?|postmark(?:ed)?|method\s*#?\s*3)\b/i.test(clause)) continue;
    const raw = match[1] ?? "";
    const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw);
    const iso = numeric ? isoNumeric(+numeric[1], +numeric[2], numeric[3]) : isoMonthPhrase(raw);
    if (iso) hits.push({ iso, index, weight: -1, kind: "overall" });
  }
  const period = /\bto\s+(?:\d{1,2}:\d{2}\s*[ap]\.?m\.?(?:\s+[A-Z]{2,4})?\s+)?([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/gi;
  if (/\b(?:entry period|sweepstakes period|promotion period)\b/i.test(text)) {
    for (const match of text.matchAll(period)) {
      const iso = isoMonthPhrase(match[1]);
      if (!iso || match.index === undefined) continue;
      hits.push({ iso, index: match.index, weight: -1, kind: "overall" });
    }
  }
  const cue = /\b(?:ends at|ends|ended|ending|end date|deadline|closes|close date|expires|expiration|valid through|promotion period)\b/gi;
  for (const match of text.matchAll(cue)) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 16), index);
    if (/\b(?:drawn|drawing)\s*$/i.test(before)) continue;
    const weight = /^(?:ends|ended|ending|close date|closes)$/i.test(match[0]) ? 0 : 1;
    let window = text.slice(index + match[0].length, index + match[0].length + 160);
    window = window.replace(/^\s*[:\-]\s*/, "");
    if (/promotion period/i.test(match[0])) {
      const later = /ends[\s\S]{0,90}?([A-Za-z]+\.?\s+\d{1,2},\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i.exec(window);
      if (later) window = later[1];
    }
    const numericRange = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*(?:-|–|—|to|through)\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(window);
    if (numericRange) {
      const later = [isoNumeric(+numericRange[1], +numericRange[2], numericRange[3]), isoNumeric(+numericRange[4], +numericRange[5], numericRange[6])]
        .filter((iso): iso is string => Boolean(iso))
        .sort()
        .at(-1);
      if (later) hits.push({ iso: later, index, weight });
      continue;
    }
    const monthRange = /([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\s+(?:through|to|-)\s+([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/.exec(window);
    const drawingRange = monthRange && /\bdrawings?\b/i.test(window.slice(0, (monthRange.index ?? 0) + monthRange[0].length));
    if (monthRange && !drawingRange) {
      const later = [isoMonthPhrase(monthRange[1]), isoMonthPhrase(monthRange[2])].filter((iso): iso is string => Boolean(iso)).sort().at(-1);
      if (later) hits.push({ iso: later, index, weight });
      continue;
    }
    const month = /(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?(?:\s+(?:[A-Za-z]{3,12}\s+[Tt]ime|[A-Z]{2,4}))?\s+)?(?:on\s+)?([A-Za-z]{3,12}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4})/i.exec(window);
    if (month) {
      const iso = isoLooseMonth(month[1]);
      if (iso) {
        hits.push({ iso, index, weight });
        continue;
      }
    }
    const numeric = /(?:on\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/i.exec(window);
    if (numeric) {
      const iso = isoNumeric(+numeric[1], +numeric[2], numeric[3]);
      if (iso) hits.push({ iso, index, weight });
    }
  }
  return [...hits.map((hit) => tagEndHit(text, hit)), ...promotionThroughHits(text, now)];
}

/** The date words the text actually used, such as "Dec 31, 2026". Not a reformatted date. */
export function statedEndPhrase(text: string): string | null {
  const cue = /\b(?:ends|ended|ending|deadline|closes|close date|expires|expiration|valid through)\b/i.exec(text);
  if (!cue || cue.index === undefined) return null;
  const window = text.slice(cue.index + cue[0].length, cue.index + cue[0].length + 80);
  const month = /(?:on\s+)?([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/.exec(window);
  if (month) return month[1];
  const numeric = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/.exec(window);
  return numeric ? numeric[1] : null;
}

/** An end date the text states. The date nearest "ends", a close date, or the promotion period wins. Numeric dates are US month/day. */
export function statedEndIso(text: string, now: Date = new Date()): string | null {
  const titled = rulesTitleYear(text);
  const found = contestEndDates(text, now).filter((hit) => hit.kind !== "interim");
  const fresh = titled ? found.filter((hit) => Number(hit.iso.slice(0, 4)) >= titled) : found;
  const overall = fresh.filter((hit) => hit.kind === "overall");
  const pool = overall.length > 0 ? overall : fresh;
  if (pool.length > 0) {
    if (overall.length > 0) return [...pool].sort((left, right) => (left.iso < right.iso ? 1 : left.iso > right.iso ? -1 : 0))[0].iso;
    const best = [...pool].sort((left, right) => left.weight - right.weight || left.index - right.index)[0];
    return best.iso;
  }
  if (titled) return null;
  const yearEnded = /(?:\bended\b|\bhas ended\b|\bexpired\b|\bwas closed\b)(?:\s+\w+){0,4}\s+(?:in\s+|on\s+)?((?:19|20)\d{2})\b/i.exec(text);
  if (!yearEnded) return null;
  return `${yearEnded[1]}-12-31`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Ends Dec 3, 2026" for a calendar day the add-on extracted. */
export function formatAddonEnd(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = SHORT_MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  return `Ends ${month} ${day}, ${match[1]}`;
}

/** Row label. A past date says Ended instead of looking open. */
export function endTagLabel(isoDate: string, now: Date): string | null {
  const observed = formatObservedEnd(parseDueDate(isoDate), now);
  if (observed.dateLine === "End date not stated") return null;
  if (observed.relativeLine?.startsWith("Ended")) return observed.dateLine.replace(/^Ends /, "Ended ");
  return observed.dateLine;
}

export function daysUntil(proof: DueProof, now: Date): number | null {
  if (!proof.proven) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [year, month, day] = proof.isoDate.split("-").map(Number);
  const due = Date.UTC(year, month - 1, day);
  return Math.round((due - today) / 86_400_000);
}

export function daysLeftLabel(proof: DueProof, now: Date): string {
  const days = daysUntil(proof, now);
  if (days === null) return "End date not stated";
  if (days === 0) return "Ends today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "Ended 1 day ago";
  return `Ended ${Math.abs(days)} days ago`;
}

function monthDayYear(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

/** Two lines from an observed due proof. Unstated dates are not filled in. */
export function formatObservedEnd(proof: DueProof, now: Date): { dateLine: string; relativeLine: string | null } {
  if (!proof.proven) return { dateLine: "End date not stated", relativeLine: null };
  const date = monthDayYear(proof.isoDate);
  const time = proof.precision === "minute" ? /^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}))/.exec(proof.raw) : null;
  const dateLine = time ? `Ends ${date} ${time[2]} UTC` : `Ends ${date}`;
  return { dateLine, relativeLine: daysLeftLabel(proof, now) };
}

export function coarseMonth(proof: DueProof): string | null {
  return proof.proven ? proof.isoDate.slice(0, 7) : null;
}
