import { nextEligibleAt, type EntryClock, type RulesZone } from "./entry-clock";

/** A tracked contest. Dates are copied from the page. A missing end date is null, not a guess. */
export interface CalendarContest {
  uid: string;
  title: string;
  url: string;
  /** YYYY-MM-DD when the rules state an end date. */
  endDate: string | null;
  /** HH:mm:ss when the rules state a clock time. Null means an all-day date. */
  endTime: string | null;
  /** IANA zone named by the rules. Null means the rules did not name one. */
  timeZone: string | null;
  entryClock: EntryClock;
  enteredAt: Date | null;
}

export function calendarHasEnd(item: CalendarContest): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(item.endDate ?? "");
}

export function calendarButtonLabel(item: CalendarContest): string {
  return calendarHasEnd(item) ? "Add to calendar" : "End date needs checking";
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\n|\r/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** RFC 5545 fold: no line longer than 75 octets. A fold is CRLF plus one space. */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + limit);
    while (end > start && (bytes[end - 1] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(bytes.length, start + limit);
    parts.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

function stamp(now: Date): string {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return iso;
}

function dateStamp(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}${m}${d}`;
}

function clockStamp(time: string): string {
  const [hour = "00", minute = "00", second = "00"] = time.split(":");
  return `${hour.padStart(2, "0")}${minute.padStart(2, "0")}${second.padStart(2, "0")}`;
}

function description(item: CalendarContest, extra: string): string {
  const zone = item.timeZone ? `Rules time zone: ${item.timeZone}.` : "time zone not stated";
  return escapeText([item.title, item.url, zone, extra].filter((part) => part.length > 0).join("\n"));
}

function event(lines: string[]): string[] {
  return ["BEGIN:VEVENT", ...lines.map(foldIcsLine), "END:VEVENT"];
}

function endEvent(item: CalendarContest, now: Date): string[] | null {
  if (!calendarHasEnd(item) || !item.endDate) return null;
  const day = dateStamp(item.endDate);
  const summary = escapeText(`${item.title} ends`);
  const desc = description(item, "End date stated on the official page.");
  const timed = Boolean(item.endTime);
  const start = timed
    ? item.timeZone
      ? `DTSTART;TZID=${item.timeZone}:${day}T${clockStamp(item.endTime ?? "00:00:00")}`
      : `DTSTART:${day}T${clockStamp(item.endTime ?? "00:00:00")}Z`
    : `DTSTART;VALUE=DATE:${day}`;
  const end = timed ? null : `DTEND;VALUE=DATE:${nextDay(item.endDate)}`;
  return event([
    `UID:prize-scout-${item.uid}-end@prizescout.local`,
    `DTSTAMP:${stamp(now)}`,
    start,
    ...(end ? [end] : []),
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `URL:${item.url}`,
  ]);
}

function reentryEvent(item: CalendarContest, now: Date): string[] | null {
  if (item.entryClock !== "calendar_day" && item.entryClock !== "weekly" && item.entryClock !== "rolling_24h") return null;
  const zone: RulesZone = { iana: item.timeZone, assumed: item.timeZone === null };
  const next = nextEligibleAt(item.entryClock, item.enteredAt, zone);
  if (!next) return null;
  const when = next.at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = next.zone
    ? `DTSTART;TZID=${next.zone}:${formatInZoneStamp(next.at, next.zone)}`
    : `DTSTART:${when}`;
  return event([
    `UID:prize-scout-${item.uid}-reentry@prizescout.local`,
    `DTSTAMP:${stamp(now)}`,
    start,
    `SUMMARY:${escapeText(`Next entry: ${item.title}`)}`,
    `DESCRIPTION:${description(item, "Next entry uses the reset stated in the rules.")}`,
    `URL:${item.url}`,
  ]);
}

function formatInZoneStamp(instant: Date, timeZone: string): string {
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
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  let hour = read("hour");
  if (hour === "24") hour = "00";
  return `${read("year")}${read("month")}${read("day")}T${hour}${read("minute")}${read("second")}`;
}

/** One RFC 5545 calendar. Contests with no stated end date contribute no end event. */
export function buildCalendar(items: readonly CalendarContest[], now: Date): string {
  const body = items.flatMap((item) => [...(endEvent(item, now) ?? []), ...(reentryEvent(item, now) ?? [])]);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prize Scout//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...body, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

export function downloadCalendar(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
