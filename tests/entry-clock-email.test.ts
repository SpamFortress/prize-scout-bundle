import { describe, expect, it } from "vitest";
import { formatInZone, nextEligibleAt, rulesTimeZone } from "@/domain/entry-clock";
import { PERSONAL_EMAIL_WARNING, sponsorTag, supportsPlusAddressing, taggedEmail } from "@/domain/entry-email";
import { ASSUMED_NOTICE_DAYS, entryLogRecord, prepareContestHandoff, winnerNoticeDays } from "@/domain/entry-log";
import { observeHtml } from "@/domain/interpret";
import { prefillBookmarklet } from "@/domain/prefill";

const ENTERED = new Date("2026-11-10T15:00:00.000Z");

describe("rules time zones", () => {
  it("maps named zones and abbreviations, including a state-list that mentions CT", () => {
    expect(rulesTimeZone("Ends 11:59 p.m. Eastern Time.")).toEqual({ iana: "America/New_York", assumed: false });
    expect(rulesTimeZone("Deadline 11:59 p.m. EST.").iana).toBe("America/New_York");
    expect(rulesTimeZone("Deadline 11:59 p.m. EDT.").iana).toBe("America/New_York");
    expect(rulesTimeZone("Draw at 8:00 p.m. ET.").iana).toBe("America/New_York");
    expect(rulesTimeZone("All times are ET.").assumed).toBe(false);
    expect(rulesTimeZone("All times are ET.").iana).toBe("America/New_York");
    expect(rulesTimeZone("Close 11:59 p.m. CT.").iana).toBe("America/Chicago");
    expect(rulesTimeZone("Central Time.").iana).toBe("America/Chicago");
    expect(rulesTimeZone("11:59 p.m. CST.").iana).toBe("America/Chicago");
    expect(rulesTimeZone("11:59 p.m. CDT.").iana).toBe("America/Chicago");
    expect(rulesTimeZone("11:59 p.m. MT.").iana).toBe("America/Denver");
    expect(rulesTimeZone("Mountain Time.").iana).toBe("America/Denver");
    expect(rulesTimeZone("11:59 p.m. MST.").iana).toBe("America/Denver");
    expect(rulesTimeZone("11:59 p.m. MDT.").iana).toBe("America/Denver");
    expect(rulesTimeZone("11:59 p.m. PT.").iana).toBe("America/Los_Angeles");
    expect(rulesTimeZone("Pacific Time.").iana).toBe("America/Los_Angeles");
    expect(rulesTimeZone("11:59 p.m. PST.").iana).toBe("America/Los_Angeles");
    expect(rulesTimeZone("11:59 p.m. PDT.").iana).toBe("America/Los_Angeles");
    expect(rulesTimeZone("All times UTC.").iana).toBe("UTC");
    expect(rulesTimeZone("Void in NY, CT, and FL.").assumed).toBe(true);
    expect(rulesTimeZone("Void in NY, CT, and FL.").iana).toBeNull();
    expect(rulesTimeZone("One entry per day.").assumed).toBe(true);
    expect(rulesTimeZone("One entry per day.").iana).toBeNull();
  });

  it("resets calendar day and weekly at midnight in the rules zone, including the DST boundary", () => {
    const eastern = { iana: "America/New_York", assumed: false };
    expect(nextEligibleAt("calendar_day", ENTERED, { iana: null, assumed: true })).toBeNull();
    expect(nextEligibleAt("weekly", ENTERED, { iana: null, assumed: true })).toBeNull();
    expect(nextEligibleAt("calendar_day", ENTERED, eastern)?.at.toISOString()).toBe("2026-11-11T05:00:00.000Z");
    expect(nextEligibleAt("calendar_day", ENTERED, { iana: "America/Chicago", assumed: false })?.at.toISOString()).toBe("2026-11-11T06:00:00.000Z");
    expect(nextEligibleAt("calendar_day", ENTERED, { iana: "America/Denver", assumed: false })?.at.toISOString()).toBe("2026-11-11T07:00:00.000Z");
    expect(nextEligibleAt("calendar_day", ENTERED, { iana: "America/Los_Angeles", assumed: false })?.at.toISOString()).toBe("2026-11-11T08:00:00.000Z");
    expect(nextEligibleAt("calendar_day", ENTERED, { iana: "UTC", assumed: false })?.at.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(nextEligibleAt("weekly", ENTERED, eastern)?.at.toISOString()).toBe("2026-11-17T05:00:00.000Z");
    const spring = new Date("2026-03-08T06:30:00.000Z");
    expect(nextEligibleAt("calendar_day", spring, eastern)?.at.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    const fall = new Date("2026-11-01T05:30:00.000Z");
    expect(nextEligibleAt("calendar_day", fall, eastern)?.at.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(nextEligibleAt("rolling_24h", ENTERED, eastern)?.at.toISOString()).toBe("2026-11-11T15:00:00.000Z");
    expect(nextEligibleAt("rolling_24h", ENTERED, eastern)?.note).toBeNull();
    const local = formatInZone(nextEligibleAt("calendar_day", ENTERED, eastern)!.at, "America/Los_Angeles");
    expect(local).toContain("Nov 10");
    expect(local).toMatch(/PM|PST|PDT|PT/);
    const page = observeHtml("<html><head><title>Daily pot</title></head><body><p>One entry per day. Deadline 11:59 p.m. PT. Winners notified within 10 days.</p></body></html>", "https://example.com/daily", ENTERED);
    expect(page.ok && page.contest.rulesTimeZone).toEqual({ iana: "America/Los_Angeles", assumed: false });
    expect(page.ok && page.contest.winnerNotice).toEqual({ days: 10, assumed: false });
  });
});

describe("sponsor email tags", () => {
  it("keeps one plus tag per sponsor and falls back when plus is rejected", () => {
    const acme = taggedEmail("ada@gmail.com", "Acme Cookware");
    const acmeAgain = taggedEmail("ada@gmail.com", "Acme Cookware");
    const other = taggedEmail("ada@gmail.com", "Other Sponsor");
    expect(acme.email).toBe(acmeAgain.email);
    expect(acme.email).not.toBe(other.email);
    expect(acme.email.startsWith("ada+")).toBe(true);
    expect(sponsorTag("Acme Cookware")).not.toBe(sponsorTag("Other Sponsor"));
    expect(sponsorTag("Acme Cookware Extra")).not.toBe(sponsorTag("Acme Cookware Extra!"));
    expect(supportsPlusAddressing("ada@example.com")).toBe(false);
    expect(taggedEmail("ada@example.com", "Acme").email).toBe("ada@example.com");
    const rejected = taggedEmail("ada@gmail.com", "Acme Cookware", true);
    expect(rejected.email).toBe("ada@gmail.com");
    expect(rejected.note).toMatch(/untagged/);
    expect(PERSONAL_EMAIL_WARNING).toMatch(/sold/);
    const bookmarklet = prefillBookmarklet({ name: "A", email: acme.email, phone: "1", address: "1", city: "B", state: "ID", zip: "83702", dob: "1990-01-15" });
    expect(bookmarklet).toContain(acme.email);
    expect(bookmarklet).toContain("1990-01-15");
  });
});

describe("trimmed entry log", () => {
  it("keeps only the allowed fields and prepares a handoff without sending it", () => {
    const saved = entryLogRecord({
      sponsor: "Acme Cookware",
      contestUrl: "https://acme.example/enter",
      entryDate: "2026-11-10",
      aliasOrTag: "ada+acmecookware@gmail.com",
      rulesUrl: "https://acme.example/rules",
      endDate: "2026-11-12",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(Object.keys(saved.record).sort()).toEqual(["aliasOrTag", "contestUrl", "endDate", "entryDate", "rulesUrl", "sponsor"]);
    expect(entryLogRecord({ ...saved.record, aliasOrTag: "123-45-6789" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, sponsor: "password reset" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, aliasOrTag: "otp 482913" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, aliasOrTag: "4111111111111111" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, sponsor: "government id scan" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, sponsor: "attach a W-2" }).ok).toBe(false);
    expect(entryLogRecord({ ...saved.record, aliasOrTag: "born 1990-01-15" }).ok).toBe(false);
    expect(winnerNoticeDays("Winners will be notified within 10 days.").days).toBe(10);
    expect(winnerNoticeDays("No notice window.").assumed).toBe(true);
    expect(winnerNoticeDays("No notice window.").days).toBe(ASSUMED_NOTICE_DAYS);
    expect(prepareContestHandoff(saved.record, new Date("2026-11-20T00:00:00.000Z"), 10)).toBeNull();
    const ready = prepareContestHandoff(saved.record, new Date("2026-12-20T00:00:00.000Z"), 10);
    expect(ready?.sent).toBe(false);
    expect(ready?.delivered).toBe(false);
    expect(ready?.automatic_send).toBe(false);
    expect(ready?.message_type).toBe("contest_handoff");
    expect(ready?.contest.sponsor).toBe("Acme Cookware");
    expect(ready?.contest.rulesUrl).toBe("https://acme.example/rules");
    expect(ready?.contest.entry_date).toBe("2026-11-10");
    expect(ready?.contest.end_date).toBe("2026-11-12");
    expect(ready?.alias_registration.alias).toContain("+");
    expect(ready?.alias_registration.aliasConsent).toBe(false);
    expect(ready?.alias_registration.userAuthorized).toBe(false);
    expect(ready?.alias_registration.automatic_send).toBe(false);
    expect(ready?.userAuthorized).toBe(false);
    expect(ready?.lane).toBe("email");
    expect(JSON.stringify(ready)).not.toMatch(/ssn|password|1990-01-15/i);
    expect(prepareContestHandoff({ ...saved.record, aliasOrTag: "123-45-6789" }, new Date("2026-12-20T00:00:00.000Z"), 10)).toBeNull();
  });
});
