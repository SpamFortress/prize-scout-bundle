/** How often a free entry can be repeated, taken only from words on the rules page. */

export type EntryClock = "calendar_day" | "rolling_24h" | "weekly" | "once" | "unstated";

export const ASSUMED_RULES_ZONE = "America/New_York";
export const ASSUMED_ZONE_NOTE = "Rules don't name a time zone, so the next entry time is not calculated.";

export interface RulesZone {
  iana: string | null;
  assumed: boolean;
}

const ZONE_PATTERNS: Array<[RegExp, string]> = [
  [/\beastern\s+(?:standard|daylight\s+)?time\b|\b(?:EST|EDT)\b/i, "America/New_York"],
  [/\bcentral\s+(?:standard|daylight\s+)?time\b|\b(?:CST|CDT)\b/i, "America/Chicago"],
  [/\bmountain\s+(?:standard|daylight\s+)?time\b|\b(?:MST|MDT)\b/i, "America/Denver"],
  [/\bpacific\s+(?:standard|daylight\s+)?time\b|\b(?:PST|PDT)\b/i, "America/Los_Angeles"],
  [/\b(?:UTC|GMT)\b|\buniversal time\b/i, "UTC"],
];

const SHORT_ZONE: Record<string, string> = {
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PT: "America/Los_Angeles",
};

function shortZone(text: string): string | null {
  for (const match of text.matchAll(/\b(ET|CT|MT|PT)\b/g)) {
    const index = match.index ?? 0;
    const around = text.slice(Math.max(0, index - 16), index + match[0].length + 8);
    if (/,\s*[A-Z]{2}\b/.test(around) || /\b[A-Z]{2}\s*,/.test(around)) continue;
    const before = text.slice(Math.max(0, index - 24), index);
    if (/\d/.test(before) || /\btimes?\b/i.test(around)) return SHORT_ZONE[match[1]] ?? null;
  }
  return null;
}

/** The zone the rules name. When they name none, the zone is unknown. It is not filled in as Eastern Time. */
export function rulesTimeZone(text: string): RulesZone {
  for (const [pattern, iana] of ZONE_PATTERNS) {
    if (pattern.test(text)) return { iana, assumed: false };
  }
  const short = shortZone(text);
  if (short) return { iana: short, assumed: false };
  return { iana: null, assumed: true };
}

function zoneParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  let hour = Number(read("hour"));
  const day = Number(read("day"));
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(Number(read("year")), Number(read("month")) - 1, day, hour, Number(read("minute")), Number(read("second")));
  return asUtc - instant.getTime();
}

/** UTC instant of midnight on a calendar date in an IANA zone. DST is whatever that zone uses that morning. */
export function midnightInZone(year: number, month: number, day: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, 0, 0, 0);
  let instant = wall - zoneOffsetMs(new Date(wall), timeZone);
  instant = wall - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function entryClockFromText(text: string): EntryClock {
  if (/24[\s-]*hours?/i.test(text) && /entr/i.test(text)) return "rolling_24h";
  if (/calendar day|once per day|once a day|per day|daily entry|enter daily|\bdaily\b/i.test(text)) return "calendar_day";
  if (/once per week|once a week|per week|weekly/i.test(text)) return "weekly";
  if (/one entry per person|only one entry|limit of one entry|single entry/i.test(text)) return "once";
  return "unstated";
}

export function entryClockLabel(clock: EntryClock): string | null {
  if (clock === "calendar_day") return "Once per calendar day";
  if (clock === "rolling_24h") return "Once per 24 hours";
  if (clock === "weekly") return "Once per week";
  if (clock === "once") return "One entry only";
  return null;
}

export interface NextEntry {
  at: Date;
  zone: string;
  assumed: boolean;
  note: string | null;
}

/** Calendar-day and weekly resets use the rules' midnight. A 24-hour limit is measured from the confirmed submission. */
export function nextEligibleAt(clock: EntryClock, enteredAt: Date | null, zone: RulesZone = { iana: null, assumed: true }): NextEntry | null {
  if (!enteredAt || clock === "unstated" || clock === "once") return null;
  if (clock === "rolling_24h") return { at: new Date(enteredAt.getTime() + 24 * 60 * 60 * 1000), zone: zone.iana ?? "", assumed: false, note: null };
  if (!zone.iana) return null;
  const current = zoneParts(enteredAt, zone.iana);
  const step = clock === "weekly" ? 7 : 1;
  const next = addCalendarDays(current.year, current.month, current.day, step);
  return {
    at: midnightInZone(next.year, next.month, next.day, zone.iana),
    zone: zone.iana,
    assumed: zone.assumed,
    note: zone.assumed ? ASSUMED_ZONE_NOTE : null,
  };
}

/** Next entry shown in a viewer's zone. The instant itself does not change. */
export function formatInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export function isDailyClock(clock: EntryClock | null | undefined): boolean {
  return clock === "calendar_day" || clock === "rolling_24h";
}

export type ResetKind = "calendar" | "rolling" | "unknown";

/** Only facts the rules text actually states. A missing zone or hour count is not filled in. */
export interface ResetFact {
  kind: ResetKind;
  timeZone: string | null;
  rollingHours: number | null;
  /** 1 for a stated daily calendar reset, 7 for a stated weekly one. */
  calendarDays: number | null;
  quote: string | null;
}

const HOUR_COUNT = /(?:every|within|after|once per|per)\s+(\d{1,3})\s+hours?\b/i;
const CALENDAR_WORD = /calendar day|once per day|once a day|\bper day\b|daily entry|enter daily|at midnight|\bmidnight\b/i;
const WEEKLY_WORD = /once per week|once a week|\bper week\b|\bweekly\b/i;

function firstSentence(text: string, pattern: RegExp): string | null {
  const lines = text.split(/(?<=[.!?])\s+|\n+/);
  const line = lines.find((item) => pattern.test(item));
  if (!line) return null;
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

/** Reads a reset only from words on the page. It does not pick Eastern Time or 24 hours when those words are absent. */
export function resetFactFromText(text: string): ResetFact {
  const zone = rulesTimeZone(text);
  const namedZone = zone.assumed ? null : zone.iana;
  const hoursMatch = text.match(/(\d{1,3}) hours/i);
  const rollingHours = hoursMatch ? Number(hoursMatch[1]) : null;
  const rollingStated = rollingHours !== null && rollingHours > 0 && rollingHours <= 168 && /enter|entry|entrant|limit|person|sweep/i.test(text);
  const weekly = WEEKLY_WORD.test(text);
  const calendarStated = CALENDAR_WORD.test(text) || weekly;
  const calendarDays = weekly && !CALENDAR_WORD.test(text) ? 7 : calendarStated ? 1 : null;
  const quotePattern = rollingStated ? new RegExp(HOUR_COUNT.source, "i") : calendarStated ? (weekly ? WEEKLY_WORD : CALENDAR_WORD) : /$^/;
  const quote = firstSentence(text, quotePattern);
  if (calendarStated && rollingStated) {
    return { kind: "unknown", timeZone: namedZone, rollingHours, calendarDays, quote };
  }
  if (rollingStated) return { kind: "rolling", timeZone: null, rollingHours, calendarDays: null, quote };
  if (calendarStated && namedZone) return { kind: "calendar", timeZone: namedZone, rollingHours: null, calendarDays, quote };
  return { kind: "unknown", timeZone: namedZone, rollingHours: rollingStated ? rollingHours : null, calendarDays: null, quote };
}

export interface NextReset {
  at: string | null;
  needsChecking: boolean;
  note: string;
}

/** Unknown uses the later of a stated midnight and a stated hour count. It does not invent either one. */
export function nextResetAt(fact: ResetFact, enteredAt: Date | null): NextReset {
  const missing = "Needs checking: the rules do not state whether the next entry is a calendar midnight or a number of hours after the last entry.";
  if (!enteredAt) {
    return { at: null, needsChecking: fact.kind === "unknown", note: fact.kind === "unknown" ? missing : "" };
  }
  const rolling = fact.rollingHours ? new Date(enteredAt.getTime() + fact.rollingHours * 60 * 60 * 1000) : null;
  const calendar = fact.timeZone && fact.calendarDays
    ? nextEligibleAt(fact.calendarDays === 7 ? "weekly" : "calendar_day", enteredAt, { iana: fact.timeZone, assumed: false })
    : null;
  if (fact.kind === "rolling" && rolling) return { at: rolling.toISOString(), needsChecking: false, note: "" };
  if (fact.kind === "calendar" && calendar) return { at: calendar.at.toISOString(), needsChecking: false, note: "" };
  if (rolling && calendar) {
    const later = rolling.getTime() >= calendar.at.getTime() ? rolling : calendar.at;
    return {
      at: later.toISOString(),
      needsChecking: true,
      note: "Needs checking: the rules name both a calendar reset and an hour count, so the later time is shown.",
    };
  }
  if (rolling || calendar) {
    return {
      at: (rolling ?? calendar!.at).toISOString(),
      needsChecking: true,
      note: missing,
    };
  }
  return { at: null, needsChecking: true, note: missing };
}
