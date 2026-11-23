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
