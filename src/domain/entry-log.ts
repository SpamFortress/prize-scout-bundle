import type { RedactedEntryHandoff } from "./fortress";

/** The only fields kept after a confirmed entry. */
export interface EntryLogRecord {
  sponsor: string;
  contestUrl: string;
  entryDate: string;
  aliasOrTag: string;
  rulesUrl: string | null;
  endDate: string | null;
}

const SECRET = /\b\d{3}-\d{2}-\d{4}\b|\b(?:password|passcode|one-time code|2fa|otp|ssn|social security|government id|driver'?s license|tax form|w-2|1099)\b|\b(?:\d[ -]?){13,19}\b/i;
const DOB_IN_PROSE = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\bdate of birth\b|\bdob\b/i;
const DOB_WORDS = /\bdate of birth\b|\bdob\b/i;

function prose(input: EntryLogRecord): string {
  return [input.sponsor, input.aliasOrTag, input.contestUrl, input.rulesUrl ?? ""].join("\n");
}

export function entryLogRecord(input: EntryLogRecord): { ok: true; record: EntryLogRecord } | { ok: false; reason: string } {
  const dates = `${input.entryDate}\n${input.endDate ?? ""}`;
  if (SECRET.test(prose(input)) || SECRET.test(dates)) return { ok: false, reason: "An entry log cannot store a secret, an ID number, or a tax form." };
  if (DOB_IN_PROSE.test(prose(input)) || DOB_WORDS.test(dates)) return { ok: false, reason: "A full date of birth is not stored in app data." };
  if (!input.sponsor.trim() || !input.contestUrl.startsWith("https://") || !input.entryDate) {
    return { ok: false, reason: "Sponsor, contest URL, and entry date are required." };
  }
  return {
    ok: true,
    record: {
      sponsor: input.sponsor.trim().slice(0, 160),
      contestUrl: input.contestUrl,
      entryDate: input.entryDate,
      aliasOrTag: input.aliasOrTag.trim().slice(0, 254),
      rulesUrl: input.rulesUrl,
      endDate: input.endDate,
    },
  };
}

/** App wait used only when the rules do not state how long winners have to be notified. */
export const ASSUMED_NOTICE_DAYS = 30;

export function winnerNoticeDays(text: string): { days: number; assumed: boolean } {
  const match = /(?:winners?|notif(?:y|ied|ication))[^.]{0,80}\bwithin\s+(\d{1,3})\s+days/i.exec(text);
  if (!match) return { days: ASSUMED_NOTICE_DAYS, assumed: true };
  return { days: Number(match[1]), assumed: false };
}

export function cleanupReadyAt(endDate: string, noticeDays: number): Date | null {
  const end = Date.parse(endDate.length === 10 ? `${endDate}T00:00:00.000Z` : endDate);
  if (!Number.isFinite(end)) return null;
  return new Date(end + noticeDays * 24 * 60 * 60 * 1000);
}

/** Prepared only. Matches the skill's contest_handoff plus a separate alias_registration. Nothing here is sent. */
export interface PreparedContestHandoff {
  protocol: "prize-scout-fortress-handoff";
  message_type: "contest_handoff";
  lane: "email";
  userAuthorized: false;
  automatic_send: false;
  sent: false;
  delivered: false;
  contest: {
    contest_id: string;
    contest_label: string;
    sponsor: string;
    publicContestUrl: string;
    rulesUrl: string | null;
    entry_status: "entered";
    entry_date: string;
    end_date: string | null;
  };
  alias_registration: {
    message_type: "alias_registration";
    aliasConsent: false;
    userAuthorized: false;
    automatic_send: false;
    alias: string;
  };
}

/** Prepared after the end date and the notice window. Nothing is sent. */
export function prepareContestHandoff(record: EntryLogRecord, now: Date, noticeDays: number): PreparedContestHandoff | null {
  if (!record.endDate) return null;
  const ready = cleanupReadyAt(record.endDate, noticeDays);
  if (!ready || now.getTime() < ready.getTime()) return null;
  const handoff: PreparedContestHandoff = {
    protocol: "prize-scout-fortress-handoff",
    message_type: "contest_handoff",
    lane: "email",
    userAuthorized: false,
    automatic_send: false,
    sent: false,
    delivered: false,
    contest: {
      contest_id: record.contestUrl,
      contest_label: record.sponsor,
      sponsor: record.sponsor,
      publicContestUrl: record.contestUrl,
      rulesUrl: record.rulesUrl,
      entry_status: "entered",
      entry_date: record.entryDate,
      end_date: record.endDate,
    },
    alias_registration: {
      message_type: "alias_registration",
      aliasConsent: false,
      userAuthorized: false,
      automatic_send: false,
      alias: record.aliasOrTag,
    },
  };
  const aliasBlob = handoff.alias_registration.alias;
  const contestBlob = JSON.stringify(handoff.contest);
  if (SECRET.test(aliasBlob) || SECRET.test(contestBlob) || DOB_IN_PROSE.test(aliasBlob) || DOB_WORDS.test(contestBlob)) return null;
  return handoff;
}

/** Keeps the existing redacted handoff from carrying the raw alias. */
export function redactedAliasFlag(alias: string): Pick<RedactedEntryHandoff, "aliasApproved" | "emailSupplied" | "personalData"> {
  return { aliasApproved: alias.includes("+"), emailSupplied: alias.includes("@") ? true : "unknown", personalData: null };
}
